import os
import glob
import argparse
import numpy as np
import cv2
from ultralytics import YOLO

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "models", "best.pt")
TEST_IMG_DIR = os.path.join(BASE_DIR, "..", "extracted_geo")
OUTPUT_DIR = os.path.join(BASE_DIR, "outputs")
TEXT_OUTPUT_DIR = OUTPUT_DIR 

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(TEXT_OUTPUT_DIR, exist_ok=True)

CONF_THRESHOLD = 0.08
IOU_THRESHOLD = 0.25
IMAGE_SIZE = 1280

DUPLICATE_IOU_THRESHOLD = 0.30
CONTAINMENT_THRESHOLD = 0.75
SAME_CLASS_OVERLAP_THRESHOLD = 0.85

PUNCTUATION_LABELS = {"comma", "period", "excla"}

PUNCT_CONF_THRESHOLD = CONF_THRESHOLD 
PUNCT_MIN_DOT_PIXELS = 15
DOT_DIFF = 35

def box_iou(a, b):
    x1 = max(a["xmin"], b["xmin"])
    y1 = max(a["ymin"], b["ymin"])
    x2 = min(a["xmax"], b["xmax"])
    y2 = min(a["ymax"], b["ymax"])
    intersection = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    area_a = a["width"] * a["height"]
    area_b = b["width"] * b["height"]
    union = area_a + area_b - intersection
    return intersection / union if union > 0 else 0.0

def overlap_over_smaller_box(a, b):
    x1 = max(a["xmin"], b["xmin"])
    y1 = max(a["ymin"], b["ymin"])
    x2 = min(a["xmax"], b["xmax"])
    y2 = min(a["ymax"], b["ymax"])
    intersection = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    smaller_area = min(a["width"] * a["height"], b["width"] * b["height"])
    if smaller_area <= 0:
        return 0.0
    return intersection / smaller_area

def is_duplicate(box, kept_box):
    iou = box_iou(box, kept_box)
    overlap = overlap_over_smaller_box(box, kept_box)
    same_class = box["label"] == kept_box["label"]
    punctuation_involved = (box["label"] in PUNCTUATION_LABELS or kept_box["label"] in PUNCTUATION_LABELS)

    if iou >= DUPLICATE_IOU_THRESHOLD:
        return True
    if punctuation_involved and overlap >= CONTAINMENT_THRESHOLD:
        return True
    if same_class and overlap >= SAME_CLASS_OVERLAP_THRESHOLD:
        return True
    return False

def suppress_duplicates(boxes):
    ordered = sorted(boxes, key=lambda b: b["conf"], reverse=True)
    kept = []
    for box in ordered:
        if not any(is_duplicate(box, existing) for existing in kept):
            kept.append(box)
    return sorted(kept, key=lambda b: (b["y_center"], b["x_center"]))

def has_dot_content(gray, box, background):
    h, w = gray.shape
    x1, y1 = max(0, int(box["xmin"])), max(0, int(box["ymin"]))
    x2, y2 = min(w, int(box["xmax"])), min(h, int(box["ymax"]))
    if x2 <= x1 or y2 <= y1:
        return False
    crop = gray[y1:y2, x1:x2].astype(np.float32)
    dot_pixels = np.count_nonzero(np.abs(crop - background) > DOT_DIFF)
    return dot_pixels >= PUNCT_MIN_DOT_PIXELS

def group_into_lines(boxes, avg_h):
    if not boxes:
        return []
    ordered = sorted(boxes, key=lambda b: b["y_center"])
    lines = []
    current = [ordered[0]]
    for box in ordered[1:]:
        median_y = float(np.median([item["y_center"] for item in current]))
        if abs(box["y_center"] - median_y) < avg_h * 0.5:
            current.append(box)
        else:
            lines.append(sorted(current, key=lambda b: b["x_center"]))
            current = [box]
    lines.append(sorted(current, key=lambda b: b["x_center"]))
    return lines

def filter_lines(raw_lines, avg_w):
    usable = [line for line in raw_lines if len(line) >= 3]
    if not usable:
        return []
    starts = [line[0]["x_center"] for line in usable]
    median_start = float(np.median(starts))
    normal_starts = [x for x in starts if x > median_start - avg_w * 3.0]
    left_reference = float(np.median(normal_starts)) if normal_starts else median_start
    result = []
    for line in usable:
        cleaned = [box for box in line if box["x_center"] >= left_reference - avg_w]
        while len(cleaned) >= 2:
            gap = cleaned[-1]["xmin"] - cleaned[-2]["xmax"]
            if gap > avg_w * 2.8:
                cleaned.pop()
            else:
                break
        if len(cleaned) >= 1: 
            result.append(cleaned)
    return result

