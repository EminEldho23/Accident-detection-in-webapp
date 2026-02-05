# Quick Start Guide - Accident Detection Web App

## 🚀 Launch (2 minutes)

### 1. Start Backend
```powershell
Push-Location "C:\Trafcon\Accident_detection_2\full_stack\backend"
python main.py
```
✅ Should show: "Uvicorn running on http://0.0.0.0:8000"

### 2. Start Frontend
```powershell
Push-Location "C:\Trafcon\Accident_detection_2\full_stack\frontend"
npm run dev
```
✅ Should show: "Ready in XXXms"

### 3. Open Browser
```
http://localhost:3000
```

---

## 📹 Upload Videos (3-5 minutes)

1. **Lane 1**: Click "INSERT VIDEO" → Select video → Wait for upload
2. **Lane 2**: Click "INSERT VIDEO" → Select video → Wait for upload
3. **Lane 3**: Click "INSERT VIDEO" → Select video → Wait for upload
4. **Lane 4**: Click "INSERT VIDEO" → Select video → Wait for upload

✅ When all 4 uploaded: "START SIMULATION" button turns GREEN

---

## ▶️ Run Simulation (30 seconds - 2+ minutes)

1. Click "▶ START SIMULATION"
2. Page auto-refreshes
3. All 4 lanes show live video feeds
4. Traffic lights cycle: Lane 1→GREEN, others→RED
5. Watch for accidents!

---

## 🚨 When Accident Detected

### What You See:
- **Full-screen RED ALERT overlay** appears
- **Accident frame displays** with lane label
- **Message**: "COLLISION DETECTED IN LANE X"
- **Confidence**: Shows detection percentage

### Behind the Scenes:
- Frame automatically saved to: `C:\Trafcon\Accident_detection_2\accident-detection-system\detection_output_result`
- Alert published via MQTT to: `broker.emqx.io:1883`
- Traffic signal changes: Emergency lane gets GREEN

### What to Do:
- Review the frame
- Note the lane and confidence percentage
- Click ✕ to dismiss alert

---

## 📊 What Gets Saved

**Evidence Location:**
```
C:\Trafcon\Accident_detection_2\accident-detection-system\detection_output_result\
```

**Example Saved Files:**
```
accident_lane1_20260205_143022_123.jpg
accident_lane2_20260205_143045_456.jpg
accident_lane3_20260205_143100_789.jpg
```

Each file contains:
- Detected accident with bounding boxes
- Lane number overlay (red label)
- Timestamp in filename
- ~50-150 KB JPEG image

---

## 🔧 UI Elements Explained

### Lane Card (Each lane shows)
```
┌─ LANE 1                    [FORCE GREEN] [SIMULATE EMER] [INSERT VIDEO] [✕]
├─ Live video feed (640x360)
├─ Traffic light (GREEN/YELLOW/RED)
├─ Status bar: "SIGNAL: GREEN"
└─ Detections panel (if objects found)
```

### Top Header
- **Status indicator**: 🟢 ONLINE / 🔴 OFFLINE (WebSocket connection)
- **START SIMULATION**: Runs all 4 videos with AI detection
- **RESET SYSTEM**: Clears videos and stops simulation

### Accident Alert Overlay
- **Full screen**: Semi-transparent red/black background
- **Modal**: Shows accident frame + details
- **Close button**: Dismiss alert (top right)
- **Auto-shows**: When accident detected

---

## 🎥 Video Specifications

**Recommended Format:**
- Format: MP4, MOV, or AVI
- Codec: H.264 or H.265
- Resolution: 720p or higher
- Frame Rate: 24-30 FPS
- Size: <300MB (for fast upload)

**What Happens to Your Video:**
1. Uploaded → Temporary storage
2. Resized → 720p (auto-optimization)
3. Final → Staged for processing
4. Processing → Streamed to all 4 lanes simultaneously

---

## 📊 Detection Sensitivity

### Accident Detection
- **Confidence Threshold**: 0.1 (10%)
- **Lower = More sensitive** (more false positives)
- **Higher = More specific** (might miss accidents)
- File: `C:\Trafcon\Accident_detection_2\full_stack\backend\detect_accident.py` line 26

