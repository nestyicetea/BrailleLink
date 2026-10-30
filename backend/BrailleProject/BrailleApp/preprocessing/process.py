"""
process.py — Braille document post-processing pipeline

Algorithm 1: First-Order Spatial Derivative Shadow Gradient Filtering
    Computes Gx and Gy via 2-D convolution (Sobel kernels), derives the
    gradient magnitude M(x,y) and orientation θ(x,y) at every pixel, then
    uses M to build a weight map that suppresses low-frequency shadow regions
    (folds, paper edges, lighting gradients) while preserving the high-gradient
    Braille dots.

Algorithm 2: Geometric Canvas Dewarping (Homography Transformation)
    Automatically detects the four outermost corners of the document sheet,
    constructs the 3×3 homography matrix H, and warps the distorted source
    coordinates (x, y) to a flat destination plane (x', y').

Usage (standalone):
    python process.py --input ./geo_rec/ --output ./processed/

Usage (as a module):
    from process import apply_gradient_filter, apply_homography, process_image
"""

import cv2
import numpy as np
import os
import argparse
from pathlib import Path


# ---------------------------------------------------------------------------
# Algorithm 1 — First-Order Spatial Derivative Shadow Gradient Filtering
# ---------------------------------------------------------------------------

# Horizontal and vertical Sobel kernels  (Kx, Ky)
KX = np.array([[-1, 0, 1],
               [-2, 0, 2],
               [-1, 0, 1]], dtype=np.float32)

KY = np.array([[-1, -2, -1],
               [ 0,  0,  0],
               [ 1,  2,  1]], dtype=np.float32)


def compute_gradients(gray: np.ndarray):
    """
    Convolve the grayscale image with Kx and Ky to obtain:
        Gx = ∂I/∂x,   Gy = ∂I/∂y
    Returns Gx, Gy (float32), magnitude M, and orientation θ (radians).
    """
    Gx = cv2.filter2D(gray.astype(np.float32), -1, KX)
    Gy = cv2.filter2D(gray.astype(np.float32), -1, KY)

    # M(x,y) = sqrt(Gx² + Gy²)
    M = np.sqrt(Gx ** 2 + Gy ** 2)

    # θ(x,y) = arctan(Gy / Gx)
    theta = np.arctan2(Gy, Gx)

    return Gx, Gy, M, theta


def apply_gradient_filter(img_bgr: np.ndarray,
                           dot_threshold: float = 0.12,
                           shadow_sigma: float = 40.0,
                           blend_alpha: float = 0.92) -> np.ndarray:
    """
    Apply Algorithm 1 to suppress fold/crease shadows.

    Strategy
    --------
    1. Convert to grayscale, compute gradient magnitude M.
    2. Normalise M → [0, 1].  High M  = sharp edge (Braille dot).
                               Low  M  = smooth region (shadow / fold).
    3. Estimate the background illumination via a large-σ Gaussian blur
       (this captures slow-varying fold shadows without touching dots).
    4. Divide the luminance channel by the background estimate — this
       "flattens" the illumination so folds become invisible.
    5. Use M as a guide: where M is high (dots) we keep the original
       sharpness; where M is low (paper / shadow) we use the flattened
       version.  A smooth alpha blend controlled by dot_threshold merges
       the two.
    6. Reconvert to BGR and return.

    Parameters
    ----------
    img_bgr      : Input image (BGR uint8).
    dot_threshold: Gradient magnitude percentile above which a pixel is
                   considered a Braille dot edge (0–1 fraction of max M).
    shadow_sigma : Gaussian sigma for background illumination estimation.
                   Larger values capture broader fold gradients.
    blend_alpha  : Overall strength of the shadow-removal effect (0–1).
    """
    # --- Step 1: grayscale & gradients ---
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    _, _, M, _ = compute_gradients(gray)

    # Normalise magnitude to [0, 1]
    M_norm = M / (M.max() + 1e-8)

    # --- Step 2: dot / shadow mask ---
    # Pixels with high gradient magnitude are dot edges → weight = 1 (keep sharp)
    # Pixels with low  gradient magnitude are shadow   → weight = 0 (flatten)
    dot_mask = (M_norm > dot_threshold).astype(np.float32)

    # Smooth the mask so the transition is gradual (no hard boundary artefacts)
    dot_mask_smooth = cv2.GaussianBlur(dot_mask, (0, 0), sigmaX=3.0)

    # --- Step 3: background illumination estimation (LAB L-channel) ---
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    L, A, B = cv2.split(lab)

    background = cv2.GaussianBlur(L, (0, 0), sigmaX=shadow_sigma)

    # --- Step 4: flatten illumination ---
    # Divide L by background, rescale so mean stays the same
    mean_L = np.mean(L)
    L_flat = np.clip((L / (background + 1.0)) * mean_L, 0, 255).astype(np.float32)

    # Optional CLAHE on the flattened channel to recover local contrast
    L_flat_u8 = np.clip(L_flat, 0, 255).astype(np.uint8)
    clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(16, 16))
    L_clahe = clahe.apply(L_flat_u8).astype(np.float32)

    # --- Step 5: guided blend —  dots keep original L, shadows get L_clahe ---
    L_blended = dot_mask_smooth * L + (1.0 - dot_mask_smooth) * L_clahe

    # Apply overall blend_alpha between original L and result
    L_final = blend_alpha * L_blended + (1.0 - blend_alpha) * L
    L_final = np.clip(L_final, 0, 255).astype(np.uint8)

    # --- Step 6: reconstruct BGR ---
    lab_out = cv2.merge([L_final, A.astype(np.uint8), B.astype(np.uint8)])
    result = cv2.cvtColor(lab_out, cv2.COLOR_LAB2BGR)
    return result


