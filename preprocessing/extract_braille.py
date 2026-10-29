import argparse
from pathlib import Path
import cv2
import numpy as np

# ===========================================================================
# SECTION 1: EXTRACTION CONFIGURATION
# ===========================================================================
EXTRACTION_CONFIG = {
    "close_kernel_size": 7,
    "min_area_abs": 15.0,
    "min_area_frac": 0.15,
    "peak_threshold_frac": 0.03,
    "row_min_width_frac": 0.01,
    "row_min_dot_count": 1,
    "crease_area_mult": 8.0,
    "crease_aspect_min": 5.0,

    # --- Shape check (only for blobs that hold a single dot) ---
    "min_circularity": 0.35,
    "min_solidity": 0.45,
    "single_aspect_max": 3.0,

    # --- Ink / pen / fold blob filter (only touches long blobs) ---
    "ink_long_mult": 3.5,        # blob longer than dot_dim * this is a candidate
    "ink_aspect_min": 2.5,       # ...and stretched
    "ink_solidity_max": 0.6,     # ...or letter / ring shaped
    "ink_fill_max": 0.3,         # ...or bounding box mostly empty

    # --- Per-dot check ---
    "min_peak_radius_frac": 0.35,  # dark area under a dot must be at least this x dot radius
    "highlight_min_delta": 8,      # brighter than paper by this much = highlight pixel
    "highlight_min_pixels": 3,     # highlight pixels needed beside a dot (any side)
    "highlight_reach_frac": 1.5,   # how far from the dot to look = dot_dim * this
}

# ===========================================================================
# SECTION 2: RENDERING CONFIGURATION
# ===========================================================================
RENDERING_CONFIG = {
    "dot_radius_frac": 0.45,
    "shadow_offset": (4, 4),
    "shadow_blur_sigma": 3.5,
    "shadow_strength": 0.9,
    "highlight_offset": (-4, -4),
    "highlight_blur_sigma": 2.0,
    "highlight_ratio": 0.65,
    "dot_core_darken": 0.6,
    "dot_edge_feather": 2.0,
    "target_strength": 160.0,
    "background_color": (210, 215, 220),
}

# ===========================================================================
# SECTION 3: ADAPTIVE LIGHTING ANALYSIS
# ===========================================================================
def analyze_lighting(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    flatten_gray = gray.flatten()
    flatten_gray.sort()
    top_30_percent = flatten_gray[int(len(flatten_gray) * 0.7):]
    paper_brightness = np.mean(top_30_percent)

    print(f"  -> Detected Paper Brightness: {paper_brightness:.1f}/255")

    multipliers = {
        "highlight": 1.4,
        "shadow": 1.0,
        "core": 1.0
    }

    if paper_brightness > 200:
        print("  -> Condition: Bright Paper. Emphasizing Highlights heavily.")
        multipliers["highlight"] = 2.0
        multipliers["shadow"] = 0.3
        multipliers["core"] = 0.5
    elif paper_brightness < 140:
        print("  -> Condition: Dark Paper. Boosting Highlights for visibility.")
        multipliers["highlight"] = 1.6
        multipliers["shadow"] = 0.8
        multipliers["core"] = 0.8
    else:
        print("  -> Condition: Normal Lighting. Emphasizing Highlights.")

    return multipliers

# ===========================================================================
# SECTION 4: EXTRACTION FUNCTIONS
# ===========================================================================
def _estimate_dot_size(mask):
    num, _, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    areas = np.array([stats[i, cv2.CC_STAT_AREA] for i in range(1, num)
                        if stats[i, cv2.CC_STAT_AREA] > 3])
    if len(areas) == 0:
        return 8.0
    cutoff = np.percentile(areas, 40)
    dims = [max(stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT])
            for i in range(1, num)
            if 3 < stats[i, cv2.CC_STAT_AREA] <= cutoff]
    if dims:
        return float(np.median(dims))
    return float(np.sqrt(np.median(areas)))

def _find_local_maxima(dist_transform, min_distance, threshold_abs):
    if dist_transform.max() <= 0:
        return np.empty((0, 2), dtype=np.float32)
    k = max(3, int(round(min_distance)) | 1)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    dilated = cv2.dilate(dist_transform, kernel)
    is_peak = (dist_transform >= dilated - 1e-6) & (dist_transform > threshold_abs)
    ys, xs = np.where(is_peak)
    if len(xs) == 0:
        return np.empty((0, 2), dtype=np.float32)
    pts = np.stack([xs, ys], axis=1).astype(np.float32)
    vals = dist_transform[ys, xs].astype(np.float32)
    order = np.argsort(-vals)
    pts = pts[order]
    kept = []
    min_d2 = float(min_distance) ** 2
    for p in pts:
        ok = True
        for q in kept:
            dx = p[0] - q[0]
            dy = p[1] - q[1]
            if dx * dx + dy * dy < min_d2:
                ok = False
                break
        if ok:
            kept.append(p)
    if not kept:
        return np.empty((0, 2), dtype=np.float32)
    return np.array(kept, dtype=np.float32)

