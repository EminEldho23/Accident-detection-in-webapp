# TRAFCON360 — Accident Detection & Smart Traffic Control System

## Overview

TRAFCON360 is a real-time accident detection and smart traffic management system that uses YOLOv8 computer vision to detect accidents and emergency vehicles across 4 traffic lanes, automatically controlling traffic signals in response.

The system consists of three services running on separate ports:

| Service | Port | Technology | Purpose |
|---------|------|------------|---------|
| **Backend** | 8000 | FastAPI + Python | Detection engine, traffic control, MQTT |
| **Web App** | 3000 | Next.js + React | Upload videos, view live feeds, start simulation |
| **Dashboard** | 5500 | FastAPI + Jinja2 | View detection results, signal status, history |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    USER / BROWSER                            │
│                                                              │
│   Web App (localhost:3000)     Dashboard (localhost:5500)     │
│   ┌──────────────────────┐    ┌──────────────────────────┐   │
│   │ Upload 4 videos      │    │ Latest detected frame    │   │
│   │ Start simulation     │    │ Traffic signal lamps     │   │
│   │ Live MJPEG feeds     │    │ Alert banner + sound     │   │
│   │ Traffic lights        │    │ Detection history grid   │   │
│   │ Small accident toast │    │ Emergency badge          │   │
│   └──────────┬───────────┘    └──────────┬───────────────┘   │
│              │                           │                   │
│         WebSocket                   WebSocket                │
│     ws://localhost:8000         ws://localhost:5500           │
│     /ws/emergency               /ws/dashboard (relay)        │
└──────────────┬───────────────────────────┬───────────────────┘
               │                           │
               ▼                           ▼
┌──────────────────────────────────────────────────────────────┐
│              BACKEND (localhost:8000)                         │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ VideoManager │  │ YOLOv8       │  │ TrafficController  │  │
│  │ 4 lane       │──│ Accident     │──│ 4-lane signal      │  │
│  │ streams      │  │ Detection    │  │ cycling            │  │
│  └─────────────┘  │ Emergency    │  │ Emergency override │  │
│                    │ Detection    │  │ Round-robin        │  │
│                    └──────┬───────┘  └────────────────────┘  │
│                           │                                  │
│                    ┌──────▼───────┐                           │
│                    │ Save JPG     │──► detection_output_result│
│                    │ MQTT publish │──► broker.emqx.io         │
│                    │ Update state │──► /accident_api          │
│                    └──────────────┘                           │
└──────────────────────────────────────────────────────────────┘
```

---

## How It Works

### Step 1: Upload Videos (Web App)

1. Open **http://localhost:3000**
2. Each of the 4 lane cards has an **INSERT VIDEO** button
3. Select a traffic video file for each lane (supports mp4, avi, etc.)
4. Videos are uploaded to the backend via `POST /upload/{lane_id}`
5. Backend resizes videos to 720p for performance and stages them

### Step 2: Start Simulation

1. Once all 4 lanes have videos staged, the **START SIMULATION** button enables
2. Clicking it sends `POST /simulation/start` to the backend
3. Backend initializes:
   - **VideoManager** — opens all 4 video streams
   - **TrafficController** — starts the 4-lane signal cycling loop
   - **Processing Loop** — begins frame-by-frame detection

### Step 3: Detection Processing Loop

The core processing loop runs continuously on all 4 lanes:

```
For every 3rd frame on each lane:
  1. Emergency Detection (YOLOv8 best.pt)
     → Detects ambulances, fire trucks, police vehicles
  
  2. Accident Detection (YOLOv8 best.pt)
     → Detects collisions with confidence score
  
  If accident detected:
     → Tag frame with "LANE X" label
     → Save annotated JPG to detection_output_result/
     → Encode frame as base64 → update global accident_state
     → Publish MQTT message to trafcon/accident
     → Add lane to emergency list
  
  If emergency vehicle detected:
     → Add lane to emergency list
  
  Update processed frame for MJPEG streaming
  
After all lanes processed:
  → Update TrafficController with emergency lanes
  → Auto-reset accident state after 5s of no detections
```

### Step 4: Traffic Signal Control

The `TrafficController` manages signal states for all 4 lanes:

- **Normal Mode**: Cycles GREEN through lanes 1→2→3→4→1 with configurable duration (10s green, 2s yellow transition)
- **Single Emergency**: Immediately gives GREEN to the emergency lane, all others RED
- **Multi Emergency**: Round-robin GREEN among emergency lanes, each gets 10s
- **Clearing**: When emergencies clear, resumes normal cycling

Signal states are broadcast via WebSocket every 100ms and available via REST at `/signals`.

### Step 5: Real-Time Data Flow

**Web App** receives data directly from backend:
- `ws://localhost:8000/ws/emergency` → signal states, emergency mode, detections
- `GET /accident_api` (polled every 1s) → accident status, base64 frame, lane, confidence

**Dashboard** receives data through a relay:
- Dashboard server connects to backend's `/ws/emergency` WebSocket
- Enriches each message with `/accident_api` data
- Forwards combined payload to browser via `/ws/dashboard`
- If backend WS drops, falls back to polling `/signals` + `/accident_api` REST endpoints
- Auto-reconnects to WebSocket every 10s

