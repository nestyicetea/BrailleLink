import argparse
from pathlib import Path
import cv2
import numpy as np

# ===========================================================================
# SECTION 1: EXTRACTION CONFIGURATION (What to include/exclude)
# ===========================================================================
EXTRACTION_CONFIG = {
    # Morphological Closing: Bridges gaps in faint "horseshoe" dots.
    "close_kernel_size": 7, 
    
    # Minimum Area: Kills tiny ink specks. 
    # "abs" is absolute pixels. "frac" is relative to expected dot size.
    "min_area_abs": 25.0,      # Increased to kill specks
    "min_area_frac": 0.22,
    
    # Peak Threshold: Controls how "deep" a dot must be.
    "peak_threshold_frac": 0.05,
    
    # Row Isolation
    "row_min_width_frac": 0.02,
    "row_min_dot_count": 2,
    
    # Crease Killer
    "crease_area_mult": 6.0,
    "crease_aspect_min": 4.0,
}

# ===========================================================================
# SECTION 2: RENDERING CONFIGURATION (Texture and appearance)
# ===========================================================================
RENDERING_CONFIG = {
    "dot_radius_frac": 0.40,       # DECREASED from 0.50 to make dots smaller
    "shadow_offset": (4, 4),       
    "shadow_blur_sigma": 2.5,      
    "highlight_offset": (-4, -4),  
    "highlight_blur_sigma": 1.3,   
    "highlight_ratio": 0.45,       
    "dot_core_darken": 0.95,       
    "dot_edge_feather": 1.1,       
    "target_strength": 130.0,      # Default strength (can be overridden by CLI)
    "background_color": (222, 228, 232), 
}


# ===========================================================================
# SECTION 3: EXTRACTION FUNCTIONS
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


def extract_dot_coordinates(image, config):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)

    local_background = cv2.GaussianBlur(gray, (0, 0), sigmaX=7)
    relief = cv2.subtract(local_background, gray)
    relief = cv2.normalize(relief, None, 0, 255, cv2.NORM_MINMAX)

    otsu_t, _ = cv2.threshold(relief, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    _, mask = cv2.threshold(relief, int(otsu_t), 255, cv2.THRESH_BINARY)

    h, w = gray.shape
    mask[:int(h * 0.075), :] = 0 

    # 1. Morphological Closing
    k_size = config["close_kernel_size"]
    close_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_size, k_size))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, close_kernel)

    # 2. Area Filter
    num, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    clean_mask = np.zeros_like(mask)
    
    expected_diameter = w * 0.0075
    expected_area = np.pi * ((expected_diameter / 2.0) ** 2)
    min_area = max(config["min_area_abs"], expected_area * config["min_area_frac"])
    
    for i in range(1, num):
        if stats[i, cv2.CC_STAT_AREA] >= min_area:
            clean_mask[labels == i] = 255
    mask = clean_mask

    # 3. Crease Killer
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

    # 4. Peak Extraction
    dot_dim = _estimate_dot_size(mask)
    dist_transform = cv2.distanceTransform(mask, cv2.DIST_L2, 3)
    min_distance = max(3.0, dot_dim * 0.95)
    
    threshold_abs = max(0.1, (dot_dim / 2.0) * config["peak_threshold_frac"])
    peaks = _find_local_maxima(dist_transform, min_distance, threshold_abs)

    # 5. Row Isolation
    row_h_kernel = max(3, int(w * 0.06))
    row_v_kernel = max(3, int(h * 0.02))
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
    valid_band_ids = {
        b for b in range(1, num_bands)
        if band_stats[b, cv2.CC_STAT_WIDTH] >= min_row_width
        and band_dot_counts[b] >= config["row_min_dot_count"]
    }

    if len(peaks):
        keep = np.array([b in valid_band_ids for b in peak_bands])
        peaks = peaks[keep]

    # 6. Outlier Bounding Box
    if len(peaks) > 5:
        x_lo, x_hi = np.percentile(peaks[:, 0], [5.0, 95.0])
        y_lo, y_hi = np.percentile(peaks[:, 1], [5.0, 95.0])
        x_pad = (x_hi - x_lo) * 0.20
        y_pad = (y_hi - y_lo) * 0.20
        x_lo -= x_pad; x_hi += x_pad
        y_lo -= y_pad; y_hi += y_pad
        inside = (
            (peaks[:, 0] >= x_lo) & (peaks[:, 0] <= x_hi) &
            (peaks[:, 1] >= y_lo) & (peaks[:, 1] <= y_hi)
        )
        peaks = peaks[inside]

    # 7. Final Dedup Pass
    if len(peaks) > 1:
        final_min_distance = max(4.0, dot_dim * 1.0)
        peaks = _dedupe_peaks(peaks, final_min_distance)

    return peaks, dot_dim