def _dedupe_peaks(peaks, min_distance):
    if len(peaks) <= 1:
        return peaks
    kept = []
    min_d2 = float(min_distance) ** 2
    for p in peaks:
        ok = True
        for q in kept:
            dx = p[0] - q[0]
            dy = p[1] - q[1]
            if dx * dx + dy * dy < min_d2:
                ok = False
                break
        if ok:
            kept.append(p)
    if not kept:
        return np.empty((0, 2), dtype=np.float32)
    return np.array(kept, dtype=np.float32)

# ===========================================================================
# NON-BRAILLE FILTERS (folds, pen letters, pen circles)
# ===========================================================================
def _estimate_paper(gray, dot_dim):
    """Paper brightness that ignores small dark marks (ink, dots)."""
    h, w = gray.shape
    scale = 1 if max(h, w) < 600 else 4
    small = gray if scale == 1 else cv2.resize(
        gray, None, fx=1.0 / scale, fy=1.0 / scale, interpolation=cv2.INTER_AREA)
    k = int(max(15, dot_dim * 6 / scale)) | 1
    paper = cv2.medianBlur(small, k)
    if scale != 1:
        paper = cv2.resize(paper, (w, h), interpolation=cv2.INTER_LINEAR)
    return paper

def remove_ink_blobs(mask, dot_dim, config):
    """
    Removes blobs that are clearly ink or folds: long AND (stretched or
    ring/letter shaped). Dot-sized blobs and small clusters are never touched.
    """
    num, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    h, w = mask.shape
    out = mask.copy()

    for i in range(1, num):
        x = stats[i, cv2.CC_STAT_LEFT]
        y = stats[i, cv2.CC_STAT_TOP]
        bw = stats[i, cv2.CC_STAT_WIDTH]
        bh = stats[i, cv2.CC_STAT_HEIGHT]
        area = stats[i, cv2.CC_STAT_AREA]

        if max(bw, bh) <= dot_dim * config["ink_long_mult"]:
            continue  # short blob: could be a dot or a dot cluster, keep

        comp = (labels[y:y + bh, x:x + bw] == i).astype(np.uint8)
        pts = cv2.findNonZero(comp)
        if pts is None:
            continue

        (_, (rw, rh), _) = cv2.minAreaRect(pts)
        long_side = max(rw, rh)
        short_side = max(1.0, min(rw, rh))
        aspect = long_side / short_side

        hull_area = max(1.0, cv2.contourArea(cv2.convexHull(pts)))
        solidity = area / hull_area
        fill = area / max(1.0, float(bw * bh))

        if (aspect >= config["ink_aspect_min"]
                or solidity < config["ink_solidity_max"]
                or fill < config["ink_fill_max"]):
            out[y:y + bh, x:x + bw][comp > 0] = 0

    return out

def _single_dot_shape_ok(label_id, labels, stats, config, img_h, img_w):
    """Shape check, used only when a blob holds exactly one dot."""
    x_b = stats[label_id, cv2.CC_STAT_LEFT]
    y_b = stats[label_id, cv2.CC_STAT_TOP]
    w_b = stats[label_id, cv2.CC_STAT_WIDTH]
    h_b = stats[label_id, cv2.CC_STAT_HEIGHT]
    area = stats[label_id, cv2.CC_STAT_AREA]

    if max(w_b, h_b) / max(1.0, min(w_b, h_b)) > config["single_aspect_max"]:
        return False

    x1, y1 = max(0, x_b - 1), max(0, y_b - 1)
    x2, y2 = min(img_w, x_b + w_b + 1), min(img_h, y_b + h_b + 1)
    local_mask = (labels[y1:y2, x1:x2] == label_id).astype(np.uint8) * 255
    contours, _ = cv2.findContours(local_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return False

    cnt = max(contours, key=cv2.contourArea)
    perimeter = cv2.arcLength(cnt, True)
    circularity = 4 * np.pi * (area / (perimeter ** 2)) if perimeter > 0 else 0
    if circularity < config["min_circularity"]:
        return False

    hull_area = cv2.contourArea(cv2.convexHull(cnt))
    solidity = area / hull_area if hull_area > 0 else 0
    return solidity >= config["min_solidity"]

def _validate_peaks(peaks, mask, dist_transform, bright, dot_dim, config):
    """
    Keeps a peak only if:
      1. the dark area under it is thick enough to be a dot (not a thin line),
      2. if its blob holds only this one dot, the blob is dot-shaped,
      3. there is a white highlight beside it, on any side.
    """
    if len(peaks) == 0:
        return peaks

    h, w = mask.shape
    num, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)

    # how many peaks sit in each blob
    peak_labels = []
    for x, y in peaks:
        xi = int(np.clip(round(x), 0, w - 1))
        yi = int(np.clip(round(y), 0, h - 1))
        peak_labels.append(labels[yi, xi])
    counts = np.bincount(np.array(peak_labels), minlength=num)

    reach = max(6.0, dot_dim * config["highlight_reach_frac"])
    min_r = (dot_dim / 2.0) * config["min_peak_radius_frac"]
    hl = bright > config["highlight_min_delta"]

    keep = []
    for (x, y), lab_id in zip(peaks, peak_labels):
        xi = int(np.clip(round(x), 0, w - 1))
        yi = int(np.clip(round(y), 0, h - 1))

        if lab_id == 0:
            keep.append(False)
            continue

        r_peak = float(dist_transform[yi, xi])
        if r_peak < min_r:
            keep.append(False)
            continue

        if counts[lab_id] == 1 and not _single_dot_shape_ok(lab_id, labels, stats, config, h, w):
            keep.append(False)
            continue

        R = int(np.ceil(r_peak + reach))
        x0, x1 = max(0, xi - R), min(w, xi + R + 1)
        y0, y1 = max(0, yi - R), min(h, yi + R + 1)
        yy, xx = np.ogrid[y0:y1, x0:x1]
        within = (xx - xi) ** 2 + (yy - yi) ** 2 <= R * R
        cand = hl[y0:y1, x0:x1] & within & (mask[y0:y1, x0:x1] == 0)
        keep.append(np.count_nonzero(cand) >= config["highlight_min_pixels"])

    return peaks[np.array(keep, dtype=bool)]

