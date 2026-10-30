import os
import glob
from pathlib import Path
import argparse
import cv2
import numpy as np

def enhance_braille(image_path, output_path):
    # 1. Read the image in grayscale
    gray = cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)

    if gray is None:
        print(f"Error: Cannot read image: {image_path}")
        return

    gray = gray.astype(np.float32)

    # --- NEW: PAPER SMOOTHING STEP ---
    # We blur the image slightly to eliminate the rough paper fibers.
    # We use a small kernel (e.g., 7 or 9) so we don't blur away the Braille dots.
    # Change to (15, 15) or (21, 21) if you want extreme smoothing, 
    # but be careful, it might start to wash out the dots.
    SMOOTH_KERNEL = 9 
    smoothed_gray = cv2.GaussianBlur(gray, (SMOOTH_KERNEL, SMOOTH_KERNEL), 0)

    # 2. Estimate broad illumination variations from the smoothed image.
    # Large blur follows gradual lighting changes but not individual dots.
    background = cv2.GaussianBlur(
        smoothed_gray, (0, 0), sigmaX=45, sigmaY=45
    )

    # 3. Remove broad illumination variations
    # We subtract the background from the SMOOTHED image, not the original rough one.
    detail = smoothed_gray - background

    # 4. Reconstruct the image with MORE highlight visibility
    TARGET_GRAY = 175
    DETAIL_GAIN = 2.2

    enhanced = TARGET_GRAY + DETAIL_GAIN * detail

    # 5. Add a slight S-Curve (Contrast Boost)
    enhanced = cv2.convertScaleAbs(enhanced, alpha=1.15, beta=0)

    # 6. Keep the original grayscale format.
    enhanced = np.clip(enhanced, 0, 255).astype(np.uint8)

    # 7. Save the enhanced image.
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if not cv2.imwrite(str(output_path), enhanced):
        print(f"Error: Could not save image: {output_path}")
    else:
        print(f"Saved: {output_path}")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", default="new_geo")
    parser.add_argument("--output-dir", default="enhanced_geo")
    args = parser.parse_args()
    input_dir = args.input_dir
    output_dir = args.output_dir
    
    # Create folders if they don't exist
    os.makedirs(input_dir, exist_ok=True)
    os.makedirs(output_dir, exist_ok=True)
    
    # Find all images in the new_geo folder
    valid_extensions = ('*.png', '*.jpg', '*.jpeg', '*.bmp', '*.tiff')
    image_files = []
    for ext in valid_extensions:
        image_files.extend(glob.glob(os.path.join(input_dir, ext)))
        
    if not image_files:
        print(f"No images found in the '{input_dir}' folder.")
        return

    print(f"Found {len(image_files)} image(s). Processing...\n")
    
    # Loop through each image and apply the enhancement
    for file_path in image_files:
        filename = os.path.basename(file_path)
        output_path = os.path.join(output_dir, filename)
        enhance_braille(file_path, output_path)
        
    print("\nAll done!")

if __name__ == "__main__":
    main()