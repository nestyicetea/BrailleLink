import os
import glob
import numpy as np
import cv2
from ultralytics import YOLO

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "models", "yolov11s_exp2.pt")
TEST_IMG_DIR = os.path.join(BASE_DIR, "test_images")
OUTPUT_DIR = os.path.join(BASE_DIR, "outputs")

os.makedirs(OUTPUT_DIR, exist_ok=True)

def transcribe_braille(image_path, model):
    img = cv2.imread(image_path)
    if img is None:
        return ""

    img_h, img_w = img.shape[:2]

    # 1. Run inference
    results = model.predict(source=image_path, conf=0.35, iou=0.45, save=False, verbose=False)[0]
    
    if len(results.boxes) == 0:
        return "No Braille characters detected."

    # 2. Extract raw candidate boxes
    raw_detections = []
    # Define 2% border margin buffer
    margin_x = int(img_w * 0.02)
    margin_y = int(img_h * 0.02)

    for box in results.boxes:
        xyxy = box.xyxy[0].cpu().numpy()
        cls_id = int(box.cls[0])
        conf = float(box.conf[0])
        class_name = model.names[cls_id]

        xmin, ymin, xmax, ymax = xyxy
        width = xmax - xmin
        height = ymax - ymin

        # Filter A: Drop boxes touching or sitting in the extreme corner/border margins
        if xmin <= margin_x or ymin <= margin_y or xmax >= (img_w - margin_x) or ymax >= (img_h - margin_y):
            continue

        # Filter B: Require higher confidence for the ghost class 'v'
        if class_name == 'v' and conf < 0.60:
            continue

        # Filter C: Filter extreme sliver aspect ratios
        if height <= 0 or width <= 0:
            continue
        aspect_ratio = width / height
        if aspect_ratio < 0.35 or aspect_ratio > 1.2:
            continue

        raw_detections.append({
            'xmin': xmin,
            'ymin': ymin,
            'xmax': xmax,
            'ymax': ymax,
            'x_center': (xmin + xmax) / 2,
            'y_center': (ymin + ymax) / 2,
            'width': width,
            'height': height,
            'label': class_name,
            'conf': conf
        })

    if not raw_detections:
        return "No valid Braille cells found."

    # Filter D: Median cell dimension filter (discards irregular outlier boxes)
    median_h = np.median([d['height'] for d in raw_detections])
    median_w = np.median([d['width'] for d in raw_detections])

    valid_detections = [
        d for d in raw_detections
        if (0.5 * median_h <= d['height'] <= 1.8 * median_h) and
           (0.5 * median_w <= d['width'] <= 1.8 * median_w)
    ]

    if not valid_detections:
        return "No valid Braille cells passed dimension consistency."

    # 3. Draw annotations
    annotated_img = img.copy()
    for d in valid_detections:
        x1, y1, x2, y2 = int(d['xmin']), int(d['ymin']), int(d['xmax']), int(d['ymax'])
        cv2.rectangle(annotated_img, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(annotated_img, d['label'], (x1, max(y1 - 5, 15)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

    # 4. Line segmentation & spatial ordering
    avg_h = np.mean([d['height'] for d in valid_detections])
    avg_w = np.mean([d['width'] for d in valid_detections])

    valid_detections = sorted(valid_detections, key=lambda b: b['y_center'])
    lines = []
    current_line = [valid_detections[0]]

    for box in valid_detections[1:]:
        if abs(box['y_center'] - current_line[-1]['y_center']) < (avg_h * 0.5):
            current_line.append(box)
        else:
            lines.append(sorted(current_line, key=lambda b: b['xmin']))
            current_line = [box]
    lines.append(sorted(current_line, key=lambda b: b['xmin']))

    # 5. Braille translation state machine
    num_map = {'a': '1', 'b': '2', 'c': '3', 'd': '4', 'e': '5',
               'f': '6', 'g': '7', 'h': '8', 'i': '9', 'j': '0'}
    punct_map = {'period': '.', 'comma': ',', 'excla': '!'}

    full_transcription = []

    for line in lines:
        line_text = []
        is_cap = False
        is_num = False
        prev_box = None

        for box in line:
            if prev_box is not None:
                gap = box['xmin'] - prev_box['xmax']
                if gap > (avg_w * 0.85):
                    line_text.append(" ")
                    is_num = False

            label = box['label']

            if label == 'CAP':
                is_cap = True
            elif label == '#':
                is_num = True
            elif label in punct_map:
                line_text.append(punct_map[label])
                is_num = False
            else:
                char = label
                if is_num and char in num_map:
                    char = num_map[char]
                elif is_cap:
                    char = char.upper()
                    is_cap = False
                line_text.append(char)

            prev_box = box

        full_transcription.append("".join(line_text))

    img_name = os.path.basename(image_path)
    cv2.imwrite(os.path.join(OUTPUT_DIR, f"pred_{img_name}"), annotated_img)

    return "\n".join(full_transcription)

if __name__ == "__main__":
    print("Loading YOLOv11s Braille model...")
    model = YOLO(MODEL_PATH)

    image_extensions = ("*.jpg", "*.jpeg", "*.png", "*.bmp")
    image_paths = []
    for ext in image_extensions:
        image_paths.extend(glob.glob(os.path.join(TEST_IMG_DIR, ext)))

    if not image_paths:
        print(f"No test images found in {TEST_IMG_DIR}.")
    else:
        for img_p in image_paths:
            filename = os.path.basename(img_p)
            text_result = transcribe_braille(img_p, model)
            print(f"==============================")
            print(f"IMAGE: {filename}")
            print(f"TRANSLATION:\n{text_result}")
            print(f"==============================\n")