def transcribe_braille(image_path, model, annotated_output_path=None):
    image = cv2.imread(image_path)
    if image is None:
        raise ValueError(f"Could not read input image: {image_path}")

    output_path = annotated_output_path or os.path.join(
        OUTPUT_DIR, f"pred_{os.path.basename(image_path)}"
    )

    def save_annotation(annotated):
        if not cv2.imwrite(output_path, annotated):
            raise OSError(f"Could not save annotated image: {output_path}")

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    background = float(np.median(gray))

    prediction = model.predict(
        source=image_path, conf=CONF_THRESHOLD, iou=IOU_THRESHOLD,
        agnostic_nms=True, imgsz=IMAGE_SIZE, save=False, verbose=False
    )[0]

    if prediction.boxes is None or len(prediction.boxes) == 0:
        save_annotation(image)
        return "No Braille characters detected."

    boxes = []
    for detection in prediction.boxes:
        coords = detection.xyxy[0].cpu().numpy()
        xmin, ymin, xmax, ymax = map(float, coords)
        width = xmax - xmin
        height = ymax - ymin
        if width <= 2 or height <= 2:
            continue
        class_id = int(detection.cls[0].item())
        confidence = float(detection.conf[0].item())
        label = str(model.names[class_id])
        boxes.append({
            "xmin": xmin, "ymin": ymin, "xmax": xmax, "ymax": ymax,
            "x_center": (xmin + xmax) / 2.0, "y_center": (ymin + ymax) / 2.0,
            "width": width, "height": height, "label": label, "conf": confidence
        })

    if not boxes:
        save_annotation(image)
        return "No valid Braille cells found."

    # Enforce has_dot_content for punctuation
    filtered = []
    for box in boxes:
        if box["label"] in PUNCTUATION_LABELS:
            if box["conf"] < PUNCT_CONF_THRESHOLD or not has_dot_content(gray, box, background):
                continue
        filtered.append(box)
    boxes = filtered

    boxes = suppress_duplicates(boxes)

    avg_w = float(np.median([b["width"] for b in boxes]))
    avg_h = float(np.median([b["height"] for b in boxes]))

    raw_lines = group_into_lines(boxes, avg_h)

    lines = filter_lines(raw_lines, avg_w)

    if not lines:
        save_annotation(image)
        return "No valid Braille lines found after filtering."

    annotated = image.copy()
    for line in lines:
        for box in line:
            x1, y1 = int(box["xmin"]), int(box["ymin"])
            x2, y2 = int(box["xmax"]), int(box["ymax"])
            cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 255, 0), 2)
            cv2.putText(annotated, box["label"], (x1, max(y1 - 5, 15)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2, cv2.LINE_AA)

    save_annotation(annotated)

    number_map = {"a": "1", "b": "2", "c": "3", "d": "4", "e": "5", "f": "6", "g": "7", "h": "8", "i": "9", "j": "0"}
    punctuation_map = {"period": ".", "comma": ",", "excla": "!"}

    output_lines = []
    for line in lines:
        text = []
        is_capital = False
        is_number = False
        previous = None

        for box in line:
            if previous is not None:
                gap = box["xmin"] - previous["xmax"]
                if gap > avg_w * 1.2: 
                    text.append(" ")
                    is_number = False

            label = box["label"]

            if label == "CAP":
                is_capital = True
            elif label == "#":
                is_number = True
            elif label in punctuation_map:
                text.append(punctuation_map[label])
                is_number = False
            else:
                character = label
                if is_number and character in number_map:
                    character = number_map[character]
                elif is_number:
                    is_number = False
                    is_capital = False
                if is_capital and not is_number:
                    character = character.upper()
                    is_capital = False
                text.append(character)

            previous = box

        output_lines.append("".join(text))

    return "\n".join(output_lines)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", default=TEST_IMG_DIR)
    parser.add_argument("--output-dir", default=OUTPUT_DIR)
    parser.add_argument("--text-output-dir", default=None)
    parser.add_argument("--model", default=MODEL_PATH)
    args = parser.parse_args()

    print(f"Loading model: {args.model}")
    if not os.path.isfile(args.model):
        raise FileNotFoundError(f"Model file not found: {args.model}")

    os.makedirs(args.output_dir, exist_ok=True)
    text_output_dir = args.text_output_dir or args.output_dir
    os.makedirs(text_output_dir, exist_ok=True)
    model = YOLO(args.model)
    extensions = ("*.jpg", "*.jpeg", "*.png", "*.bmp")
    image_paths = []
    for extension in extensions:
        image_paths.extend(glob.glob(os.path.join(args.input_dir, extension)))
    image_paths = sorted(image_paths)

    if not image_paths:
        raise FileNotFoundError(f"No test images in {args.input_dir}.")

    for image_path in image_paths:
        print("=" * 30)
        print(f"IMAGE: {os.path.basename(image_path)}")
        base_name = f"pred_{os.path.splitext(os.path.basename(image_path))[0]}"
        image_file_path = os.path.join(args.output_dir, f"{base_name}.png")
        translation = transcribe_braille(image_path, model, image_file_path)
        print(f"TRANSLATION:\n{translation}")

        text_file_path = os.path.join(text_output_dir, f"{base_name}.txt")
        with open(text_file_path, "w", encoding="utf-8") as f:
            f.write(translation)
        print(f"Saved text to: {text_file_path}")
        print("=" * 30 + "\n")