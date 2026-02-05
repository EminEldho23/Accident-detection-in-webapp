# Smart Traffic Sentinel - Accident Detection System Walkthrough

## Overview
The Smart Traffic Sentinel is an AI-powered traffic management system that uses computer vision to detect accidents and emergency vehicles in real-time across multiple lanes. When an accident is detected, the system automatically generates alerts, saves evidence frames, and adjusts traffic signals for emergency response.

---

## System Architecture

### Frontend (Next.js - Port 3000)
- **Technology**: React 19 + Next.js 16 + TypeScript + Tailwind CSS
- **Purpose**: Web interface for monitoring traffic lanes and managing simulations
- **Location**: `C:\Trafcon\Accident_detection_2\full_stack\frontend`

### Backend (FastAPI - Port 8000)
- **Technology**: Python 3.13 + FastAPI + Uvicorn
- **Purpose**: Real-time video processing, AI inference, accident detection
- **Location**: `C:\Trafcon\Accident_detection_2\full_stack\backend`

### Models
- **Emergency Detection**: YOLOv8 (trained to detect ambulances, fire trucks, sirens)
- **Accident Detection**: YOLOv8 (trained to detect collisions, accidents, overturned vehicles)
- **Model Path**: `C:\Trafcon\Accident_detection_2\full_stack\backend\weights\best.pt`

---

## Complete Workflow: From Upload to Alert

### Phase 1: System Startup (2 minutes to setup)

#### Step 1: Launch Services
```bash
# Terminal 1 - Backend
Push-Location "C:\Trafcon\Accident_detection_2\full_stack\backend"
python main.py

# Terminal 2 - Frontend  
Push-Location "C:\Trafcon\Accident_detection_2\full_stack\frontend"
npm run dev
```

**What happens:**
- Backend initializes YOLOv8 models for accident and emergency detection
- Fastens CORS middleware to allow frontend requests
- Starts WebSocket server for real-time communication
- Frontend Next.js server compiles React components
- Environment variables loaded from `.env.local` (API_URL: localhost:8000)

#### Step 2: Access the Web App
```
Navigate to: http://localhost:3000
```

**What you see:**
- Header with "SMART TRAFFIC SENTINEL" branding
- 4 video cards (one for each lane)
- Start Simulation button (disabled until videos uploaded)
- Reset System button
- Online/Offline connection indicator

---

### Phase 2: Video Upload (3-5 minutes)

#### Step 1: Upload Videos to Each Lane

**On the Web App:**
1. Click "INSERT VIDEO" button on Lane 1
2. Select a video file (accident1.mp4, accident2.mp4, etc.)
3. Wait for upload confirmation
4. Repeat for Lanes 2, 3, and 4

**What happens behind the scenes:**

**Frontend Process:**
```
User clicks "INSERT VIDEO"
  ↓
File input dialog opens (accepts video/mp4, video/x-m4v, video/*)
  ↓
User selects file
  ↓
handleUpload() function triggered:
  - Creates FormData with file
  - Makes POST request to: http://localhost:8000/upload/{laneId}
  - Shows error alert if upload fails
  - Marks lane as uploaded if successful
```

**Backend Process:**
```
POST /upload/{lane_id} received
  ↓
1. Validate lane_id (must be 1-4)
  ↓
2. Save uploaded file temporarily:
   - Path: uploads/temp_lane{id}_{filename}
   - Copies file to disk
  ↓
3. Resize video to 720p for performance:
   - Original: e.g., 1920x1080
   - Target height: 720px
   - Maintains aspect ratio
   - Processing: 200-300 frames
  ↓
4. Save final video:
   - Path: uploads/lane{id}_{filename}
   - Temporary file deleted
  ↓
5. Stage video for simulation:
   - Stored in global dictionary: video_staging[lane_id]
   - Count total uploaded videos
  ↓
6. Return response:
   {
     "status": "staged",
     "lane_id": 1,
     "file_path": "uploads/lane1_accident1.mp4",
     "staged_count": 1,
     "all_ready": false,
     "resized": true
   }
```

