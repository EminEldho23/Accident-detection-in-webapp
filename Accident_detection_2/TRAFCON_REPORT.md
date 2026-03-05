# TRAFCON360: Project Working & Overview Report

## 1. Project Overview
**TRAFCON360** is an advanced, real-time accident detection and smart traffic management system. By leveraging computer vision (YOLOv8) and IoT communication (MQTT/WebSockets), the system automatically identifies traffic accidents, then dynamically reconfigures traffic signals to clear Collision Zones and prioritize safety.

The project is designed as a city-scale solution to minimize accident response times and provide instantaneous notification to vehicle owners and authorities.

---

## 2. Technical Architecture
The system follows a microservices-inspired architecture with three primary services interacting in real-time:

| Service | Technology | Role |
| :--- | :--- | :--- |
| **Backend API** | FastAPI (Python) | The detection engine. Runs YOLOv8 models, manages 4-lane video streams, and controls traffic signal logic. |
| **Monitoring App** | Next.js (React) | The simulator interface. Allows uploading lane videos, starting the simulation, and viewing live MJPEG detection feeds. |
| **Command Dashboard** | FastAPI + Jinja2 | The command center. Provides a police-themed UI for real-time signal monitoring, accident alerts, and detection history. |

---

## 3. Core Features & Functionality

### 🚨 Real-Time Accident Detection
The system uses a custom-trained **YOLOv8 model** (`best.pt`) to process video feeds from four traffic lanes simultaneously.
- **Continuous Monitoring**: Scans for collisions and vehicle distress.
- **Evidence Capture**: When an accident is detected, the system immediately tags the frame with the lane ID and saves it as an annotated JPG.
- **Global Alerts**: The detection triggers immediate UI notifications (popups/toasts) and publishes MQTT messages to `trafcon/accident`.

### � Multi-Accident Priority Queuing (MAPQ)
The centerpiece of TRAFCON's traffic intelligence is the **MAPQ** system, a specialized logic layer that replaces standard round-robin signaling with an **Incident-First** protocol.

| Feature | Detail |
| :--- | :--- |
| **Queuing** | Accidents are registered in a FIFO (First-In, First-Out) `deque`. The first accident reported is the first to receive a sustained green light. |
| **Persistence** | A lane stays in "Accident State" even if the YOLOv8 detection is momentarily lost. A 10-second "Clear Confirmation" window prevents false resets. |
| **Sustained Green** | The lane at the head of the queue receives an uninterrupted GREEN signal. All other lanes remain RED. |
| **Sequential Clearance** | Once the head lane is cleared, the system immediately transitions GREEN to the *next* accident lane in the queue. |
| **Recovery** | The system returns to normal round-robin signaling 5 seconds after the last accident is cleared. |
| **Manual Override** | Operators can manually clear any lane from the Command Dashboard via a "Clear" button on the Accident Stack panel. |

**API Endpoints:**
- `GET /accident/queue` — Returns the full MAPQ queue status.
- `POST /accident/clear/{lane_id}` — Manually clears an accident from a lane.

### 🔖 ANPR System
One of the most realistic features is the **Vehicle Owner Database** integration:
- **Automatic Number Plate Recognition (ANPR)**: Associates the accident with a specific vehicle plate.
- **Owner Lookup**: Queries a SQLite database to find the owner's name and contact information.

---

## 4. Operational Workflow

1.  **Stage Videos**: A traffic operator uploads video files for four lanes via the Monitoring App.
2.  **Initialize Simulation**: The system starts the threaded **VideoManager** and the **TrafficController**.
3.  **Process Inference**: The Backend runs inference on every 3rd frame (to optimize CPU).
4.  **Detect & Respond (MAPQ)**:
    - **Accident Detected (>80% confidence)?** → Register in `AccidentManager` FIFO → Save frame → Notify Dashboard → Sustained GREEN for that lane.
    - **Second Accident?** → Queued behind the first. Waits for its turn.
5.  **Auto-Clearance**: If no accident is detected in a lane for 10 consecutive seconds, the lane is automatically cleared from the queue.
6.  **Recovery**: System returns to Normal Mode 5 seconds after the queue becomes empty.

---

## 5. Technical Stack
- **AI/ML**: YOLOv8 (Inference), OpenCV (Image Processing), EasyOCR (Number Plate Extraction).
- **Backend**: FastAPI, Uvicorn, SQLite3, MQTT (Paho-MQTT).
- **Frontend**: Next.js, Tailwind CSS, Turbopack, Lucide Icons.
- **Communication**: WebSockets (Real-time signals), MQTT (IoT alerts), MJPEG (Video streaming).

---

## 6. Future Roadmap
- **Live Camera Integration**: Directly connecting to IP/CCTV cameras instead of video files.
- **Cloud Database**: Migrating the SQLite owner database to a centralized PostgreSQL system.
- **Deep ANPR Training**: Improving plate recognition accuracy in low-light and high-speed conditions.
- **Mobile SOS App**: A companion app for emergency drivers to broadcast their location to the nearest signals.

---
*Developed for the TRAFCON360 Smart City Initiative*
