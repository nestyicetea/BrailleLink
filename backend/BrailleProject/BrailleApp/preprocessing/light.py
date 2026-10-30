import cv2
import numpy as np
from pathlib import Path
import argparse

EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"}

PAPER_LEVEL = 140          # every image's paper ends up at this gray (0-255)
DETAIL_LEVELS = 60         # gray levels spanned by the strongest dot detail (99th percentile)
ILLUM_FRAC = 0.125         # lighting window as a fraction of image width
SCALE_MIN, SCALE_MAX = 60.0, 500.0   # limits on the contrast boost


def estimate_illumination(L):
    """Smooth lighting map. Median ignores dots and text, keeps only broad lighting."""
    h, w = L.shape
    sw = 256
    sh = max(8, int(round(h * sw / w)))
    small = cv2.resize(L, (sw, sh), interpolation=cv2.INTER_AREA)

    k = max(3, min(int(sw * ILLUM_FRAC), min(sw, sh)) | 1)
    bg = cv2.medianBlur(small, k).astype(np.float32)
    bg = cv2.GaussianBlur(bg, (0, 0), k / 4)
    bg = cv2.resize(bg, (w, h), interpolation=cv2.INTER_LINEAR)
    return np.maximum(bg, 1.0)


def normalize(img):
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    L = lab[:, :, 0]

    bg = estimate_illumination(L)
    detail = np.log((L.astype(np.float32) + 1.0) / (bg + 1.0))   # 0 = paper, <0 shadow, >0 highlight

    spread = float(np.percentile(np.abs(detail), 99))
    scale = float(np.clip(DETAIL_LEVELS / max(spread, 1e-3), SCALE_MIN, SCALE_MAX))

    out = np.clip(PAPER_LEVEL + detail * scale, 0, 255).astype(np.uint8)
    return cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)   # neutral gray, color cast removed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, default=Path("geo_rec"))
    parser.add_argument("--output-dir", type=Path, default=Path("new_geo"))
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    files = [p for p in sorted(args.input_dir.iterdir()) if p.suffix.lower() in EXTS]
    if not files:
        raise FileNotFoundError(f"No images found in {args.input_dir}")

    for p in files:
        img = cv2.imread(str(p))
        if img is None:
            raise ValueError(f"Cannot read image: {p}")
        output_path = args.output_dir / p.name
        if not cv2.imwrite(str(output_path), normalize(img)):
            raise OSError(f"Could not save image: {output_path}")
        print(f"Done: {p.name}")


if __name__ == "__main__":
    main()