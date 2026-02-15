import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AccidentDocument = Accident & Document;

@Schema({ timestamps: true })
export class Accident {
  @Prop({ required: true })
  imageBase64: string;

  @Prop({ default: () => new Date() })
  timestamp: Date;

  @Prop({ required: true })
  gps: string; // "lat,lng" e.g. "19.07,72.87"

  @Prop({ enum: ['low', 'medium', 'high', 'critical'], default: 'medium' })
  severity: string;

  @Prop({ default: false })
  verified: boolean; // ML-verified by FastAPI

  @Prop()
  mlConfidence: number; // 0-1 confidence from YOLOv8

  @Prop()
  deviceId: string; // ESP32 device identifier

  @Prop()
  address: string; // Optional reverse-geocoded address

  @Prop({ default: 'pending', enum: ['pending', 'dispatched', 'resolved'] })
  status: string;
}

export const AccidentSchema = SchemaFactory.createForClass(Accident);