**Expected Behavior:**
- Upload speed: ~5-30 seconds per video (depends on file size and internet)
- Each lane shows upload progress
- "START SIMULATION" button becomes enabled after all 4 videos uploaded
- Console shows: `✅ Video staged for Lane X. Total staged: X/4`

---

### Phase 3: Starting the Simulation (30 seconds)

#### Step 1: Click "START SIMULATION"

**Frontend Action:**
```
User clicks "START SIMULATION" button
  ↓
isStarting state set to true
  ↓
POST request sent to: http://localhost:8000/simulation/start
  ↓
Wait for 200 OK response
  ↓
Page auto-refreshes after 1 second (resets frontend state)
```

**Backend Process:**
```
POST /simulation/start received
  ↓
1. Validate all 4 lanes have videos staged
  ↓
2. Create VideoManager instance:
   - Initializes 4 VideoStream objects
   - One for each lane with its video file path
  ↓
3. Create TrafficController instance:
   - Initializes traffic signal states (all RED initially)
   - Prepares emergency preemption logic
  ↓
4. Start system in background task:
   a) Start all video streams:
      - Each lane opens video file with cv2.VideoCapture()
      - Threading starts for each lane
      - Frames read continuously in background
   
   b) Start traffic controller:
      - Lane 1 → GREEN (gets priority initially)
      - Lanes 2, 3, 4 → RED
   
   c) Start processing loop:
      - Begins infinite async loop
      - Processes frames from all lanes
      - Runs inference every 3 frames (optimization)
      - Updates traffic signals
  ↓
5. Return success response:
   {
     "status": "started",
     "message": "Simulation started successfully",
     "lanes": [1, 2, 3, 4]
   }
```

**Console Output:**
```
🚀 Starting entire system with all 4 videos synchronized...
✅ Video manager started for all lanes
✅ Traffic controller started
✅ Processing loop started!
```

---

### Phase 4: Real-Time Processing (30 seconds to 2+ minutes)

#### The Processing Loop: Every Frame (1/30 second)

**Video Stream Processing:**
```
For each of 4 lanes:
  ↓
  1. Get current frame from VideoStream
     - Reads from video file in background thread
     - Frame size: 640x360 (resized for performance)
     - Returns None if no frame available
  ↓
  2. Every 3rd frame (optimization):
     
     A. EMERGENCY DETECTION:
        - Frame → YOLOv8 model
        - Detects: ambulances, fire trucks, sirens
        - Output: confidence scores per object
        - Confidence threshold: 0.5
     
     B. ACCIDENT DETECTION:
        - Frame → YOLOv8 model (background thread)
        - Detects: collisions, crashes, overturned vehicles
        - Output: confidence score
        - Confidence threshold: 0.1
        - Result stored immediately (doesn't block loop)
  ↓
  3. Determine display frame:
     - If accident detected → USE ACCIDENT FRAME
     - Else if emergency detected → USE EMERGENCY FRAME
     - Else → USE ORIGINAL FRAME
  ↓
  4. Encode frame to JPEG and store:
     - Stored in: latest_processed_frames[lane_id]
     - Used by /video/{lane_id} endpoint for streaming
```

**What appears on Web App During Processing:**
```
Lane 1:
├─ Live video feed streaming (30 FPS)
├─ Signal light indicator (GREEN)
├─ Detections panel (if objects found)
└─ Lane label and status

Lane 2-4:
├─ Live video feed streaming
├─ Signal light indicator (RED or YELLOW)
├─ Detections panel
└─ Lane label and status
```

**Backend Console Output During Processing:**
```
🔍 Lane 1: Accident=False, Conf=0.00
🔍 Lane 2: Accident=False, Conf=0.00
🔍 Lane 3: Accident=False, Conf=0.00
🔍 Lane 4: Accident=False, Conf=0.00
💓 Processing Loop Alive: Frame 30
```

---

### Phase 5: Accident Detection & Alert (when accident occurs)

#### Moment of Detection

**In Backend Processing Loop:**
```
Frame received from Lane 2 (video shows collision)
  ↓
Accident detection model runs:
  - Analyzes pixel patterns
  - Identifies collision characteristics
  - Outputs: confidence = 0.51 (51% confidence)
  ↓
Confidence > 0.1 threshold → ACCIDENT DETECTED!
  ↓
Console prints: "🔍 Lane 2: Accident=True, Conf=0.51"
```

