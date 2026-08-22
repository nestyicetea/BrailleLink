"""
Algorithm 1: First-Order Spatial Derivative Shadow Gradient Filtering.
Traditional image-processing pipeline (no ML) for Braille dot enhancement.
"""
import cv2
import numpy as np
from PIL import Image as PILImage


def load_image(path):
    """Load an image from disk into OpenCV BGR format."""
    img = cv2.imread(path)
    if img is None:
        raise ValueError(f"Could not load image at {path}")
    return img


def convert_to_grayscale(image):
    """Convert a BGR array or PIL image to single-channel grayscale."""
    if isinstance(image, PILImage.Image):
        arr = np.array(image)
        image = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR) if arr.ndim == 3 else arr
    if image.ndim == 2:
        return image
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)


def normalize_image(gray):
    """Normalize grayscale intensities to [0, 255] for stable gradients."""
    return cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX)


def calculate_horizontal_gradient(gray, ksize=3):
    """Gx(x,y) = dI/dx via Sobel."""
    return cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=ksize)


def calculate_vertical_gradient(gray, ksize=3):
    """Gy(x,y) = dI/dy via Sobel."""
    return cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=ksize)


def calculate_gradient_magnitude(Gx, Gy):
    """M(x,y) = sqrt(Gx^2 + Gy^2), normalized to [0,255]."""
    magnitude = cv2.magnitude(Gx.astype(np.float32), Gy.astype(np.float32))
    return cv2.normalize(magnitude, None, 0, 255, cv2.NORM_MINMAX)


def calculate_gradient_orientation(Gx, Gy):
    """theta(x,y) = atan2(Gy, Gx), in radians."""
    return np.arctan2(Gy, Gx)


def suppress_background(magnitude, orientation, blur_ksize=51):
    """
    Estimate slowly-varying background (folds/lighting) by heavily blurring
    the magnitude image, then subtract it out. Orientation weighting: folds
    and edges hold one dominant gradient direction over a wide neighborhood,
    while a round Braille dot's gradient direction sweeps around its rim
    (high local orientation variance). Pixels with high local variance get
    boosted; directional streaks stay suppressed.
    """
    magnitude_u8 = magnitude.astype(np.uint8)
    background = cv2.GaussianBlur(magnitude_u8, (blur_ksize, blur_ksize), 0)
    suppressed = cv2.subtract(magnitude_u8, background)

    orient_deg = np.degrees(orientation) % 180
    local_mean = cv2.GaussianBlur(orient_deg.astype(np.float32), (9, 9), 0)
    local_var = cv2.GaussianBlur((orient_deg - local_mean) ** 2, (9, 9), 0)
    var_norm = cv2.normalize(local_var, None, 0, 1.0, cv2.NORM_MINMAX)

    weighted = suppressed.astype(np.float32) * (0.5 + 0.5 * var_norm)
    weighted = cv2.normalize(weighted, None, 0, 255, cv2.NORM_MINMAX)
    return weighted.astype(np.uint8), background


def enhance_braille_dots(image, min_dot_area=10, max_dot_area=200):
    """
    Otsu threshold + morphological open/close, then keep only connected
    components whose area is plausible for a Braille dot. Returns a
    white-background mask (0 = dot), the intermediate binary/closed
    images, and the dot count.
    """
    _, binary = cv2.threshold(image, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    kernel = np.ones((3, 3), np.uint8)
    opened = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
    closed = cv2.morphologyEx(opened, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    final_mask = np.full_like(closed, 255)
    dot_count = 0
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if min_dot_area < area < max_dot_area:
            cv2.drawContours(final_mask, [cnt], -1, 0, -1)
            dot_count += 1

    return final_mask, binary, closed, dot_count


def generate_output(original_bgr, final_mask):
    """Green-highlight overlay of detected dots on the original image."""
    highlight_mask = np.zeros_like(original_bgr)
    dot_pixels = np.where(final_mask == 0)
    highlight_mask[dot_pixels] = [0, 255, 0]
    return cv2.addWeighted(original_bgr, 0.7, highlight_mask, 0.3, 0)


def process_braille_image(img, kernel_size=3, min_dot_area=10, max_dot_area=200):
    """
    Full Algorithm 1 pipeline. `img` is a PIL Image or OpenCV BGR array.
    Returns every intermediate stage (for thesis visualization) plus the
    final outputs — enhancement/filtering only, no Braille classification.
    """
    if isinstance(img, PILImage.Image):
        arr = np.array(img)
        img_cv = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR) if arr.ndim == 3 else cv2.cvtColor(arr, cv2.COLOR_GRAY2BGR)
    else:
        img_cv = img

    gray = convert_to_grayscale(img_cv)
    gray = normalize_image(gray)
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)  # noise reduction, not dot-destructive

    Gx = calculate_horizontal_gradient(blurred, ksize=kernel_size)
    Gy = calculate_vertical_gradient(blurred, ksize=kernel_size)
    magnitude = calculate_gradient_magnitude(Gx, Gy)
    orientation = calculate_gradient_orientation(Gx, Gy)

    suppressed, background = suppress_background(magnitude, orientation)
    final_mask, binary, closed, dot_count = enhance_braille_dots(
        suppressed, min_dot_area=min_dot_area, max_dot_area=max_dot_area
    )
    overlay = generate_output(img_cv, final_mask)

    return {
        'success': True,
        'grayscale': gray,
        'Gx': Gx,
        'Gy': Gy,
        'magnitude': magnitude.astype(np.uint8),
        'orientation': orientation,
        'background': background,
        'suppressed': suppressed,
        'binary': binary,
        'closed': closed,
        'mask': final_mask,
        'overlay': overlay,
        'dot_count': dot_count,
    }