def extract_dot_coordinates(image, config):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    local_background = cv2.GaussianBlur(gray, (0, 0), sigmaX=7)
    relief = cv2.subtract(local_background, gray)
    relief = cv2.normalize(relief, None, 0, 255, cv2.NORM_MINMAX)
    otsu_t, _ = cv2.threshold(relief, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    _, mask = cv2.threshold(relief, int(otsu_t), 255, cv2.THRESH_BINARY)

    h, w = gray.shape
    mask[:int(h * 0.04), :] = 0

    k_size = config["close_kernel_size"]
    close_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_size, k_size))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, close_kernel)

    num, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    clean_mask = np.zeros_like(mask)
    expected_diameter = w * 0.0075
    expected_area = np.pi * ((expected_diameter / 2.0) ** 2)
    min_area = max(config["min_area_abs"], expected_area * config["min_area_frac"])

    for i in range(1, num):
        if stats[i, cv2.CC_STAT_AREA] >= min_area:
            clean_mask[labels == i] = 255
    mask = clean_mask

    num, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    valid_areas = [stats[i, cv2.CC_STAT_AREA] for i in range(1, num) if stats[i, cv2.CC_STAT_AREA] > 3]

    if valid_areas:
        median_area = np.median(valid_areas)
        for i in range(1, num):
            area = stats[i, cv2.CC_STAT_AREA]
            if area <= (median_area * config["crease_area_mult"]):
                continue
            bw = stats[i, cv2.CC_STAT_WIDTH]
            bh = stats[i, cv2.CC_STAT_HEIGHT]
            aspect = max(bw, bh) / max(1.0, min(bw, bh))
            if aspect >= config["crease_aspect_min"]:
                mask[labels == i] = 0

    # Dot size is measured from the smallest blobs, so ink does not affect it
    dot_dim = _estimate_dot_size(mask)

    # --- NEW: remove long ink / fold blobs ---
    mask = remove_ink_blobs(mask, dot_dim, config)

    dist_transform = cv2.distanceTransform(mask, cv2.DIST_L2, 3)
    min_distance = max(4.0, dot_dim * 1.2)
    threshold_abs = max(0.05, (dot_dim / 2.0) * config["peak_threshold_frac"])
    peaks = _find_local_maxima(dist_transform, min_distance, threshold_abs)

    # --- NEW: per-dot validation ---
    paper = _estimate_paper(gray, dot_dim)
    bright = cv2.subtract(gray, paper)
    peaks = _validate_peaks(peaks, mask, dist_transform, bright, dot_dim, config)

    row_h_kernel = max(3, int(w * 0.05))
    row_v_kernel = max(3, int(h * 0.015))
    row_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (row_h_kernel, row_v_kernel))
    row_bands = cv2.dilate(mask, row_kernel)
    num_bands, band_labels, band_stats, _ = cv2.connectedComponentsWithStats(row_bands, 8)
    band_dot_counts = np.zeros(num_bands, dtype=int)
    peak_bands = np.zeros(len(peaks), dtype=int)

    for idx, (x, y) in enumerate(peaks):
        xi = int(np.clip(round(x), 0, w - 1))
        yi = int(np.clip(round(y), 0, h - 1))
        band_id = band_labels[yi, xi]
        peak_bands[idx] = band_id
        band_dot_counts[band_id] += 1

    min_row_width = w * config["row_min_width_frac"]
    valid_band_ids = {b for b in range(1, num_bands)
        if band_stats[b, cv2.CC_STAT_WIDTH] >= min_row_width
        and band_dot_counts[b] >= config["row_min_dot_count"]}

    if len(peaks):
        keep = np.array([b in valid_band_ids for b in peak_bands])
        peaks = peaks[keep]

    if len(peaks) > 1:
        final_min_distance = max(5.0, dot_dim * 1.3)
        peaks = _dedupe_peaks(peaks, final_min_distance)

    return peaks, dot_dim

