"""
TRAFCON360 - Unified Number Plate Detection Pipeline
=====================================================
Merges the best of both pretrained plate detection approaches:
  • Model 1 (number_plate_detection):  CLI args, GPU support, vehicle-crop fallback
  • Model 2 (license_plate_detection2): Custom-trained YOLOv8n plate detector

Supports:
  - Dedicated license plate YOLO model (default: models/best.pt)
  - Fallback: direct OCR on lower-half vehicle crops when no plate model available
  - Strict 7-char format + permissive alphanumeric OCR
  - SORT-based multi-object tracking
  - Top-N highest-confidence plate image saving

Usage:
    python main.py --video ./sample.mp4
    python main.py --video ./sample.mp4 --license-model ./models/best.pt --output ./output/results.csv
    python main.py --video ./sample.mp4 --ocr-mode permissive
"""

from ultralytics import YOLO
import cv2
import os
import argparse
import numpy as np
import torch

import util
from util import (
    get_car,
    read_license_plate,
    read_license_plate_any,
    read_license_plate_combined,
    write_csv,
)

TOP_N_IMAGES = 5  # number of highest-confidence plate images to save


def main():
    parser = argparse.ArgumentParser(
        description='TRAFCON360 Unified Number Plate Detection Pipeline'
    )
    parser.add_argument('--video', '-v', required=True,
                        help='Path to input video')
    parser.add_argument('--license-model', '-m',
                        default='./models/best.pt',
                        help='Path to license plate detector model (.pt)')
    parser.add_argument('--vehicle-model',
                        default='./yolov8n.pt',
                        help='Path to COCO vehicle detector (default: yolov8n.pt)')
    parser.add_argument('--output', '-o',
                        default='./output/results.csv',
                        help='Path to output CSV file')
    parser.add_argument('--top-n', type=int, default=5,
                        help='Number of top plate images to save (default: 5)')
    parser.add_argument('--ocr-mode',
                        choices=['strict', 'permissive', 'combined'],
                        default='combined',
                        help='OCR mode: strict (7-char), permissive (4-10 alphanumeric), combined (try strict then permissive)')
    args = parser.parse_args()

    global TOP_N_IMAGES
    TOP_N_IMAGES = args.top_n

    # ── Device selection ─────────────────────────────────────────────────
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    if device == 'cuda':
        print(f'[GPU] {torch.cuda.get_device_name(0)} — running on CUDA')
    else:
        print('[CPU] No CUDA GPU found — running on CPU')

    # ── OCR function selection ───────────────────────────────────────────
    ocr_fn_map = {
        'strict': read_license_plate,
        'permissive': read_license_plate_any,
        'combined': read_license_plate_combined,
    }
    ocr_fn = ocr_fn_map[args.ocr_mode]
    print(f'[OCR] Mode: {args.ocr_mode}')

    # ── Output directories ───────────────────────────────────────────────
    out_dir = os.path.dirname(os.path.abspath(args.output))
    plates_dir = os.path.join(out_dir, 'plate_images')
    os.makedirs(plates_dir, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)

    results = {}
    # Collect ALL candidate crops: (combined_score, ocr_score, bbox_score, frame_nmr, car_id, image, text)
    all_candidates = []

    # ── SORT tracker ─────────────────────────────────────────────────────
    try:
        from sort.sort import Sort
        mot_tracker = Sort()
        print('[TRACKER] SORT tracker loaded')
    except Exception as e:
        mot_tracker = None
        print(f'[TRACKER] SORT not available ({e}). Tracking will be skipped.')

    # ── Load COCO vehicle detection model ────────────────────────────────
    if not os.path.exists(args.vehicle_model):
        raise FileNotFoundError(f'Vehicle model not found: {args.vehicle_model}')
    coco_model = YOLO(args.vehicle_model)
    print(f'[MODEL] Vehicle detector: {args.vehicle_model}')

    # ── Load license plate detector (optional) ───────────────────────────
    license_plate_detector = None
    if os.path.exists(args.license_model):
        license_plate_detector = YOLO(args.license_model)
        print(f'[MODEL] Plate detector: {args.license_model}')
    else:
        print(f'[MODEL] Plate model not found at {args.license_model}')
        print('[MODEL] Falling back to direct OCR on vehicle crops')

    # ── Load video ───────────────────────────────────────────────────────
    if not os.path.exists(args.video):
        raise FileNotFoundError(f'Input video not found: {args.video}')
    cap = cv2.VideoCapture(args.video)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f'[VIDEO] {args.video}  ({total_frames} frames)')
    print(f'[OUTPUT] CSV → {args.output}')
    print(f'[OUTPUT] Plates → {plates_dir}  (top {TOP_N_IMAGES})')
    print()

    vehicles = [2, 3, 5, 7]  # car, motorbike, bus, truck

    frame_nmr = -1
    ret = True
    while ret:
        frame_nmr += 1
        ret, frame = cap.read()
        if not ret:
            break

        results[frame_nmr] = {}

        # ── Detect vehicles ──────────────────────────────────────────────
        detections = coco_model(frame, device=device, verbose=False)[0]
        detections_ = []
        for detection in detections.boxes.data.tolist():
            x1, y1, x2, y2, score, class_id = detection
            if int(class_id) in vehicles:
                detections_.append([x1, y1, x2, y2, score])

        # ── Track vehicles ───────────────────────────────────────────────
        track_ids = []
        if mot_tracker is not None and len(detections_) > 0:
            track_ids = mot_tracker.update(np.asarray(detections_))

        # ── Path A: dedicated license plate model ────────────────────────
        if license_plate_detector is not None:
            license_plates = license_plate_detector(frame, device=device, verbose=False)[0]
            for license_plate in license_plates.boxes.data.tolist():
                x1, y1, x2, y2, score, class_id = license_plate

                # Match plate to tracked vehicle
                if len(track_ids) > 0:
                    car = get_car(license_plate, track_ids)
                else:
                    car = (-1, -1, -1, -1, -1)

                car_id = int(car[4]) if car[4] != -1 else int(score * 10000)
                xcar1, ycar1, xcar2, ycar2 = car[0], car[1], car[2], car[3]

                # Crop and threshold the plate region
                license_plate_crop = frame[int(y1):int(y2), int(x1):int(x2), :]
                if license_plate_crop.size == 0:
                    continue

                license_plate_crop_gray = cv2.cvtColor(license_plate_crop, cv2.COLOR_BGR2GRAY)
                _, license_plate_crop_thresh = cv2.threshold(
                    license_plate_crop_gray, 64, 255, cv2.THRESH_BINARY_INV
                )

                # OCR
                license_plate_text, license_plate_text_score = ocr_fn(license_plate_crop_thresh)

                if license_plate_text is not None:
                    combined_score = float(license_plate_text_score) * float(score)
                    results[frame_nmr][car_id] = {
                        'car': {'bbox': [xcar1, ycar1, xcar2, ycar2]},
                        'license_plate': {
                            'bbox': [x1, y1, x2, y2],
                            'text': license_plate_text,
                            'bbox_score': score,
                            'text_score': license_plate_text_score,
                        },
                    }
                    all_candidates.append((
                        combined_score,
                        float(license_plate_text_score),
                        float(score),
                        frame_nmr,
                        car_id,
                        license_plate_crop.copy(),
                        license_plate_text,
                    ))

        # ── Path B: no plate model — crop lower half of each vehicle ─────
        else:
            for det in detections_:
                x1, y1, x2, y2, score = det

                # Focus on the lower 45% of the vehicle bbox (where plates live)
                plate_y1 = int(y1 + (y2 - y1) * 0.55)
                plate_y2 = int(y2)
                car_crop = frame[plate_y1:plate_y2, int(x1):int(x2), :]
                if car_crop.size == 0:
                    continue

                gray = cv2.cvtColor(car_crop, cv2.COLOR_BGR2GRAY)
                _, thresh_inv = cv2.threshold(gray, 64, 255, cv2.THRESH_BINARY_INV)
                _, thresh_bin = cv2.threshold(gray, 64, 255, cv2.THRESH_BINARY)

                # Try inverted threshold first, then binary
                text, text_score = ocr_fn(thresh_inv)
                if text is None:
                    text, text_score = ocr_fn(thresh_bin)

                if text is not None:
                    car_id = int(score * 10000)
                    combined_score = float(text_score) * float(score)
                    results[frame_nmr][car_id] = {
                        'car': {'bbox': [x1, y1, x2, y2]},
                        'license_plate': {
                            'bbox': [x1, plate_y1, x2, plate_y2],
                            'text': text,
                            'bbox_score': score,
                            'text_score': text_score,
                        },
                    }
                    all_candidates.append((
                        combined_score,
                        float(text_score),
                        float(score),
                        frame_nmr,
                        car_id,
                        car_crop.copy(),
                        text,
                    ))

        if frame_nmr % 50 == 0:
            print(f'  frame {frame_nmr}/{total_frames} processed...')

    cap.release()

    # ── Save top-N highest-confidence plate images ───────────────────────
    all_candidates.sort(key=lambda x: x[0], reverse=True)  # sort by combined score
    saved_count = 0
    seen_texts = set()

    print(f'\nSaving top {TOP_N_IMAGES} license plate detections:')
    for combined_score, ocr_score, bbox_score, f_nr, c_id, crop, text in all_candidates:
        if saved_count >= TOP_N_IMAGES:
            break
        if text and text not in seen_texts:
            img_name = f'plate_top{saved_count + 1}_frame{f_nr:05d}_{text}_combined{combined_score:.3f}.jpg'
            cv2.imwrite(os.path.join(plates_dir, img_name), crop)
            seen_texts.add(text)
            saved_count += 1
            print(f'  [{saved_count}] {img_name}')
            print(f'      Text={text}  OCR={ocr_score:.3f}  BBox={bbox_score:.3f}  Combined={combined_score:.3f}')

    # Fill remaining slots with duplicates if needed
    if saved_count < TOP_N_IMAGES:
        for combined_score, ocr_score, bbox_score, f_nr, c_id, crop, text in all_candidates:
            if saved_count >= TOP_N_IMAGES:
                break
            img_name = f'plate_top{saved_count + 1}_frame{f_nr:05d}_dup_combined{combined_score:.3f}.jpg'
            full_path = os.path.join(plates_dir, img_name)
            if not os.path.exists(full_path):
                cv2.imwrite(full_path, crop)
                saved_count += 1
                print(f'  [{saved_count}] {img_name}  score={combined_score:.4f}')

    # ── Write results CSV ────────────────────────────────────────────────
    write_csv(results, args.output)

    print(f'\n{"=" * 50}')
    print(f'Device       → {device.upper()}')
    print(f'OCR mode     → {args.ocr_mode}')
    print(f'Plate model  → {args.license_model if license_plate_detector else "NONE (vehicle-crop fallback)"}')
    print(f'Results CSV  → {args.output}')
    print(f'Plate images → {plates_dir}  ({saved_count} saved)')
    print(f'{"=" * 50}')


if __name__ == '__main__':
    main()