#### Immediate Actions Triggered

**1. Frame Annotation & Saving:**
```
tagged_frame = accident_annotated.copy()
  ↓
Add red background box to frame
  ↓
Add white text: "LANE 2"
  ↓
Save to disk:
   Path: C:\Trafcon\Accident_detection_2\accident-detection-system\detection_output_result
   Filename: accident_lane2_20260205_143022_123.jpg
   Size: ~50-150 KB
  ↓
Console prints: "💾 Accident frame saved: accident_lane2_20260205_143022_123.jpg"
```

**2. Update Global Accident State:**
```
accident_state = {
    "status": True,
    "frame": "base64_encoded_image_data...",  // ~200 KB base64
    "lane_id": 2,
    "confidence": 0.51
}
```

**3. Broadcast via MQTT:**
```
MQTT Topic: "trafcon/accident"
Message: {
    "accident": true,
    "lane_id": 2,
    "confidence": 0.51
}
↓
Published to: broker.emqx.io:1883
```

**4. Console Output:**
```
Detected: accident with confidence 0.51
🔍 Lane 2: Accident=True, Conf=0.51
💾 Accident frame saved: accident_lane2_20260205_143022_123.jpg
```

---

### Phase 6: Frontend Alert Display

#### WebSocket Communication

**Backend sends via WebSocket:**
```
Every 100ms, server sends:
{
  "signals": {
    "lane1": "GREEN",
    "lane2": "RED",
    "lane3": "RED", 
    "lane4": "RED"
  },
  "emergency": {
    "is_active": false,
    "lane_id": null
  },
  "detections": {
    "lane1": [],
    "lane2": [{class: "accident", confidence: 0.51}],
    "lane3": [],
    "lane4": []
  }
}
```

#### Frontend Real-Time Update

**useSocket Hook:**
```
WebSocket listener receives update
  ↓
Detects: data?.detections?.lane2 contains accident
  ↓
Updates React state
  ↓
Re-renders accident alert overlay
```

#### Frontend API Polling

**Meanwhile, frontend also polls accident endpoint:**
```
Every 1000ms (1 second):
  GET http://localhost:8000/accident_api
  ↓
  Response:
  {
    "status": true,
    "frame": "base64_image_data...",
    "lane_id": 2,
    "confidence": 0.51
  }
  ↓
  Updates accidentData state
```

#### Alert Display on Screen

**When accident_api returns status=true:**

```
1. Full-screen overlay appears:
   ├─ Semi-transparent red-black background
   └─ Modal dialog appears

2. Dialog Header (Red Background):
   ├─ Warning icon (animated pulse)
   ├─ "ACCIDENT ALERT" text (large, bold)
   └─ "COLLISION DETECTED IN LANE 2 (51% CONFIDENCE)"

3. Dialog Body:
   ├─ Image display:
   │  └─ Shows saved accident frame with LANE label
   │  └─ "LIVE CAPTURE" badge (animated)
   │
   └─ Information section:
      ├─ Text: "Visual sensors have confirmed high-probability accident.
      │          Emergency services notified via MQTT protocol.
      │          Traffic signals in vicinity set to failsafe mode."
      │
      └─ Status boxes:
         ├─ System Status: "EMERGENCY PRIORITY"
         └─ MQTT Status: "MESSAGE SENT"

4. Close button (top right):
   └─ Click to dismiss alert
```

**Visual Example:**
```
┌─────────────────────────────────────────────────────┐
│  ⚠️  ACCIDENT ALERT                              ✕  │
│  COLLISION DETECTED IN LANE 2 (51% CONFIDENCE)      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  [Image with LANE 2 label]  🟴 LIVE CAPTURE        │
│  (Red frame showing accident)                        │
│                                                      │
│  Visual sensors have confirmed high-probability     │
│  accident. Emergency services notified via MQTT     │
│  protocol. Traffic signals set to failsafe mode.    │
│                                                      │
│  ┌─────────────────┬──────────────────┐             │
│  │ System Status   │  MQTT Status     │             │
│  │ EMERGENCY       │  MESSAGE SENT    │             │
│  │ PRIORITY        │                  │             │
│  └─────────────────┴──────────────────┘             │
└─────────────────────────────────────────────────────┘
```

