# TRAFCCON360 - Complete Accident Detection Dashboard
## NestJS + FastAPI + React + ESP32 Stack

A comprehensive IoT accident detection system with real-time monitoring, ML verification, and police dashboard.

### 🏗️ Architecture

```
ESP32-CAM → MQTT → NestJS:3001 → MongoDB
                    ↓
               FastAPI:8000 (YOLOv8 ML)
                    ↓
               React:5173 (Dashboard)
```

### 🚀 Quick Start

#### Option 1: Docker (Recommended)
```bash
# Clone and navigate to project
cd TRAFCCON360-Dashboard

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Access dashboard
open http://localhost:5173
```

#### Option 2: Manual Setup

**1. Start MongoDB**
```bash
# Using Docker
docker run -d -p 27017:27017 --name mongo-traffcon mongo:7.0

# Or install MongoDB locally
```

**2. Start MQTT Broker**
```bash
# Using Docker
docker run -d -p 1883:1883 eclipse-mosquitto:2.0

# Or install Mosquitto locally
```

**3. Start FastAPI ML Service**
```bash
cd fastapi-ml
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**4. Start NestJS Backend**
```bash
cd backend-nest
npm install
npm run start:dev
```

**5. Start React Frontend**
```bash
cd frontend-react
npm install
npm run dev
```

### 📡 ESP32 Setup

1. **Hardware Required:**
   - ESP32-CAM module
   - OV2640 camera
   - PIR motion sensor (optional)
   - GPS module (optional)

2. **Arduino IDE Setup:**
   - Install ESP32 board support
   - Install libraries: `PubSubClient`, `ArduinoJson`, `esp32-camera`
   - Open `esp32-accident.ino`
   - Update WiFi credentials
   - Upload to ESP32-CAM

3. **ESP32 Configuration:**
   ```cpp
   const char* WIFI_SSID = "YOUR_WIFI_SSID";
   const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
   const char* MQTT_BROKER = "broker.hivemq.com";  // Or your MQTT broker IP
   ```

### 🔧 Environment Variables

**Backend (.env):**
```env
MONGO_URI=mongodb://localhost:27017/traffcon360
MQTT_BROKER=mqtt://localhost:1883
JWT_SECRET=your-secret-key
FASTAPI_URL=http://localhost:8000
```

**FastAPI (.env):**
```env
YOLO_MODEL_PATH=./models/best.pt
```

### 📊 API Endpoints

#### NestJS Backend (http://localhost:3001)
- `GET /api/accidents` - List accidents with filters
- `GET /api/accidents/stats` - Dashboard statistics
- `POST /api/accidents` - Create accident record
- `PUT /api/accidents/:id` - Update accident status
- `POST /api/upload-image` - Upload image with GPS

#### FastAPI ML (http://localhost:8000)
- `GET /` - Service info
- `POST /detect` - Detect accident from base64 image
- `POST /detect-upload` - Detect from uploaded file
- `GET /health` - Health check

### 🎨 Dashboard Features

- **Real-time Accident Feed** - Live updates via Socket.IO
- **Interactive Map** - Leaflet.js with GPS markers
- **Severity Filtering** - Critical, High, Medium, Low
- **ML Verification** - YOLOv8 confidence scores
- **Alert System** - Audio alerts for critical accidents
- **Police Theme** - Dark UI with emergency colors

### 🤖 ML Model

The system uses YOLOv8 for accident detection:
- **Model:** `best.pt` (trained on accident dataset)
- **Input:** JPEG images from ESP32-CAM
- **Output:** Detection confidence, severity classification
- **Fallback:** Downloads `yolov8n.pt` if custom model unavailable

### 📁 Project Structure

```
traffcon360-dashboard/
├── backend-nest/          # NestJS API server
│   ├── src/
│   │   ├── accident/      # Accident CRUD
│   │   ├── mqtt/          # MQTT listener
│   │   ├── gateway/       # Socket.IO
│   │   └── auth/          # JWT authentication
│   └── Dockerfile
├── fastapi-ml/            # FastAPI ML service
│   ├── main.py
│   ├── models/best.pt     # YOLOv8 model
│   └── Dockerfile
├── frontend-react/        # React dashboard
│   ├── src/
│   │   ├── components/    # UI components
│   │   └── hooks/         # Custom hooks
│   └── Dockerfile
├── esp32-accident.ino     # ESP32 firmware
├── docker-compose.yml     # Full stack orchestration
└── README.md
```

### 🔒 Security Notes

- Change default JWT secret in production
- Use secure MQTT authentication
- Implement proper user authentication
- Add rate limiting to APIs
- Use HTTPS in production

### 🚨 Testing

**Test MQTT Publishing:**
```bash
# Install mosquitto-clients
mosquitto_pub -h localhost -t "traffic/accident" -m '{"image":"base64...", "gps":"19.0760,72.8777", "deviceId":"test-device"}'
```

**Test API Endpoints:**
```bash
# Get accidents
curl http://localhost:3001/api/accidents

# Get stats
curl http://localhost:3001/api/accidents/stats

# Test ML detection
curl -X POST http://localhost:8000/detect -H "Content-Type: application/json" -d '{"image":"base64..."}'
```

### 📈 Monitoring

- **Backend Logs:** `docker-compose logs backend`
- **ML Service Logs:** `docker-compose logs fastapi`
- **Database:** MongoDB Compass or Studio 3T
- **MQTT:** MQTT Explorer for debugging

### 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

### 📄 License

MIT License - see LICENSE file for details.

---

**Built for TRAFCCON360 - Smart Traffic Accident Detection System**

For questions or support: [Your Contact Information]