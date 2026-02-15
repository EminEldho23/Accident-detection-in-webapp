"""
TRAFCCON360 - FastAPI Accident Detection ML Service
YOLOv8 crash detection endpoint for ESP32-CAM image verification
Runs on localhost:8000
"""

import base64
import io
import os
import logging
from datetime import datetime
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
import uvicorn

# ── App Setup ────────────────────────────────────────────────
app = FastAPI(
    title="TRAFCCON360 - Accident Detection ML",
    description="YOLOv8-based accident detection API for ESP32-CAM streams",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("traffcon360-ml")

# ── YOLOv8 Model Loading ────────────────────────────────────
MODEL = None
MODEL_PATH = os.environ.get(
    "YOLO_MODEL_PATH",
    os.path.join(os.path.dirname(__file__), "models", "best.pt"),
)

# Fallback model paths (check accident detection system)
FALLBACK_PATHS = [
    os.path.join(os.path.dirname(__file__), "models", "best.pt"),
    os.path.join(os.path.dirname(__file__), "..", "..", "accident-detection-system", "best.pt"),
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "Accident_detection_only", "best.pt"),
    os.path.join(os.path.dirname(__file__), "models", "yolov8n.pt"),
]


def load_model():
    """Load YOLOv8 model with fallbacks"""
    global MODEL
    try:
        from ultralytics import YOLO

        # Try primary path first
        for path in [MODEL_PATH] + FALLBACK_PATHS:
            resolved = os.path.abspath(path)
            if os.path.exists(resolved):
                logger.info(f"Loading YOLOv8 model from: {resolved}")
                MODEL = YOLO(resolved)
                logger.info("✅ YOLOv8 model loaded successfully")
                return

        # Fallback: download pretrained YOLOv8n
        logger.warning("No custom model found, downloading yolov8n.pt...")
        MODEL = YOLO("yolov8n.pt")
        logger.info("✅ YOLOv8n (pretrained) loaded as fallback")

    except ImportError:
        logger.error("❌ ultralytics not installed. Run: pip install ultralytics")
    except Exception as e:
        logger.error(f"❌ Failed to load model: {e}")


@app.on_event("startup")
async def startup():
    load_model()
    logger.info("🚀 TRAFCCON360 FastAPI ML Service started on port 8000")


# ── Schemas ──────────────────────────────────────────────────
class DetectRequest(BaseModel):
    image: str  # base64 encoded image
    accident_id: Optional[str] = None
    gps: Optional[str] = None


class DetectResponse(BaseModel):
    is_accident: bool
    confidence: float
    severity: str  # low, medium, high, critical
    detections: list
    processing_time_ms: float
    accident_id: Optional[str] = None


# ── Detection Logic ──────────────────────────────────────────
def classify_severity(confidence: float) -> str:
    """Map detection confidence to severity level"""
    if confidence >= 0.85:
        return "critical"
    elif confidence >= 0.65:
        return "high"
    elif confidence >= 0.45:
        return "medium"
    return "low"


def decode_base64_image(b64_string: str) -> Image.Image:
    """Decode base64 string to PIL Image"""
    # Strip data URL prefix if present
    if "," in b64_string:
        b64_string = b64_string.split(",", 1)[1]
    image_bytes = base64.b64decode(b64_string)
    return Image.open(io.BytesIO(image_bytes)).convert("RGB")


def run_detection(image: Image.Image) -> dict:
    """Run YOLOv8 inference on image"""
    if MODEL is None:
        raise HTTPException(status_code=503, detail="ML model not loaded")

    start = datetime.now()

    # Run inference
    results = MODEL(image, conf=0.25, verbose=False)

    elapsed_ms = (datetime.now() - start).total_seconds() * 1000

    # Parse detections
    detections = []
    max_confidence = 0.0
    is_accident = False

    for result in results:
        boxes = result.boxes
        if boxes is not None:
            for box in boxes:
                conf = float(box.conf[0])
                cls_id = int(box.cls[0])
                cls_name = result.names.get(cls_id, f"class_{cls_id}")
                xyxy = box.xyxy[0].tolist()

                detections.append({
                    "class": cls_name,
                    "confidence": round(conf, 4),
                    "bbox": [round(x, 1) for x in xyxy],
                })

                # Check if this is an accident-related class
                accident_classes = [
                    "accident", "crash", "collision", "damage",
                    "severe", "moderate", "car", "vehicle",
                ]
                if any(kw in cls_name.lower() for kw in accident_classes):
                    is_accident = True
                    max_confidence = max(max_confidence, conf)
                elif conf > max_confidence:
                    max_confidence = conf

    # If model is specifically trained for accidents, any detection = accident
    if detections and not is_accident:
        is_accident = True
        max_confidence = max(d["confidence"] for d in detections)

    return {
        "is_accident": is_accident,
        "confidence": round(max_confidence, 4),
        "severity": classify_severity(max_confidence) if is_accident else "low",
        "detections": detections,
        "processing_time_ms": round(elapsed_ms, 2),
    }


# ── Routes ───────────────────────────────────────────────────
@app.get("/")
async def root():
    return {
        "service": "TRAFCCON360 Accident Detection ML",
        "status": "running",
        "model_loaded": MODEL is not None,
        "endpoints": ["/detect", "/detect-upload", "/health"],
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "model_loaded": MODEL is not None,
        "timestamp": datetime.now().isoformat(),
    }


@app.post("/detect", response_model=DetectResponse)
async def detect_accident(request: DetectRequest):
    """
    Detect accident from base64-encoded image.
    Used by NestJS backend for ML verification of ESP32-CAM images.
    """
    try:
        image = decode_base64_image(request.image)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 image: {e}")

    result = run_detection(image)
    result["accident_id"] = request.accident_id

    logger.info(
        f"🔍 Detection: accident={result['is_accident']}, "
        f"conf={result['confidence']}, severity={result['severity']}, "
        f"time={result['processing_time_ms']}ms"
    )

    return result


@app.post("/detect-upload")
async def detect_upload(
    image: UploadFile = File(...),
    accident_id: Optional[str] = Form(None),
):
    """
    Detect accident from uploaded image file.
    Alternative to base64 for direct file uploads.
    """
    try:
        contents = await image.read()
        pil_image = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image file: {e}")

    result = run_detection(pil_image)
    result["accident_id"] = accident_id
    return result


# ── Run ──────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