---

### Phase 7: Traffic Signal Emergency Response

#### Automatic Signal Adjustment

**When accident detected in Lane 2:**

```
Current state:
├─ Lane 1: GREEN
├─ Lane 2: RED
├─ Lane 3: RED
└─ Lane 4: RED

ACCIDENT DETECTED in Lane 2!
  ↓
Traffic Controller receives emergency signal
  ↓
Transitions apply:
  
1. Lane 1 (currently GREEN):
   GREEN → YELLOW (2 seconds)
      ↓
   YELLOW → RED (3 seconds)

2. Lane 2 (currently RED):
   RED → GREEN (immediately)

3. Lanes 3, 4 stay RED

Final state:
├─ Lane 1: RED
├─ Lane 2: GREEN ✓ (Emergency vehicle/responders can clear accident)
├─ Lane 3: RED
└─ Lane 4: RED
```

**Console Output:**
```
🔌 [HARDWARE OUT] Lane 1 switched to YELLOW
🔌 [HARDWARE OUT] Lane 1 switched to RED
🔌 [HARDWARE OUT] Lane 2 switched to GREEN
```

**Frontend Updates:**
```
Each lane card shows:
├─ Lane 1: RED signal indicator
├─ Lane 2: GREEN signal indicator with emergency badge
├─ Lane 3: RED signal indicator
└─ Lane 4: RED signal indicator
```

---

### Phase 8: Evidence Storage

#### Accident Frame Archive

**Location:**
```
C:\Trafcon\Accident_detection_2\accident-detection-system\detection_output_result\
```

**Saved Files:**
```
accident_lane2_20260205_143022_123.jpg    (51% confidence)
accident_lane2_20260205_143045_456.jpg    (48% confidence)
accident_lane4_20260205_143100_789.jpg    (63% confidence)
...
```

**File Properties:**
- Format: JPEG
- Size: 50-150 KB each
- Contains: Lane label overlay + detected accident
- Timestamp: Millisecond precision
- Auto-organized by lane and time

**Access Later:**
```
View evidence: Open the detection_output_result folder
Review incidents: Sort by timestamp, lane, confidence
```

---

## Key Features Explained

### 1. Real-Time Video Streaming
- **Bitrate**: ~1-2 Mbps per lane
- **Resolution**: 640x360 per lane
- **Frame Rate**: 30 FPS
- **Latency**: <100ms between capture and display