# ---------------------------------------------------------------------------
# Algorithm 2 — Geometric Canvas Dewarping (Homography Transformation)
# ---------------------------------------------------------------------------

def _order_corners(pts: np.ndarray) -> np.ndarray:
    """
    Sort four corner points into [top-left, top-right, bottom-right, bottom-left].
    """
    pts = pts.reshape(4, 2).astype(np.float32)
    rect = np.zeros((4, 2), dtype=np.float32)

    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]   # top-left     (smallest x+y)
    rect[2] = pts[np.argmax(s)]   # bottom-right (largest  x+y)

    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]  # top-right    (smallest y-x)
    rect[3] = pts[np.argmax(diff)]  # bottom-left  (largest  y-x)

    return rect


def _detect_document_corners(img_bgr: np.ndarray):
    """
    Locate the four outermost corners of the physical document sheet.

    Returns an ordered (4, 2) float32 array, or None if detection fails.
    """
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    # Mild blur to suppress Braille dot noise before edge detection
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Adaptive threshold isolates the document from the background
    thresh = cv2.adaptiveThreshold(
        blurred, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        blockSize=21, C=10
    )

    # Morphological close to fill gaps along the document border
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=3)

    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    # Take the largest contour (the document sheet)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)

    for cnt in contours[:5]:
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
        if len(approx) == 4:
            return _order_corners(approx)

    # Fallback: use bounding rectangle of the largest contour
    cnt = contours[0]
    x, y, w, h = cv2.boundingRect(cnt)
    corners = np.array([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], dtype=np.float32)
    return corners


