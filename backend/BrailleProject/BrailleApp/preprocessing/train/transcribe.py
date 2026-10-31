import os
import glob
from collections import Counter
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
PUNCT_MIN_DOT_PIXELS = 15       # Increased to ensure empty boxes fail
DOT_DIFF = 35                   # Increased to ignore faint smudges

CENTER_DUP_X_FRAC = 0.8         
CENTER_DUP_Y_FRAC = 0.5         
OVERLAP_DUP_FRAC = 0.15         

LETTER_DOTS = {
    "a": (1,), "b": (1, 2), "c": (1, 4), "d": (1, 4, 5), "e": (1, 5),
    "f": (1, 2, 4), "g": (1, 2, 4, 5), "h": (1, 2, 5), "i": (2, 4), "j": (2, 4, 5),
    "k": (1, 3), "l": (1, 2, 3), "m": (1, 3, 4), "n": (1, 3, 4, 5), "o": (1, 3, 5),
    "p": (1, 2, 3, 4), "q": (1, 2, 3, 4, 5), "r": (1, 2, 3, 5), "s": (2, 3, 4),
    "t": (2, 3, 4, 5), "u": (1, 3, 6), "v": (1, 2, 3, 6), "w": (2, 4, 5, 6),
    "x": (1, 3, 4, 6), "y": (1, 3, 4, 5, 6), "z": (1, 3, 5, 6),
}
SIGN_DOTS = {
    "CAP": (6,), "#": (3, 4, 5, 6),
    "comma": (2,), "period": (2, 5, 6), "excla": (2, 3, 5),
}
EXPECTED_DOTS = {**LETTER_DOTS, **SIGN_DOTS}
PATTERN_TO_LETTER = {dots: letter for letter, dots in LETTER_DOTS.items()}

GRID_MIN_PIXELS = 12            
GRID_REL_FRAC = 0.30            
PRINT_CORRECTIONS = True        

ENABLE_PATTERN_FIXES = True     
RECOVER_MIN_DOTS = 2            # INCREASED from 1 to 2 to prevent fake commas from noise

STATS = {
    "relabeled": Counter(),     
    "kept_disagree": Counter(), 
    "recovered": Counter(),     
}

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

def dot_center_offset(gray, box, background):
    h, w = gray.shape
    x1, y1 = max(0, int(box["xmin"])), max(0, int(box["ymin"]))
    x2, y2 = min(w, int(box["xmax"])), min(h, int(box["ymax"]))
    if x2 <= x1 or y2 <= y1:
        return 99.0
    crop = gray[y1:y2, x1:x2].astype(np.float32)
    ys, xs = np.nonzero(np.abs(crop - background) > DOT_DIFF)
    if len(xs) == 0:
        return 99.0
    cx = xs.mean() + x1
    cy = ys.mean() + y1
    return float(np.hypot(cx - box["x_center"], cy - box["y_center"]) / max(1.0, box["width"]))

def suppress_close_centers(boxes, avg_w, avg_h, gray, background):
    def rank(b):
        if b["label"] in PUNCTUATION_LABELS:
            return (1, dot_center_offset(gray, b, background), -b["conf"])
        return (0, -b["conf"])

    kept = []
    for box in sorted(boxes, key=rank):
        duplicate = False
        for k in kept:
            if abs(box["y_center"] - k["y_center"]) >= avg_h * CENTER_DUP_Y_FRAC:
                continue
            x_overlap = min(box["xmax"], k["xmax"]) - max(box["xmin"], k["xmin"])
            narrower = min(box["width"], k["width"])
            close = abs(box["x_center"] - k["x_center"]) < avg_w * CENTER_DUP_X_FRAC
            if x_overlap > narrower * OVERLAP_DUP_FRAC or close:
                duplicate = True
                break
        if not duplicate:
            kept.append(box)
    return sorted(kept, key=lambda b: (b["y_center"], b["x_center"]))

def read_dot_pattern(gray, box, background):
    h, w = gray.shape
    x1, y1 = max(0, int(box["xmin"])), max(0, int(box["ymin"]))
    x2, y2 = min(w, int(box["xmax"])), min(h, int(box["ymax"]))
    if x2 - x1 < 4 or y2 - y1 < 6:
        return None

    crop = gray[y1:y2, x1:x2].astype(np.float32)
    changed = np.abs(crop - background) > DOT_DIFF
    ch, cw = changed.shape

    counts = {}
    for col in range(2):
        for row in range(3):
            ya, yb = int(row * ch / 3), int((row + 1) * ch / 3)
            xa, xb = int(col * cw / 2), int((col + 1) * cw / 2)
            counts[col * 3 + row + 1] = int(np.count_nonzero(changed[ya:yb, xa:xb]))

    strongest = max(counts.values())
    if strongest < PUNCT_MIN_DOT_PIXELS:
        return None

    need = max(GRID_MIN_PIXELS, GRID_REL_FRAC * strongest)
    
    detected_dots = [d for d, c in counts.items() if c >= need]
    
    if len(detected_dots) == 0:
        return None
        
    return tuple(sorted(detected_dots))

