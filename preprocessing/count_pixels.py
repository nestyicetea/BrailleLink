import cv2
import numpy as np
from pathlib import Path

# The exact BGR colors from your rendering configuration
COLOR_WHITE = (255, 255, 255)
COLOR_GREY = (234, 234, 234)
COLOR_SHADOW = (207, 207, 207)

def count_braille_pixels(image_path, tolerance=2):
    # 1. Load the image
    img = cv2.imread(str(image_path))
    if img is None:
        print(f"Error: Could not read {image_path}")
        return

    # 2. Find pixels that match our 3 target colors
    # We use a small tolerance (e.g., 2) in case of slight image saving compression
    mask_white = np.all(np.abs(img.astype(int) - np.array(COLOR_WHITE)) <= tolerance, axis=-1)
    mask_grey = np.all(np.abs(img.astype(int) - np.array(COLOR_GREY)) <= tolerance, axis=-1)
    mask_shadow = np.all(np.abs(img.astype(int) - np.array(COLOR_SHADOW)) <= tolerance, axis=-1)

    # 3. Count the pixels
    count_white = np.count_nonzero(mask_white)
    count_grey = np.count_nonzero(mask_grey)
    count_shadow = np.count_nonzero(mask_shadow)

    # Combine all dot pixels (ignore background)
    total_dot_pixels = count_white + count_grey + count_shadow

    # 4. Print the results
    print(f"--- Analysis for: {image_path.name} ---")
    print(f"Image Dimensions: {img.shape[1]} x {img.shape[0]} px (Total: {img.shape[0]*img.shape[1]:,} pixels)")
    print(f"  - White Highlight : {count_white:,} pixels")
    print(f"  - Grey Body       : {count_grey:,} pixels")
    print(f"  - Dark Shadow     : {count_shadow:,} pixels")
    print(f"  => TOTAL DOT PIXELS: {total_dot_pixels:,} pixels")
    print("-" * 40)
    
    return {
        "white": count_white,
        "grey": count_grey,
        "shadow": count_shadow,
        "total": total_dot_pixels
    }

if __name__ == "__main__":
    # Example usage: Point to your output folder
    output_dir = Path("eshadow_geo")  # Change this to your actual output folder
    
    # If the folder exists, count all images inside
    if output_dir.exists():
        images = list(output_dir.glob("*.png")) + list(output_dir.glob("*.jpg"))
        
        if not images:
            print(f"No images found in {output_dir}")
        
        grand_total = 0
        for img_path in images:
            counts = count_braille_pixels(img_path)
            if counts:
                grand_total += counts["total"]
                
        print(f"\nGrand Total Dot Pixels across all images: {grand_total:,}")
    else:
        print(f"Folder '{output_dir}' not found.")
        print("Please update the 'output_dir' variable to point to your images.")