# ===========================================================================
# SECTION 5: RENDERING FUNCTIONS
# ===========================================================================
def render_dots_texture(shape, peaks, dot_dim, config, multipliers):
    h, w = shape[:2]
    standard_radius = int(round(config["dot_radius_frac"] * dot_dim))
    standard_radius = max(4, min(standard_radius, 14))

    round_mask = np.zeros((h, w), dtype=np.float32)
    for x, y in peaks:
        cv2.circle(round_mask, (int(round(x)), int(round(y))), standard_radius, 1.0, -1)

    dot_body = cv2.GaussianBlur(round_mask, (0, 0), sigmaX=config["dot_edge_feather"])

    shadow_full = np.roll(np.roll(dot_body, config["shadow_offset"][1], axis=0),
                          config["shadow_offset"][0], axis=1)
    shadow_full = cv2.GaussianBlur(shadow_full, (0, 0), sigmaX=config["shadow_blur_sigma"])

    shadow_strength = config["shadow_strength"] * multipliers["shadow"]
    shadow_crescent = np.clip(shadow_full - dot_body, 0.0, 1.0) * shadow_strength

    highlight_full = np.roll(np.roll(dot_body, config["highlight_offset"][1], axis=0),
                           config["highlight_offset"][0], axis=1)
    highlight_full = cv2.GaussianBlur(highlight_full, (0, 0), sigmaX=config["highlight_blur_sigma"])
    highlight_crescent = np.clip(highlight_full - dot_body, 0.0, 1.0)

    k = np.zeros((5, 5), dtype=np.float32)
    k[2:, 2:] = 1.0
    k /= k.sum()
    core_shade = cv2.filter2D(dot_body, -1, k)

    core_darken = config["dot_core_darken"] * multipliers["core"]
    core_shade = np.clip(core_shade * 3.0, 0.0, 1.0) * dot_body * core_darken

    darken = core_shade + shadow_crescent
    brighten = highlight_crescent * (config["highlight_ratio"] * multipliers["highlight"])

    strength = (darken - brighten) * config["target_strength"]

    return strength.astype(np.float32)

# ===========================================================================
# SECTION 6: PIPELINE EXECUTION
# ===========================================================================
def process_image(source_path, output_path, ex_config, ren_config):
    source = cv2.imread(str(source_path), cv2.IMREAD_COLOR)
    if source is None:
        raise ValueError(f"Could not read source image: {source_path}")

    height, width = source.shape[:2]
    background = np.full((height, width, 3), ren_config["background_color"], dtype=np.uint8)

    multipliers = analyze_lighting(source)
    peaks, dot_dim = extract_dot_coordinates(source, ex_config)

    if len(peaks) == 0:
        print(f"Warning: No dots found in {source_path}")
        cv2.imwrite(str(output_path), background)
        return

    strength = render_dots_texture(
        (height, width),
        peaks,
        dot_dim,
        ren_config,
        multipliers
    )

    result = background.astype(np.float32) - strength[..., None]
    result = np.clip(result, 0, 255)

    cv2.imwrite(str(output_path), result.astype(np.uint8))


def main():
    parser = argparse.ArgumentParser(
        description="Extract and render braille dots with photographic realism."
    )
    parser.add_argument("--source", default="enhanced_geo", help="Input folder")
    parser.add_argument("--output", default="extracted_geo", help="Output folder")
    parser.add_argument("--dot-strength", type=float, default=None,
                        help="Override the default target_strength in RENDERING_CONFIG")
    args = parser.parse_args()

    source_dir = Path(args.source)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    extensions = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff"}

    if args.dot_strength is not None:
        RENDERING_CONFIG["target_strength"] = args.dot_strength
        print(f"Using custom dot strength: {args.dot_strength}")

    for source_path in sorted(source_dir.iterdir()):
        if source_path.suffix.lower() not in extensions:
            continue
        output_path = output_dir / source_path.name

        process_image(source_path, output_path, EXTRACTION_CONFIG, RENDERING_CONFIG)
        print(f"Saved: {output_path}")


if __name__ == "__main__":
    main()