### Emergency Detection
- **Confidence Threshold**: 0.5 (50%)
- **Detects**: Ambulances, fire trucks, sirens
- **Priority**: Overrides accident preemption
- File: `C:\Trafcon\Accident_detection_2\full_stack\backend\detection.py` line 15

---

## ⚙️ API Endpoints

### Video Upload
```
POST /upload/{lane_id}
Body: FormData with file
Response: {status, lane_id, staged_count, all_ready}
```

### Start Simulation
```
POST /simulation/start
Response: {status, message, lanes}
```

### Get Accident Status
```
GET /accident_api
Response: {status, frame (base64), lane_id, confidence}
```

### Live Video Stream
```
GET /video/{lane_id}
Response: MJPEG stream
```

### WebSocket (Real-time)
```
WS /ws/emergency
Receives: {signals, emergency, detections} every 100ms
```

### Reset System
```
POST /simulation/reset
Response: {status, message}
```

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| Can't reach localhost:3000 | Check if frontend is running: `npm run dev` |
| Can't upload videos | Check backend running: `python main.py` on port 8000 |
| No alert showing | Check `.env.local` API URL is `http://localhost:8000` |
| Videos stuck | Reload page, restart backend & frontend |
| Accident not detected | Check video has clear accident pattern |
| Frames not saving | Check folder `C:\...\detection_output_result` has write permission |

---

## 📝 Environment Configuration

**File**: `C:\Trafcon\Accident_detection_2\full_stack\frontend\.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws/emergency
```

**For network access** (from another machine on same network):
```env
NEXT_PUBLIC_API_URL=http://10.101.228.49:8000
NEXT_PUBLIC_WS_URL=ws://10.101.228.49:8000/ws/emergency
```

---

## 🎯 Expected Performance

| Metric | Value |
|--------|-------|
| Video streaming latency | <100ms |
| Accident detection latency | 100-150ms per lane |
| Alert display latency | 500ms total |
| Frames per second (per lane) | 30 FPS |
| Inference frequency | Every 3rd frame (~10/sec) |
| Memory usage | ~600MB |
| Bandwidth (4 lanes) | ~4-8 Mbps |

---

## 🎓 Learning Resources

**Full Documentation**: `C:\Trafcon\ACCIDENT_DETECTION_WALKTHROUGH.md`

**Code Structure**:
```
C:\Trafcon\Accident_detection_2\full_stack\
├── backend/
│   ├── main.py                  # FastAPI server + processing loop
│   ├── detect_accident.py        # Accident detection model
│   ├── detection.py             # Emergency detection model
│   ├── traffic_control.py       # Signal management
│   ├── stream.py                # Video streaming
│   └── weights/best.pt          # YOLOv8 model
│
└── frontend/
    ├── src/app/page.tsx         # Main UI
    ├── src/components/
    │   ├── VideoCard.tsx        # Lane video display
    │   ├── TrafficLight.tsx      # Signal indicator
    │   └── useSocket.ts         # WebSocket hook
    └── .env.local               # Config
```

---

## 🔄 System Flow (High Level)

```
Videos Uploaded
       ↓
START SIMULATION clicked
       ↓
System initializes (2 seconds)
       ↓
Streams open, processing starts
       ↓
Cameras active: Lane 1→GREEN, others→RED
       ↓
Processing loop runs (every 30ms):
  - Get frame from each lane
  - Every 3rd frame: Run AI inference
  - Detect accidents or emergency vehicles
  - Update video streams
  - Calculate traffic signal changes
       ↓
ACCIDENT DETECTED!
       ↓
Frame saved + Alert displayed + Signal changed
       ↓
Continue processing
       ↓
RESET SYSTEM clicked
       ↓
Stop all streams, clear videos
```

---

## 📞 Support

**Backend Errors**: Check terminal where `python main.py` runs
**Frontend Errors**: Open browser DevTools (F12) → Console tab
**API Issues**: Check network requests in DevTools → Network tab

---

**Version**: 1.0 | **Last Updated**: February 2026 | **Status**: ✅ Production Ready