def correct_labels(boxes, gray, background):
    for box in boxes:
        label = box["label"]
        expected = EXPECTED_DOTS.get(label)
        
        if expected is None:
            continue

        pattern = read_dot_pattern(gray, box, background)
        if pattern is None or pattern == expected:
            continue

        letter = PATTERN_TO_LETTER.get(pattern)
        if letter is None or letter == label:
            continue

        STATS["relabeled"][(label, letter)] += 1
        if PRINT_CORRECTIONS:
            print(f"  relabeled '{label}' -> '{letter}' (conf {box['conf']:.2f}, dots {pattern})")
        box["label"] = letter

    return boxes

def recover_missing(line, avg_w, avg_h, gray, background):
    if len(line) < 2:
        return line

    line = sorted(line, key=lambda b: b["x_center"])
    diffs = sorted(line[i + 1]["x_center"] - line[i]["x_center"] for i in range(len(line) - 1))
    pitch = float(np.median(diffs[:max(1, len(diffs) // 2)]))
    pitch = max(pitch, avg_w)
    y_center = float(np.median([b["y_center"] for b in line]))

    result = list(line)

    for i in range(len(line) - 1):
        a, b = line[i], line[i + 1]
        distance = b["x_center"] - a["x_center"]
        cells = int(round(distance / pitch))

        if cells < 2:
            continue

        for k in range(1, cells):
            cx = a["x_center"] + distance * k / cells
            candidate = {
                "xmin": cx - avg_w / 2.0, "xmax": cx + avg_w / 2.0,
                "ymin": y_center - avg_h / 2.0, "ymax": y_center + avg_h / 2.0,
                "x_center": cx, "y_center": y_center,
                "width": avg_w, "height": avg_h, "label": "", "conf": 0.0,
            }

            pattern = read_dot_pattern(gray, candidate, background)
            if pattern is None or len(pattern) < RECOVER_MIN_DOTS:
                continue

            letter = PATTERN_TO_LETTER.get(pattern)
            if letter is None:
                continue

            candidate["label"] = letter
            STATS["recovered"][letter] += 1
            if PRINT_CORRECTIONS:
                print(f"  recovered missing '{letter}' (dots {pattern}) at x={cx:.0f}")
            result.append(candidate)

    return sorted(result, key=lambda b: b["x_center"])

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

def transcribe_braille(image_path, model):
    image = cv2.imread(image_path)
    if image is None:
        return ""

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    background = float(np.median(gray))

    prediction = model.predict(
        source=image_path, conf=CONF_THRESHOLD, iou=IOU_THRESHOLD,
        agnostic_nms=True, imgsz=IMAGE_SIZE, save=False, verbose=False
    )[0]

    if prediction.boxes is None or len(prediction.boxes) == 0:
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
        return "No valid Braille cells found."

    # --- FIX: Enforce has_dot_content for punctuation ---
    filtered = []
    for box in boxes:
        if box["label"] in PUNCTUATION_LABELS:
            # Only keep punctuation if it passes BOTH confidence and physical dot content
            if box["conf"] < PUNCT_CONF_THRESHOLD or not has_dot_content(gray, box, background):
                continue
        filtered.append(box)
    boxes = filtered

    boxes = suppress_duplicates(boxes)

    size_source = boxes 
    avg_w = float(np.median([b["width"] for b in size_source]))
    avg_h = float(np.median([b["height"] for b in size_source]))

    boxes = suppress_close_centers(boxes, avg_w, avg_h, gray, background)

    if ENABLE_PATTERN_FIXES:
        boxes = correct_labels(boxes, gray, background)

    raw_lines = group_into_lines(boxes, avg_h)

    if ENABLE_PATTERN_FIXES:
        raw_lines = [recover_missing(line, avg_w, avg_h, gray, background) for line in raw_lines]

    lines = filter_lines(raw_lines, avg_w)

    if not lines:
        return "No valid Braille lines found after filtering."

    annotated = image.copy()
    for line in lines:
        for box in line:
            x1, y1 = int(box["xmin"]), int(box["ymin"])
            x2, y2 = int(box["xmax"]), int(box["ymax"])
            cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 255, 0), 2)
            cv2.putText(annotated, box["label"], (x1, max(y1 - 5, 15)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2, cv2.LINE_AA)

    output_path = os.path.join(OUTPUT_DIR, f"pred_{os.path.basename(image_path)}")
    cv2.imwrite(output_path, annotated)

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
    print(f"Loading model: {MODEL_PATH}")
    if not os.path.isfile(MODEL_PATH):
        raise FileNotFoundError(f"Model file not found: {MODEL_PATH}")

    model = YOLO(MODEL_PATH)
    extensions = ("*.jpg", "*.jpeg", "*.png", "*.bmp")
    image_paths = []
    for extension in extensions:
        image_paths.extend(glob.glob(os.path.join(TEST_IMG_DIR, extension)))
    image_paths = sorted(image_paths)

    if not image_paths:
        print(f"No test images in {TEST_IMG_DIR}.")

    for image_path in image_paths:
        print("=" * 30)
        print(f"IMAGE: {os.path.basename(image_path)}")
        translation = transcribe_braille(image_path, model)
        print(f"TRANSLATION:\n{translation}")

        base_name = f"pred_{os.path.splitext(os.path.basename(image_path))[0]}"
        text_file_path = os.path.join(TEXT_OUTPUT_DIR, f"{base_name}.txt")
        with open(text_file_path, "w", encoding="utf-8") as f:
            f.write(translation)
        print(f"Saved text to: {text_file_path}")
        print("=" * 30 + "\n")