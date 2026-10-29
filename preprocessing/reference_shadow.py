import argparse
from pathlib import Path

import cv2
import numpy as np


# ---------------------------------------------------------------------------
# SETTINGS
# ---------------------------------------------------------------------------

SHADOW_STRENGTH = 5.0      # How much to darken local shadow regions
HIGHLIGHT_STRENGTH = 3.5   # How much to brighten local highlight regions
                           # (raise this to make the top of each dot glow more)
SHADOW_BLUR = 8.0          # Local neighbourhood size for shadow
HIGHLIGHT_BLUR = 4.0       # Local neighbourhood size for highlight.
                           # Smaller than SHADOW_BLUR -> tighter, more
                           # defined bright crescent on each dot.
BACKGROUND_BLUR = 45.0     # Large blur to neutralize uneven lighting angles
CONTRAST_FACTOR = 1.3      # Global contrast
BRIGHTNESS_OFFSET = -40.0  # Global brightness offset


# ---------------------------------------------------------------------------
# APPLY ILLUMINATION-NORMALIZED SHADOW + HIGHLIGHT GRADIENT
# ---------------------------------------------------------------------------

def apply_simple_shadow(image):
    """
    Applies angle-invariant lighting normalization, then enhances BOTH the
    dark shadow side and the bright highlight side of every Braille dot.

    Method:
        1. Convert to LAB, take the L channel.
        2. Estimate large-scale background illumination (flat-field).
        3. Divide -> normalized image with even lighting everywhere.
        4. Extract local SHADOW (darker than local mean) and local
           HIGHLIGHT (brighter than local mean) using Gaussian blurs.
        5. Add the highlight back and subtract the shadow, each scaled by
           its own strength. The highlight uses a smaller blur than the
           shadow, so it forms a tight bright crescent on the light-facing
           side of each dot.
        6. Apply global contrast / brightness.
        7. Convert back to BGR.
    """

    # -----------------------------------------------------------------------
    # 1. Convert BGR image to LAB
    # -----------------------------------------------------------------------
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB).astype(np.float32)
    lightness = lab[:, :, 0]

    # -----------------------------------------------------------------------
    # 2. Estimate large-scale background illumination
    # -----------------------------------------------------------------------
    background = cv2.GaussianBlur(
        lightness,
        (0, 0),
        sigmaX=BACKGROUND_BLUR,
    )
    background = np.clip(background, 10.0, 255.0)

    # -----------------------------------------------------------------------
    # 3. Flat-field correction: removes lighting angles across the page
    # -----------------------------------------------------------------------
    flattened = (lightness / background) * 190.0

    # -----------------------------------------------------------------------
    # 4a. Local SHADOW (dark side of the dots) --------------------------
    # -----------------------------------------------------------------------
    smooth_shadow = cv2.GaussianBlur(
        flattened,
        (0, 0),
        sigmaX=SHADOW_BLUR,
    )
    shadow = smooth_shadow - flattened
    shadow = np.maximum(shadow, 0)

    # -----------------------------------------------------------------------
    # 4b. Local HIGHLIGHT (bright side of the dots) ---------------------
    # -----------------------------------------------------------------------
    # Use a SMALLER blur so the highlight is a tight crescent, not a
    # broad wash. This is where the visible embossed shine comes from.
    smooth_highlight = cv2.GaussianBlur(
        flattened,
        (0, 0),
        sigmaX=HIGHLIGHT_BLUR,
    )
    # Where the pixel is BRIGHTER than its local mean, the difference is
    # positive; keep only those pixels. That's the top of each dot.
    highlight = flattened - smooth_highlight
    highlight = np.maximum(highlight, 0)

    # -----------------------------------------------------------------------
    # 5. Combine: darken shadows, brighten highlights
    # -----------------------------------------------------------------------
    lightness = (
        flattened
        - shadow * SHADOW_STRENGTH
        + highlight * HIGHLIGHT_STRENGTH
    )

    # -----------------------------------------------------------------------
    # 6. Global contrast / brightness
    # -----------------------------------------------------------------------
    if CONTRAST_FACTOR != 1.0 or BRIGHTNESS_OFFSET != 0.0:
        lightness = (lightness - 128.0) * CONTRAST_FACTOR + 128.0 + BRIGHTNESS_OFFSET

    lightness = np.clip(lightness, 0, 255)
    lab[:, :, 0] = lightness

    # -----------------------------------------------------------------------
    # 7. Convert back to BGR
    # -----------------------------------------------------------------------
    result = cv2.cvtColor(
        lab.astype(np.uint8),
        cv2.COLOR_LAB2BGR,
    )

    return result