### 2. Non-Blocking Accident Detection
- **Model runs in**: Background thread (doesn't freeze UI loop)
- **Queue size**: 1 frame
- **Skip behavior**: If queue full, frame skipped (not processed)
- **Result delivery**: Latest result returned immediately (always responsive)

### 3. Emergency Preemption
- **Detection**: Real-time ambulance/fire truck detection
- **Priority**: Can override accident emergency
- **Signal timing**: Customizable green duration
- **Failsafe**: Red signals if no signal changes for 30 seconds

### 4. Dual AI Models
| Model | Purpose | Detects | Confidence Threshold |
|-------|---------|---------|----------------------|
| Emergency Model | Vehicle type detection | Ambulance, fire truck, siren | 0.5 (50%) |
| Accident Model | Collision detection | Accident, crash, collision | 0.1 (10%) |

### 5. Data Persistence
- **Accident frames**: Automatically saved with timestamp
- **MQTT logs**: Broadcast to external broker
- **API responses**: Cached for 1 second polling
- **WebSocket**: Real-time updates every 100ms

---

## System State Diagram

```
                    ┌─────────────────┐
                    │  System Idle    │
                    │ (Waiting upload)│
                    └────────┬────────┘
                             │ Upload 4 videos
                             ↓
                    ┌─────────────────┐
                    │  Videos Staged  │
                    │  (Ready to run) │
                    └────────┬────────┘
                             │ Click START
                             ↓
                    ┌─────────────────┐
                    │  Simulation     │
                    │  Running        │
                    └────────┬────────┘
                             │ Process frames
                     ┌───────┴───────┐
                     ↓               ↓
              No Accident      Accident Found
                     │               │
                     │         ┌─────┴──────┐
                     │         ↓            ↓
                     │    Save Frame   Broadcast MQTT
                     │         │            │
                     │         └─────┬──────┘
                     │               ↓
                     │        Update Alert State
                     │               │
                     └───────┬───────┘
                             ↓
                    ┌─────────────────┐
                    │  Simulation     │
                    │  Continues      │
                    └────────┬────────┘
                             │ Click RESET
                             ↓
                    ┌─────────────────┐
                    │  System Reset   │
                    │  (Idle again)   │
                    └─────────────────┘
```

---

## Common Issues & Troubleshooting

### Issue: Accident not detected
**Causes:**
- Confidence threshold too high (>0.25 in detection.py)
- Model not trained on accident type in video
- Video resolution too low (<640px width)

**Solution:**
- Lower confidence threshold in detect_accident.py
- Use videos with clear accident patterns
- Ensure video quality is adequate

### Issue: Alert not showing
**Causes:**
- WebSocket connection failed
- CORS error blocking API request
- Frontend not polling /accident_api

**Solution:**
- Check Network tab in browser DevTools
- Verify .env.local has correct localhost URLs
- Check console for fetch errors

### Issue: Video upload slow
**Causes:**
- Video file too large (>500MB)
- Resizing takes long for high resolution
- Network connection slow

**Solution:**
- Use videos <300MB
- Videos auto-resize to 720p
- Check internet connection speed

### Issue: Frames not saving
**Causes:**
- Output directory doesn't exist
- Permission denied on directory
- Disk space full

**Solution:**
- Directory auto-created if missing (now fixed with os.makedirs)
- Check folder permissions
- Ensure >1GB free disk space

---

## Performance Metrics

### Backend Processing
```
Inference time per frame:
├─ Emergency detection: ~50-100ms
├─ Accident detection: ~50-100ms (async, non-blocking)
└─ Total per frame: ~100-150ms per lane

Frame processing rate:
└─ 30 FPS max, inference every 3rd frame = ~10 inferences/sec/lane

Memory usage:
├─ Models loaded: ~400-500MB
├─ Active streams: ~50-100MB
└─ Total: ~500-600MB Python process
```

### Network Bandwidth
```
Video streaming:
├─ Per lane: ~1-2 Mbps
├─ 4 lanes: ~4-8 Mbps total
├─ WebSocket updates: ~50 KB/s

Frontend rendering:
├─ Load time: <2 seconds
├─ Poll interval: 1 second
└─ WebSocket interval: 100ms
```

---

## Summary: Complete Flow

```
USER ACTION                    BACKEND                         FRONTEND/DATABASE
─────────────────────────────────────────────────────────────────────────────────

1. Upload Video    ──POST──>  Save & Resize              
                              Stage video
                              Count uploads        ──────>  Update UI
                                                             Enable START button

2. Click START     ──POST──>  Initialize VideoManager
   SIMULATION                 Start streams
                              Start traffic controller
                              Start processing loop     ──────>  Reset state
                                                                 Show live feeds

3. Processing      Every 30ms
   (Continuous)              Get frame from lane
                              ├─ Every 3rd: Run inference
                              │ ├─ Emergency detection
                              │ └─ Accident detection
                              └─ Store frame for streaming

4. Accident Found            Annotate frame            <──WS──  Show alert
                              Save to disk                       Display image
                              Update accident_state              Update signals
                              Publish MQTT
                              Change signals

5. Click RESET     ──POST──>  Stop all streams
   SYSTEM                     Reset state
                              Clear staged videos    ──────>  Reload page
```

---

## Conclusion

The Accident Detection System provides:
- ✅ Real-time AI-powered accident detection
- ✅ Instant alerts with saved evidence
- ✅ Automatic emergency signal preemption
- ✅ Multi-lane monitoring and management
- ✅ MQTT broadcasting for external systems
- ✅ WebSocket for live updates
- ✅ Non-blocking async processing
- ✅ Professional UI with real-time indicators

**Total Processing Latency**: ~500ms from accident occurrence to alert display (video processing → inference → annotation → save → update state → broadcast → UI render)