def apply_homography(img_bgr: np.ndarray,
                     dst_size: tuple = None,
                     corners: np.ndarray = None) -> np.ndarray:
    """
    Apply Algorithm 2: perspective correction via homography.

    The 3×3 matrix H maps source coordinates (x, y) → destination (x', y'):

        [x']   [h11 h12 h13] [x]
        [y'] = [h21 h22 h23] [y]
        [ 1]   [h31 h32 h33] [1]

    with normalised output coordinates:
        x' = (h11·x + h12·y + h13) / (h31·x + h32·y + h33)
        y' = (h21·x + h22·y + h23) / (h31·x + h32·y + h33)

    Parameters
    ----------
    img_bgr  : Input image (BGR uint8).
    dst_size : (width, height) of the output canvas.  Defaults to the
               width/height derived from the detected corner distances.
    corners  : Optional pre-computed (4, 2) source corners.  If None,
               auto-detected from the image.

    Returns the warped image, or the original if no corners are found.
    """
    h, w = img_bgr.shape[:2]

    # --- Detect / receive source corners ---
    if corners is None:
        corners = _detect_document_corners(img_bgr)

    if corners is None:
        # Cannot detect document boundary — return as-is
        print("  [homography] Corner detection failed; skipping warp.")
        return img_bgr

    tl, tr, br, bl = corners

    # --- Compute destination canvas size ---
    width_top    = np.linalg.norm(tr - tl)
    width_bottom = np.linalg.norm(br - bl)
    height_left  = np.linalg.norm(bl - tl)
    height_right = np.linalg.norm(br - tr)

    dst_w = int(max(width_top, width_bottom))
    dst_h = int(max(height_left, height_right))

    if dst_size is not None:
        dst_w, dst_h = dst_size

    # Clamp to image dimensions (safety guard)
    dst_w = min(dst_w, w)
    dst_h = min(dst_h, h)

    dst_corners = np.array([
        [0,         0        ],
        [dst_w - 1, 0        ],
        [dst_w - 1, dst_h - 1],
        [0,         dst_h - 1],
    ], dtype=np.float32)

    # --- Compute the 3×3 homography matrix H ---
    H, _ = cv2.findHomography(corners, dst_corners, method=0)

    # --- Warp the image: every pixel (x,y) → (x', y') via H ---
    warped = cv2.warpPerspective(img_bgr, H, (dst_w, dst_h),
                                  flags=cv2.INTER_LINEAR,
                                  borderMode=cv2.BORDER_REPLICATE)
    return warped


# ---------------------------------------------------------------------------
# Full pipeline
# ---------------------------------------------------------------------------

def process_image(img_bgr: np.ndarray,
                  run_homography: bool = True,
                  run_gradient_filter: bool = True,
                  dot_threshold: float = 0.12,
                  shadow_sigma: float = 40.0,
                  blend_alpha: float = 0.92) -> np.ndarray:
    """
    Run the full two-algorithm pipeline on a single BGR image.

    Order: Algorithm 2 (geometry) first, then Algorithm 1 (shadows).
    Geometry is corrected before shadow filtering so the gradient
    computation operates on a flat, undistorted surface.
    """
    result = img_bgr.copy()

    if run_homography:
        result = apply_homography(result)

    if run_gradient_filter:
        result = apply_gradient_filter(
            result,
            dot_threshold=dot_threshold,
            shadow_sigma=shadow_sigma,
            blend_alpha=blend_alpha,
        )

    return result


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Braille document post-processing: shadow removal + homography dewarping"
    )
    parser.add_argument("--input",  default="./geo_rec/",
                        help="Folder containing input images (default: ./geo_rec/)")
    parser.add_argument("--output", default="./processed/",
                        help="Folder to save processed images (default: ./processed/)")
    parser.add_argument("--no_homography",     action="store_true",
                        help="Disable Algorithm 2 (homography correction)")
    parser.add_argument("--no_gradient",       action="store_true",
                        help="Disable Algorithm 1 (gradient shadow filter)")
    parser.add_argument("--dot_threshold",     type=float, default=0.12,
                        help="Gradient magnitude threshold for Braille dot detection (default: 0.12)")
    parser.add_argument("--shadow_sigma",      type=float, default=40.0,
                        help="Gaussian sigma for background illumination estimation (default: 40.0)")
    parser.add_argument("--blend_alpha",       type=float, default=0.92,
                        help="Shadow-removal blend strength 0–1 (default: 0.92)")
    opt = parser.parse_args()

    os.makedirs(opt.output, exist_ok=True)

    extensions = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif"}
    img_files = [p for p in Path(opt.input).iterdir()
                 if p.suffix.lower() in extensions]

    if not img_files:
        print(f"No images found in {opt.input}")
        return

    for img_path in img_files:
        print(f"Processing: {img_path.name}")
        img = cv2.imread(str(img_path))
        if img is None:
            print(f"  Could not read {img_path.name}, skipping.")
            continue

        result = process_image(
            img,
            run_homography=not opt.no_homography,
            run_gradient_filter=not opt.no_gradient,
            dot_threshold=opt.dot_threshold,
            shadow_sigma=opt.shadow_sigma,
            blend_alpha=opt.blend_alpha,
        )

        stem = img_path.stem
        out_path = Path(opt.output) / f"{stem}_processed.png"
        cv2.imwrite(str(out_path), result)
        print(f"  Saved → {out_path}")

    print("Done.")


if __name__ == "__main__":
    main()
