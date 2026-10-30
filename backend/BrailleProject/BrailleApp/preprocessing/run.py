import subprocess
import sys
import argparse
import time
import tempfile
from pathlib import Path
import torch

# Define the root directory (where this run_pipeline.py is located)
ROOT_DIR = Path(__file__).resolve().parent
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"}

# Define the pipeline steps
PIPELINE_STEPS = [
    {"name": "1. Inference", "script": ROOT_DIR / "inference.py", "arg": "inference.py"},
    {"name": "2. Lighting",  "script": ROOT_DIR / "light.py", "arg": "light.py"},
    {"name": "3. Enhance",   "script": ROOT_DIR / "enhance.py", "arg": "enhance.py"},
    {"name": "4. Extract",   "script": ROOT_DIR / "extract_braille.py", "arg": "extract_braille.py"},
    {"name": "5. Transcribe","script": ROOT_DIR / "train" / "transcribe.py", "arg": "transcribe.py"}
]


def format_duration(seconds: float) -> str:
    """Format seconds into a human-readable string (e.g., '2m 13.4s')."""
    if seconds < 1:
        return f"{seconds * 1000:.0f} ms"
    if seconds < 60:
        return f"{seconds:.2f} s"
    minutes = int(seconds // 60)
    remaining = seconds % 60
    return f"{minutes}m {remaining:.2f}s"


def run_pipeline(skip_list):
    print("\n" + "=" * 50)
    print("STARTING BRAILLE PIPELINE")
    if skip_list:
        print(f"SKIPPING: {', '.join(skip_list)}")
    print("=" * 50)

    pipeline_start = time.perf_counter()
    timings = []  # list of (step_name, script_name, duration_or_None, status)

    for step in PIPELINE_STEPS:
        script_path = step["script"]
        step_name = step["name"]
        script_name = step["arg"]

        # Check if this step is in the skip list
        if script_name in skip_list:
            print(f"\nSKIPPING STEP: {step_name} - {script_name}")
            timings.append((step_name, script_name, None, "SKIPPED"))
            continue

        print(f"\nRUNNING STEP: {step_name} - {script_name}")

        if not script_path.exists():
            print(f"ERROR: Script not found at {script_path}")
            timings.append((step_name, script_name, None, "FAILED (not found)"))
            _print_summary(timings, time.perf_counter() - pipeline_start)
            sys.exit(1)

        step_start = time.perf_counter()
        try:
            process = subprocess.Popen(
                [sys.executable, str(script_path)],
                cwd=ROOT_DIR,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1
            )

            # Print output exactly as the child script outputs it
            for line in process.stdout:
                if line.strip():
                    print(f"    {line.strip()}")

            process.wait()
            step_elapsed = time.perf_counter() - step_start

            if process.returncode != 0:
                print(f"\nERROR: {script_name} failed with exit code {process.returncode}.")
                print(f"Time spent on this step: {format_duration(step_elapsed)}")
                timings.append((step_name, script_name, step_elapsed, f"FAILED (code {process.returncode})"))
                _print_summary(timings, time.perf_counter() - pipeline_start)
                sys.exit(1)

            print(f"    ⏱  Completed in {format_duration(step_elapsed)}")
            timings.append((step_name, script_name, step_elapsed, "OK"))

        except Exception as e:
            step_elapsed = time.perf_counter() - step_start
            print(f"\nUnexpected error running {script_name}: {e}")
            print(f"Time spent on this step: {format_duration(step_elapsed)}")
            timings.append((step_name, script_name, step_elapsed, f"ERROR: {e}"))
            _print_summary(timings, time.perf_counter() - pipeline_start)
            sys.exit(1)

    total_elapsed = time.perf_counter() - pipeline_start

    print("\n" + "=" * 50)
    print("PIPELINE COMPLETED SUCCESSFULLY!")
    _print_summary(timings, total_elapsed)
    print("=" * 50 + "\n")


def run_single_image(input_path: Path, output_dir: Path):
    input_path = input_path.resolve()
    if not input_path.is_file():
        raise FileNotFoundError(f"Input image not found: {input_path}")
    if input_path.suffix.lower() not in IMAGE_EXTENSIONS:
        raise ValueError(f"Unsupported image format: {input_path.suffix}")

    output_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="braille-pipeline-") as temp_dir:
        work_dir = Path(temp_dir)
        geo_dir = work_dir / "geo_rec"
        light_dir = work_dir / "new_geo"
        enhanced_dir = work_dir / "enhanced_geo"
        extracted_dir = work_dir / "extracted_geo"

        commands = [
            (
                "1. Inference",
                [
                    sys.executable, str(ROOT_DIR / "inference.py"),
                    "--input", str(input_path),
                    "--gsave_path", str(geo_dir),
                    "--isave_path", str(work_dir / "ill_rec"),
                ],
            ),
            (
                "2. Lighting",
                [
                    sys.executable, str(ROOT_DIR / "light.py"),
                    "--input-dir", str(geo_dir),
                    "--output-dir", str(light_dir),
                ],
            ),
            (
                "3. Enhance",
                [
                    sys.executable, str(ROOT_DIR / "enhance.py"),
                    "--input-dir", str(light_dir),
                    "--output-dir", str(enhanced_dir),
                ],
            ),
            (
                "4. Extract",
                [
                    sys.executable, str(ROOT_DIR / "extract_braille.py"),
                    "--source", str(enhanced_dir),
                    "--output", str(extracted_dir),
                ],
            ),
            (
                "5. Transcribe",
                [
                    sys.executable, str(ROOT_DIR / "train" / "transcribe.py"),
                    "--input-dir", str(extracted_dir),
                    "--output-dir", str(output_dir),
                    "--text-output-dir", str(output_dir),
                ],
            ),
        ]

        expected_stem = f"pred_{input_path.stem}_geo"
        expected_image = output_dir / f"{expected_stem}.png"
        expected_text = output_dir / f"{expected_stem}.txt"
        for step_name, command in commands:
            print(f"\nRUNNING STEP: {step_name}")
            subprocess.run(command, cwd=ROOT_DIR, check=True)

            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

        if not expected_image.is_file() or not expected_text.is_file():
            raise FileNotFoundError(
                f"Pipeline finished without producing {expected_image.name} and {expected_text.name}"
            )

    print(f"Processed image: {expected_image}")
    print(f"Transcription: {expected_text}")


def _print_summary(timings, total_elapsed: float):
    """Print a nicely formatted timing summary table."""
    print("\n" + "-" * 50)
    print("TIMING SUMMARY")
    print("-" * 50)
    for name, script, duration, status in timings:
        if duration is None:
            dur_str = "  --  "
        else:
            dur_str = format_duration(duration).rjust(10)
        print(f"  {name:<20} {dur_str}   [{status}]")
    print("-" * 50)
    print(f"  {'TOTAL':<20} {format_duration(total_elapsed).rjust(10)}")
    print("-" * 50)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--input",
        type=Path,
        help="Process one image through the full pipeline",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=ROOT_DIR / "train" / "outputs",
        help="Directory for the annotated image and transcription",
    )
    parser.add_argument(
        '--skip',
        nargs='+',
        default=[],
        help='List of scripts to skip (e.g., --skip inference.py light.py)'
    )
    args = parser.parse_args()

    if args.input:
        if args.skip:
            parser.error("--skip cannot be combined with --input")
        run_single_image(args.input, args.output_dir)
    else:
        run_pipeline(args.skip)