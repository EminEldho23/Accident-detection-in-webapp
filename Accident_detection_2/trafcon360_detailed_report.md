# Trafcon360 Comprehensive System Architecture Report

## 1. Executive Summary
Trafcon360 is an advanced, AI-driven traffic management and accident detection system. It leverages real-time video feeds from multiple junction lanes to automatically detect vehicular accidents, track vehicles using multi-object tracking, and extract license plate information via Automatic Number Plate Recognition (ANPR). Once an accident is detected, the system modifies traffic light signals to create a "green corridor" for emergency response, retrieves vehicle owner information from an integrated database, and alerts emergency services.

## 2. Core System Components

The system is built on a distributed microservice-like architecture spanning a FastAPI backend, a Next.js frontend, and a dedicated HTML/Vanilla JS dashboard for live monitoring.

### 2.1 Backend Services (`FastAPI`)
The core orchestrator of the system, written in Python using FastAPI.
- **Port:** 8000
- **Responsibilities:**
  - Manages concurrent multiprocessing of 4 video streams representing 4 junction lanes.
  - Hosts WebSocket servers for real-time telemetry streaming to the Dashboard.
  - Coordinates the Machine Learning pipelines (YOLOv8, SORT, EasyOCR).
  - Handles API requests from the Next.js frontend to override signals or retrieve historical data.
  - Maintains the real-time Traffic Controller logic.

### 2.2 Live Monitoring Dashboard (`dashboard.py` & HTML/JS)
A dedicated, lightweight monitoring interface built for Traffic Control Centers.
- **Port:** 5500 (Python simple HTTP server) / WebSocket connection to Backend:8000
- **Features:**
  - Real-time accident alerts with visual confidence bars.
  - Live display of cropped accident frames and annotated ANPR crops.
  - Traffic light state visualization (Red/Yellow/Green) for all 4 lanes.
  - Automated alert sounds via Web Audio API when accidents occur.
  - Accident Queue Management (MAPQ) for responding to consecutive incidents.

### 2.3 Frontend Management (`Next.js`)
A modern web application for administrators and traffic analysts.
- **Port:** 3000
- **Responsibilities:**
  - Historical accident data viewing.
  - Video stream configuration (e.g., uploading the 4 lane videos).
  - System initialization and stopping.

## 3. The Machine Learning Pipeline

The AI pipeline is heavily optimized for speed and accuracy using a combination of targeted YOLO models and temporal heuristics.

### 3.1 Accident Detection (`detect_accident.py`)
- **Model:** YOLOv8 pre-trained for general object detection and fine-tuned/specifically utilized for detecting collisions and overturned vehicles from CCTV perspectives.
- **Thresholding:** 
  - Triggers an active alert if an accident is detected. 
  - To prevent false positives from flooding the database, accident frames are only saved to disk if the confidence exceeds `40% (0.40)`.

### 3.2 Vehicle Tracking (`sort_tracker.py`)
- **Technology:** SORT (Simple Online and Realtime Tracking).
- **Functionality:** 
  - As vehicles pass through the frame, YOLO identifies them (Cars, Trucks, Buses, Motorcycles).
  - SORT assigns a unique integer ID to each vehicle.
  - This prevents the system from re-evaluating the same license plate 30 times a second; it tracks the car and intelligently updates its information.

### 3.3 Number Plate Detection & ANPR (`plate_detector.py`)
This is a multi-stage, high-fidelity pipeline:
1. **Detection:** Uses a specifically fine-tuned YOLO model (`license_plate_detector.pt`) to identify the bounding box of a license plate on tracked vehicles. The confidence threshold is kept purposefully low (`15%`) to catch blurry moving plates, relying on later OCR stages to filter noise.
2. **Preprocessing:** The raw plate crop is perspective-deskewed, upscaled 3x (Cubic Interpolation), processed with CLAHE (Contrast Limited Adaptive Histogram Equalization), Bilateral filtering, and Otsu Binarization to make text machine-readable.
3. **OCR (Optical Character Recognition):** The preprocessed image is passed to EasyOCR. 
4. **Temporal Voting:** Because OCR might misread a fast-moving plate in frame 1 and get it perfectly in frame 3, the system buffers the last 10 reads for a vehicle. It uses "Majority Wins" voting to establish the final, highest-confidence string.
5. **Confusion Mapping:** Neural heuristics correct common OCR mistakes based on the position in the string (e.g., correcting an 'O' to a '0' if it appears in a digit-heavy section of the plate).