# ---------------------------------------------------------------------------
# PROCESS FOLDER
# ---------------------------------------------------------------------------

def process_folder(input_dir, output_dir):
    output_dir.mkdir(parents=True, exist_ok=True)

    extensions = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff"}

    for image_path in sorted(input_dir.iterdir()):
        if image_path.suffix.lower() not in extensions:
            continue

        image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
        if image is None:
            print(f"Skipping unreadable image: {image_path}")
            continue

        result = apply_simple_shadow(image)

        output_path = output_dir / f"{image_path.stem}_shadow.png"
        cv2.imwrite(str(output_path), result)
        print(f"Saved: {output_path}")


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Shadow + highlight gradient with lighting normalization."
    )

    parser.add_argument("--geo-input", default="geo_rec", help="Input folder")
    parser.add_argument("--geo-output", default="eshadow_geo", help="Output folder")

    parser.add_argument("--shadow-strength", type=float, default=None,
                        help="Shadow strength (how dark the dark side gets)")
    parser.add_argument("--highlight-strength", type=float, default=None,
                        help="Highlight strength (how bright the bright side gets)")
    parser.add_argument("--shadow-blur", type=float, default=None,
                        help="Shadow blur softness (larger = wider shadow)")
    parser.add_argument("--highlight-blur", type=float, default=None,
                        help="Highlight blur softness (smaller = tighter shine)")
    parser.add_argument("--background-blur", type=float, default=None,
                        help="Background illumination blur size")
    parser.add_argument("--contrast", type=float, default=None,
                        help="Contrast factor")
    parser.add_argument("--brightness", type=float, default=None,
                        help="Brightness offset")

    # Kept for command compatibility
    parser.add_argument("--texture", default=None, help=argparse.SUPPRESS)

    args = parser.parse_args()

    global SHADOW_STRENGTH, HIGHLIGHT_STRENGTH, SHADOW_BLUR, HIGHLIGHT_BLUR
    global BACKGROUND_BLUR, CONTRAST_FACTOR, BRIGHTNESS_OFFSET

    if args.shadow_strength is not None:
        SHADOW_STRENGTH = args.shadow_strength
    if args.highlight_strength is not None:
        HIGHLIGHT_STRENGTH = args.highlight_strength
    if args.shadow_blur is not None:
        SHADOW_BLUR = args.shadow_blur
    if args.highlight_blur is not None:
        HIGHLIGHT_BLUR = args.highlight_blur
    if args.background_blur is not None:
        BACKGROUND_BLUR = args.background_blur
    if args.contrast is not None:
        CONTRAST_FACTOR = args.contrast
    if args.brightness is not None:
        BRIGHTNESS_OFFSET = args.brightness

    print("=" * 55)
    print(" SHADOW + HIGHLIGHT GRADIENT ENHANCEMENT")
    print("=" * 55)
    print(f"SHADOW_STRENGTH    = {SHADOW_STRENGTH}")
    print(f"HIGHLIGHT_STRENGTH = {HIGHLIGHT_STRENGTH}")
    print(f"SHADOW_BLUR        = {SHADOW_BLUR}")
    print(f"HIGHLIGHT_BLUR     = {HIGHLIGHT_BLUR}")
    print(f"BACKGROUND_BLUR    = {BACKGROUND_BLUR}")
    print(f"CONTRAST_FACTOR    = {CONTRAST_FACTOR}")
    print(f"BRIGHTNESS_OFFSET  = {BRIGHTNESS_OFFSET}")
    print(f"INPUT              = {args.geo_input}")
    print(f"OUTPUT             = {args.geo_output}")
    print("=" * 55)

    process_folder(Path(args.geo_input), Path(args.geo_output))


if __name__ == "__main__":
    main()