# ===========================================================================
# SECTION 4: RENDERING FUNCTIONS
# ===========================================================================

def render_dots_texture(shape, peaks, dot_dim, config):
    h, w = shape[:2]

    # Adjusted the minimum clamp from 4 to 3 to allow for slightly smaller dots
    standard_radius = int(round(config["dot_radius_frac"] * dot_dim))
    standard_radius = max(3, min(standard_radius, 12))

    round_mask = np.zeros((h, w), dtype=np.float32)
    for x, y in peaks:
        cv2.circle(round_mask, (int(round(x)), int(round(y))),
                   standard_radius, 1.0, -1)

    dot_body = cv2.GaussianBlur(round_mask, (0, 0), sigmaX=config["dot_edge_feather"])

    # Shadow
    shadow_full = np.roll(np.roll(dot_body, config["shadow_offset"][1], axis=0),
                          config["shadow_offset"][0], axis=1)
    shadow_full = cv2.GaussianBlur(shadow_full, (0, 0), sigmaX=config["shadow_blur_sigma"])
    shadow_crescent = np.clip(shadow_full - dot_body, 0.0, 1.0)

    # Highlight
    highlight_full = np.roll(np.roll(dot_body, config["highlight_offset"][1], axis=0),
                             config["highlight_offset"][0], axis=1)
    highlight_full = cv2.GaussianBlur(highlight_full, (0, 0),
                                      sigmaX=config["highlight_blur_sigma"])
    highlight_crescent = np.clip(highlight_full - dot_body, 0.0, 1.0)

    # Core shading
    k = np.zeros((5, 5), dtype=np.float32)
    k[2:, 2:] = 1.0
    k /= k.sum()
    core_shade = cv2.filter2D(dot_body, -1, k)
    core_shade = np.clip(core_shade * 2.5, 0.0, 1.0) * dot_body

    darken = core_shade * config["dot_core_darken"] + shadow_crescent * (1.0 - config["dot_core_darken"])
    brighten = highlight_crescent * config["highlight_ratio"]
    strength = (darken - brighten) * config["target_strength"]

    return strength.astype(np.float32)


# ===========================================================================
# SECTION 5: PIPELINE EXECUTION
# ===========================================================================

def process_image(source_path, output_path, ex_config, ren_config):
    source = cv2.imread(str(source_path), cv2.IMREAD_COLOR)
    if source is None:
        raise ValueError(f"Could not read source image: {source_path}")

    height, width = source.shape[:2]
    background = np.full((height, width, 3), ren_config["background_color"], dtype=np.uint8)

    # 1. Extract
    peaks, dot_dim = extract_dot_coordinates(source, ex_config)
    
    if len(peaks) == 0:
        print(f"Warning: No dots found in {source_path}")
        cv2.imwrite(str(output_path), background)
        return

    # 2. Render
    strength = render_dots_texture(
        (height, width),
        peaks,
        dot_dim,
        ren_config
    )

    # 3. Combine
    result = background.astype(np.float32) - strength[..., None]
    result = np.clip(result, 0, 255)

    cv2.imwrite(str(output_path), result.astype(np.uint8))


def main():
    parser = argparse.ArgumentParser(
        description="Extract and render braille dots with separated configurations."
    )
    parser.add_argument("--source", default="enhanced_geo")
    parser.add_argument("--output", default="extracted_geo")
    # ADDED BACK: This allows your external runner to pass the strength again
    parser.add_argument("--dot-strength", type=float, default=None, 
                        help="Override the default target_strength in RENDERING_CONFIG")
    args = parser.parse_args()

    source_dir = Path(args.source)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    extensions = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff"}

    # If dot-strength is provided via CLI, override the config value
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