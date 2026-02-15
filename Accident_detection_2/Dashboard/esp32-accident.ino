/*
 * TRAFCCON360 - ESP32-CAM Accident Detection MQTT Publisher
 *
 * Hardware: ESP32-CAM + OV2640 Camera
 * Purpose: Capture images, detect motion/accidents, publish to MQTT
 *
 * Dependencies:
 * - ESP32 Arduino Core
 * - PubSubClient (MQTT)
 * - ArduinoJson
 *
 * Wiring:
 * - ESP32-CAM: Connect to FTDI for programming
 * - PIR Sensor: GPIO 13 (optional, for motion detection)
 * - GPS Module: Serial2 (optional, for location)
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <esp32cam.h>
#include <ArduinoJson.h>

// ── WiFi Configuration ──────────────────────────────────────────
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// ── MQTT Configuration ──────────────────────────────────────────
const char* MQTT_BROKER = "broker.hivemq.com";  // Public broker for testing
const int MQTT_PORT = 1883;
const char* MQTT_TOPIC = "traffic/accident";
const char* DEVICE_ID = "ESP32-CAM-01";

// ── GPS Configuration (Optional) ────────────────────────────────
#define GPS_TX 14
#define GPS_RX 15
// Default Mumbai coordinates if no GPS
float DEFAULT_LAT = 19.0760;
float DEFAULT_LNG = 72.8777;

// ── Hardware Pins ───────────────────────────────────────────────
#define PIR_PIN 13  // PIR motion sensor
#define LED_PIN 33  // Status LED

// ── Global Objects ──────────────────────────────────────────────
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

// ── State Variables ─────────────────────────────────────────────
bool motionDetected = false;
unsigned long lastCapture = 0;
const unsigned long CAPTURE_INTERVAL = 5000;  // 5 seconds between captures
const unsigned long MOTION_TIMEOUT = 10000;  // 10 seconds motion timeout

// ── Camera Configuration ────────────────────────────────────────
static auto loRes = esp32cam::Resolution::find(320, 240);
static auto hiRes = esp32cam::Resolution::find(800, 600);

// ── Function Declarations ───────────────────────────────────────
void setupWiFi();
void setupMQTT();
void setupCamera();
void reconnectMQTT();
void captureAndPublish();
String getGPSCoordinates();
void blinkLED(int times, int delayMs);

// ── Setup ───────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  Serial2.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);  // GPS serial

  pinMode(PIR_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);

  Serial.println("\n🚀 TRAFCCON360 ESP32-CAM Starting...");

  setupCamera();
  setupWiFi();
  setupMQTT();

  blinkLED(3, 200);  // Startup indicator
  Serial.println("✅ Setup complete!");
}

// ── Main Loop ───────────────────────────────────────────────────
void loop() {
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ WiFi disconnected, reconnecting...");
    setupWiFi();
  }

  // Check MQTT connection
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();

  // Check for motion
  bool currentMotion = digitalRead(PIR_PIN);
  if (currentMotion && !motionDetected) {
    motionDetected = true;
    Serial.println("🎯 Motion detected!");
    digitalWrite(LED_PIN, HIGH);
  }

  // Capture and publish if motion detected or interval elapsed
  unsigned long now = millis();
  if ((motionDetected && (now - lastCapture > 1000)) ||  // Immediate on motion
      (now - lastCapture > CAPTURE_INTERVAL)) {         // Regular interval

    captureAndPublish();
    lastCapture = now;

    // Reset motion flag after timeout
    if (motionDetected && (now - lastCapture > MOTION_TIMEOUT)) {
      motionDetected = false;
      digitalWrite(LED_PIN, LOW);
      Serial.println("⏰ Motion timeout, resetting");
    }
  }

  delay(100);
}

// ── WiFi Setup ──────────────────────────────────────────────────
void setupWiFi() {
  Serial.printf("📡 Connecting to WiFi: %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n✅ WiFi connected! IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n❌ WiFi connection failed!");
    ESP.restart();
  }
}

// ── MQTT Setup ──────────────────────────────────────────────────
void setupMQTT() {
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  Serial.printf("📡 MQTT broker: %s:%d\n", MQTT_BROKER, MQTT_PORT);
}

// ── Camera Setup ────────────────────────────────────────────────
void setupCamera() {
  using namespace esp32cam;
  Config cfg;
  cfg.setPins(pins::AiThinker);
  cfg.setResolution(hiRes);
  cfg.setBufferCount(2);
  cfg.setJpeg(80);

  bool ok = Camera.begin(cfg);
  if (!ok) {
    Serial.println("❌ Camera initialization failed!");
    ESP.restart();
  }
  Serial.println("📷 Camera initialized successfully");
}

// ── MQTT Reconnection ───────────────────────────────────────────
void reconnectMQTT() {
  while (!mqttClient.connected()) {
    Serial.printf("🔄 Connecting to MQTT as %s...\n", DEVICE_ID);

    if (mqttClient.connect(DEVICE_ID)) {
      Serial.println("✅ MQTT connected!");
      blinkLED(2, 100);
    } else {
      Serial.printf("❌ MQTT connection failed (rc=%d), retrying in 5s...\n",
                   mqttClient.state());
      delay(5000);
    }
  }
}

// ── Capture and Publish ─────────────────────────────────────────
void captureAndPublish() {
  Serial.println("📸 Capturing image...");

  auto frame = esp32cam::capture();
  if (frame == nullptr) {
    Serial.println("❌ Capture failed!");
    return;
  }

  // Convert frame to base64
  String base64Image = base64::encode(frame->data(), frame->size());

  // Get GPS coordinates
  String gpsCoords = getGPSCoordinates();

  // Create JSON payload
  StaticJsonDocument<4096> doc;
  doc["image"] = base64Image;
  doc["gps"] = gpsCoords;
  doc["deviceId"] = DEVICE_ID;
  doc["timestamp"] = millis();
  doc["severity"] = motionDetected ? "high" : "medium";  // Basic severity

  // Serialize JSON
  String payload;
  serializeJson(doc, payload);

  // Publish to MQTT
  bool published = mqttClient.publish(MQTT_TOPIC, payload.c_str());
  if (published) {
    Serial.printf("📤 Published %d bytes to %s\n", payload.length(), MQTT_TOPIC);
    blinkLED(1, 50);
  } else {
    Serial.println("❌ MQTT publish failed!");
  }
}

// ── GPS Coordinates ─────────────────────────────────────────────
String getGPSCoordinates() {
  // This is a simplified GPS implementation
  // In production, parse NMEA sentences from GPS module
  // For now, return default coordinates

  // TODO: Implement proper GPS parsing
  // Example: Parse $GPGGA sentence for lat/lng

  return String(DEFAULT_LAT, 4) + "," + String(DEFAULT_LNG, 4);
}

// ── LED Blinking ────────────────────────────────────────────────
void blinkLED(int times, int delayMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(delayMs);
    digitalWrite(LED_PIN, LOW);
    delay(delayMs);
  }
}

// ── Serial Command Interface (Optional) ─────────────────────────
void serialCommandHandler() {
  if (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    command.trim();

    if (command == "capture") {
      captureAndPublish();
    } else if (command == "status") {
      Serial.printf("WiFi: %s\n", WiFi.status() == WL_CONNECTED ? "Connected" : "Disconnected");
      Serial.printf("MQTT: %s\n", mqttClient.connected() ? "Connected" : "Disconnected");
      Serial.printf("Motion: %s\n", motionDetected ? "Detected" : "None");
    } else if (command.startsWith("gps ")) {
      // Manual GPS override: "gps 19.0760,72.8777"
      String coords = command.substring(4);
      int commaIndex = coords.indexOf(',');
      if (commaIndex > 0) {
        DEFAULT_LAT = coords.substring(0, commaIndex).toFloat();
        DEFAULT_LNG = coords.substring(commaIndex + 1).toFloat();
        Serial.printf("GPS updated: %f, %f\n", DEFAULT_LAT, DEFAULT_LNG);
      }
    }
  }
}

// Add to main loop for serial commands
// serialCommandHandler();