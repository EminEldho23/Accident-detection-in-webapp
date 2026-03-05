# TRAFCON360 — Unified Number Plate Detection

Combined pipeline merging two pretrained number plate detection approaches into a single, production-ready module.

## Folder Structure

```
plate_detection/
├── main.py                  # Unified detection pipeline (CLI)
├── util.py                  # OCR utilities (strict + permissive + combined)
├── add_missing_data.py      # Bounding box interpolation for missing frames
├── visualize.py             # Overlay detections on video
├── requirements.txt         # Python dependencies
├── yolov8n.pt               # YOLOv8n COCO vehicle detector
├── models/
│   └── best.pt              # Custom-trained YOLOv8n license plate detector
├── sort/
│   ├── __init__.py
│   └── sort.py              # SORT multi-object tracker
├── training/
│   ├── data.yaml            # Training dataset config
│   └── args.yaml            # Training hyperparameters
└── output/                  # Default output directory
```

## What Was Merged

| Feature | Source | Notes |
|---|---|---|
| CLI arguments, GPU auto-detection | `number_plate_detection` | argparse-based, CUDA/CPU |
| Custom-trained plate detector model | `license_plate_detection2` | `train31/weights/best.pt` |
| Strict OCR (7-char format AA00AAA) | Both | `read_license_plate()` |
| Permissive OCR (4-10 alphanumeric) | `number_plate_detection` | `read_license_plate_any()` |
| Combined OCR (strict → permissive) | **New** | `read_license_plate_combined()` |
| Vehicle-crop fallback (no plate model) | `number_plate_detection` | OCR on lower-half vehicle bbox |
| Combined confidence scoring | `license_plate_detection2` | `text_score × bbox_score` |
| SORT tracker | Both | Identical implementation |
| Top-N plate image saving | Both | Deduplicated by plate text |
| Bounding box interpolation | Both | `add_missing_data.py` |
| Video visualization | Both | `visualize.py` |

## Quick Start

```bash
# 1. Run detection with custom plate model (default)
python main.py --video ./sample.mp4

# 2. Run with specific paths
python main.py --video ./sample.mp4 --license-model ./models/best.pt --output ./output/results.csv

# 3. Run without plate model (vehicle-crop fallback)
python main.py --video ./sample.mp4 --license-model none.pt

# 4. Choose OCR mode
python main.py --video ./sample.mp4 --ocr-mode strict       # 7-char format only
python main.py --video ./sample.mp4 --ocr-mode permissive   # any 4-10 alphanumeric
python main.py --video ./sample.mp4 --ocr-mode combined     # try strict, fallback permissive (default)

# 5. Interpolate missing frames
python add_missing_data.py --input ./output/results.csv --output ./output/results_interpolated.csv

# 6. Visualize on video
python visualize.py --video ./sample.mp4 --csv ./output/results_interpolated.csv --output ./output/out.mp4
```

## OCR Modes

- **strict**: Only accepts plates matching the 7-character `AA00AAA` format (e.g., US plates)
- **permissive**: Accepts any 4-10 character alphanumeric string (best for international plates)
- **combined** (default): Tries strict first, falls back to permissive — best overall accuracy

## Models

- **yolov8n.pt**: Pretrained YOLOv8n on COCO dataset — detects vehicles (car, motorbike, bus, truck)
- **models/best.pt**: Custom-trained YOLOv8n on license plate dataset (Roboflow License-Plate-Recognition-4)