## 4. Operational Workflow

### Phase 1: Normal Operation
1. The system loops 4 video streams representing 4 intersection lanes.
2. The `TrafficController` runs a standard Round-Robin sequence:
   - Lane 1 turns Green for X seconds, others are Red.
   - Transitions via Yellow light.
   - Lane 2 turns Green, etc.
3. Telemetry (signal states, currently recognized plates) is streamed via WebSockets to the Dashboard.

### Phase 2: Accident Occurs
1. **Detection Triggered:** The YOLO accident model flags a collision in Lane `L`.
2. **Lockout:** A global `accident_lock` is engaged. 
3. **Signal Override:** The `TrafficController` immediately halts the Round-Robin. Lane `L` is kept GREEN or turned GREEN to allow emergency vehicles to reach the incident without being blocked by queued traffic. All other lanes turn RED.
4. **ANPR Extraction:** The system retrieves the best known license plate for the specific vehicle bounding box involved in the accident.
5. **Database Lookup:** The Python `vehicle_database.py` executes a simulated RTO (Regional Transport Office) database lookup. It matches the ANPR text to an SQLite database returning:
   - Owner Name
   - Emergency Phone Number
   - Vehicle Model
6. **Alert Broadcast:** 
   - The Dashboard flashes RED, blares an audio siren, and displays the cropped frame, confidence score, and Owner details.
   - A Telegram API integration instantly sends the accident frame and details to a configured responder channel.
   - The dashboard adds the incident to the Responder Queue.

### Phase 3: Resolution
1. A human operator reviews the incident on the Dashboard.
2. The operator clicks "Clear Event".
3. The FastAPI endpoint `/api/accident/clear/{laneId}` is triggered.
4. The system releases the `accident_lock`.
5. The `TrafficController` seamlessly resumes the Round-Robin sequence from where it left off.

## 5. File & Directory Structure

- `Dashboard/`
  - `dashboard.py`: Lightweight server for the dashboard.
  - `static/` & `templates/`: HTML, CSS (styles), JS (websocket and UI logic).
- `full_stack/backend/`
  - `main.py`: The FastAPI server, websocket handler, system orchestrator.
  - `stream.py`: Multi-threaded video stream manager.
  - `traffic_control.py`: The state machine handling normal and emergency traffic light logic.
  - `detect_accident.py`: YOLO accident inference wrapper.
  - `plate_detector.py`: End-to-end ANPR pipeline (YOLO Plate -> Preprocess -> EasyOCR -> Temporal Voting).
  - `number_plate_processor.py`: REST API wrapper for batch processing videos for plates.
  - `vehicle_database.py`: SQLite wrapper for owner lookups.
  - `telegram_notifier.py`: External alert integration.
  - `weights/`: Stores all `.pt` PyTorch models for YOLO.
- `full_stack/frontend/`
  - Next.js application for system administration and historical review.

## 6. Technical Specifications & Dependencies
- **Languages:** Python 3.10+, JavaScript, TypeScript (Next.js)
- **Computer Vision:** OpenCV (`cv2`), Ultralytics YOLOv8, EasyOCR
- **Tracking:** SORT (Simple Online and Realtime Tracking) algorithm
- **Backend Communication:** FastAPI, Uvicorn, WebSockets
- **Database:** SQLite3

## 7. Future Scalability Considerations
While currently running on pre-recorded MP4 files simulating CCTV feeds, the `VideoManager` class in `stream.py` is designed to be easily swappable to RTSP network streams for live camera integration. The model weights folder structure allows seamless swapping to newly trained, more accurate YOLO datasets without changing core logic.
