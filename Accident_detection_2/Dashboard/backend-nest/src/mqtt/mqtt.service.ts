import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as mqtt from 'mqtt';
import { AccidentService } from '../accident/accident.service';

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client: mqtt.MqttClient;
  private readonly brokerUrl =
    process.env.MQTT_BROKER || 'mqtt://localhost:1883';
  private readonly topic = process.env.MQTT_TOPIC || 'traffic/accident';

  constructor(private readonly accidentService: AccidentService) {}

  async onModuleInit() {
    this.logger.log(`📡 Connecting to MQTT broker: ${this.brokerUrl}`);

    this.client = mqtt.connect(this.brokerUrl, {
      clientId: `traffcon360-nest-${Date.now()}`,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
    });

    this.client.on('connect', () => {
      this.logger.log(`✅ Connected to MQTT broker`);
      this.client.subscribe(this.topic, { qos: 1 }, (err) => {
        if (err) {
          this.logger.error(`Failed to subscribe to ${this.topic}: ${err.message}`);
        } else {
          this.logger.log(`📡 Subscribed to topic: ${this.topic}`);
        }
      });
    });

    this.client.on('message', async (topic, payload) => {
      try {
        await this.handleMessage(topic, payload.toString());
      } catch (err) {
        this.logger.error(`Error processing MQTT message: ${err.message}`);
      }
    });

    this.client.on('error', (err) => {
      this.logger.warn(`MQTT connection error: ${err.message}`);
    });

    this.client.on('offline', () => {
      this.logger.warn('MQTT client offline, will reconnect...');
    });
  }

  /**
   * Handle incoming ESP32-CAM MQTT message
   * Expected payload: {"image":"base64...", "gps":"19.07,72.87", "severity":"high", "deviceId":"ESP32-01"}
   */
  private async handleMessage(topic: string, payload: string): Promise<void> {
    this.logger.log(`📨 MQTT message on [${topic}] (${payload.length} bytes)`);

    const data = JSON.parse(payload);

    if (!data.image && !data.imageBase64) {
      this.logger.warn('MQTT message missing image data, skipping');
      return;
    }

    await this.accidentService.create({
      imageBase64: data.image || data.imageBase64,
      gps: data.gps || '0,0',
      severity: data.severity || 'medium',
      deviceId: data.deviceId || 'unknown-esp32',
    });

    this.logger.log(`🚨 Accident from ESP32 device: ${data.deviceId || 'unknown'}`);
  }

  async onModuleDestroy() {
    if (this.client) {
      this.client.end(true);
      this.logger.log('MQTT client disconnected');
    }
  }
}