### Step 6: Detection Output

When an accident is detected:

1. **Annotated JPG** saved to `accident-detection-system/detection_output_result/`
   - Filename format: `accident_lane{N}_{YYYYMMDD}_{HHMMSS}_{ms}.jpg`
   - Frame includes bounding boxes and "LANE X" tag

2. **MQTT Message** published to `trafcon/accident` on `broker.emqx.io:1883`
   ```json
   { "accident": true, "lane_id": 2, "confidence": 0.87 }
   ```

3. **Global State** updated — available via `/accident_api`:
   ```json
   { "status": true, "frame": "<base64>", "lane_id": 2, "confidence": 0.87 }
   ```

---

## Key Files

### Backend (`full_stack/backend/`)

| File | Purpose |
|------|---------|
| `main.py` | FastAPI server, processing loop, WebSocket, MQTT, all endpoints |
| `detection.py` | `EmergencyDetector` class — YOLOv8 inference for emergency vehicles |
| `detect_accident.py` | `detect_accident()` function — YOLOv8 inference for accidents |
| `traffic_control.py` | `TrafficController` — 4-lane signal cycling with emergency override |
| `stream.py` | `VideoManager` + `VideoStream` — threaded video capture for all lanes |
| `weights/best.pt` | YOLOv8 model weights for emergency vehicle detection |

### Web App (`full_stack/frontend/`)

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Main page — lane grid, upload, start, toast accident alert |
| `src/components/VideoCard.tsx` | Lane card — MJPEG feed, traffic light, upload, detections |
| `src/components/TrafficLight.tsx` | Traffic light component (RED/YELLOW/GREEN) |
| `src/hooks/useSocket.ts` | WebSocket hook for real-time signal/emergency data |

### Dashboard (`Dashboard/`)

| File | Purpose |
|------|---------|
| `dashboard.py` | FastAPI server, WebSocket relay, REST proxies, history API |
| `templates/dashboard.html` | Dashboard UI — alerts, detection, signals, history |
| `static/js/dashboard.js` | WebSocket client, signal lamp updates, history grid |
| `static/css/dashboard.css` | Police-themed dark UI with red/amber accents |

---

## API Endpoints (Backend — Port 8000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/upload/{lane_id}` | Upload video for a lane (1-4) |
| `POST` | `/simulation/start` | Start detection with all 4 staged videos |
| `POST` | `/simulation/reset` | Stop and clear everything |
| `GET` | `/video/{lane_id}` | MJPEG live stream for a lane |
| `GET` | `/accident_api` | Current accident state (status, frame, lane, confidence) |
| `GET` | `/signals` | Current traffic signal states for all lanes |
| `GET` | `/status` | System status (started, staged count, etc.) |
| `WS` | `/ws/emergency` | Real-time signals, emergency, detections |
| `POST` | `/debug/trigger_accident` | Manually trigger a test accident alert |
| `POST` | `/signal/{lane_id}/force` | Force a lane to GREEN |

---

## Running the System

### Prerequisites

- Python 3.10+ with venv at `C:\Trafcon\.venv`
- Node.js 18+
- Required Python packages: `fastapi`, `uvicorn`, `opencv-python`, `ultralytics`, `paho-mqtt`, `httpx`, `websockets`, `jinja2`, `numpy`, `Pillow`

### Start All Services

```powershell
# Terminal 1 — Backend (must start first)
cd C:\Trafcon\Accident_detection_2\full_stack\backend
C:\Trafcon\.venv\Scripts\python.exe main.py

# Terminal 2 — Dashboard
cd C:\Trafcon\Accident_detection_2\Dashboard
C:\Trafcon\.venv\Scripts\python.exe dashboard.py

# Terminal 3 — Web App
cd C:\Trafcon\Accident_detection_2\full_stack\frontend
npm run dev
```

### Stop All Services

```powershell
Stop-Process -Name python, node -Force
```

### Usage

1. Open **http://localhost:3000** — upload 4 videos, click START SIMULATION
2. Open **http://localhost:5500** — monitor detections, signals, and history
3. Traffic signals cycle automatically; accidents trigger alerts on both UIs

---

## Detection Models

- **Accident Detection**: Custom YOLOv8 model trained on accident dataset (`best.pt` / `best.onnx`)
- **Emergency Vehicle Detection**: YOLOv8 model detecting ambulances, fire trucks, police cars (`weights/best.pt`)
- **Training Data**: Labeled images in `data/train/`, `data/valid/`, `data/test/` with YOLO format annotations

---

## Communication Protocols

- **WebSocket**: Real-time signal states + emergency alerts (100ms interval from backend)
- **MQTT**: Accident notifications to IoT devices via `broker.emqx.io:1883` on topic `trafcon/accident`
- **REST**: Polling fallback for accident state, signal states, system status
- **MJPEG**: Live video streaming from backend to web app via HTTP multipart

---

*Built for TRAFCON360 — Smart Traffic Accident Detection & Control System*
