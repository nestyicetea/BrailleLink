import argparse
import shutil
import subprocess
import sys
from pathlib import Path


def run_step(name, cmd):
    print(f"\n{'=' * 60}")
    print(f"  STEP: {name}")
    print(f"  CMD:  {' '.join(cmd)}")
    print(f"{'=' * 60}")
    result = subprocess.run(cmd, check=False)
    if result.returncode != 0:
        print(f"\n[FAILED] {name} exited with code {result.returncode}")
        sys.exit(result.returncode)
    print(f"[OK] {name} finished.")


def copy_tree(src: Path, dst: Path):
    """Copy every file from src into dst (dst created if missing)."""
    dst.mkdir(parents=True, exist_ok=True)
    copied = 0
    for f in sorted(src.iterdir()):
        if f.is_file():
            shutil.copy2(f, dst / f.name)
            copied += 1
    return copied


def main():
    parser = argparse.ArgumentParser(description="Run full Braille pipeline")
    parser.add_argument("--skip-inference", action="store_true")
    parser.add_argument("--skip-shadow", action="store_true")
    parser.add_argument("--input", default=None)
    parser.add_argument("--geo", default="geo_rec")
    parser.add_argument("--eshadow", default="eshadow_geo")
    parser.add_argument("--extracted", default="extracted_geo")
    parser.add_argument("--train-out", default="train/test_images",
                        help="Second folder to copy extract_braille output into")
    parser.add_argument("--texture", default="preferred/dot_texture.png")
    parser.add_argument("--dot-strength", type=float, default=100.0)
    parser.add_argument("--no-copy-train", action="store_true",
                        help="Disable the second copy to train/test_images")
    args = parser.parse_args()

    py = sys.executable

    # ---- 1. inference.py ----
    if not args.skip_inference:
        cmd = [py, "inference.py"]
        if args.input is not None:
            cmd += ["--input", args.input]
        run_step("inference.py", cmd)
    else:
        print("[SKIP] inference.py")

    # ---- 2. reference_shadow.py ----
    if not args.skip_shadow:
        run_step("reference_shadow.py", [
            py, "reference_shadow.py",
            "--geo-input", args.geo,
            "--geo-output", args.eshadow,
            "--texture", args.texture,
        ])
    else:
        print("[SKIP] reference_shadow.py")

    # ---- 3. extract_braille.py ----
    run_step("extract_braille.py", [
        py, "extract_braille.py",
        "--source", args.eshadow,
        "--output", args.extracted,
        "--dot-strength", str(args.dot_strength),
    ])

    # ---- 3b. copy the extract output into a second folder ----
    if not args.no_copy_train:
        extracted_dir = Path(args.extracted)
        train_dir = Path(args.train_out)
        n = copy_tree(extracted_dir, train_dir)
        print(f"\n[COPY] {n} file(s) from {extracted_dir}/ -> {train_dir}/")

    print(f"\n{'=' * 60}")
    print("  PIPELINE COMPLETE")
    print(f"  Extracted: {Path(args.extracted).resolve()}")
    if not args.no_copy_train:
        print(f"  Train set: {Path(args.train_out).resolve()}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()