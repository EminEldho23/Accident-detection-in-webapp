import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { Accident, AccidentDocument } from './accident.schema';
import { CreateAccidentDto, UpdateAccidentDto } from './accident.dto';
import { EventsGateway } from '../gateway/events.gateway';

@Injectable()
export class AccidentService {
  private readonly logger = new Logger(AccidentService.name);
  private readonly fastApiUrl =
    process.env.FASTAPI_URL || 'http://localhost:8000';

  constructor(
    @InjectModel(Accident.name)
    private accidentModel: Model<AccidentDocument>,
    private eventsGateway: EventsGateway,
  ) {}

  /**
   * Create accident record, optionally verify with FastAPI ML
   */
  async create(dto: CreateAccidentDto): Promise<AccidentDocument> {
    // Step 1: Save to MongoDB immediately
    const accident = new this.accidentModel({
      imageBase64: dto.imageBase64,
      gps: dto.gps,
      severity: dto.severity || 'medium',
      deviceId: dto.deviceId,
      timestamp: new Date(),
    });
    const saved = await accident.save();
    this.logger.log(`🚨 Accident recorded: ${saved._id} [${saved.severity}]`);

    // Step 2: Emit real-time event via Socket.IO
    this.eventsGateway.emitAccident(saved);

    // Step 3: ML verification (async, non-blocking)
    this.verifyWithML(saved).catch((err) =>
      this.logger.warn(`ML verification failed: ${err.message}`),
    );

    return saved;
  }

  /**
   * Send image to FastAPI /detect for YOLOv8 verification
   */
  private async verifyWithML(accident: AccidentDocument): Promise<void> {
    try {
      const response = await axios.post(
        `${this.fastApiUrl}/detect`,
        {
          image: accident.imageBase64,
          accident_id: accident._id.toString(),
        },
        { timeout: 15000 },
      );

      const { is_accident, confidence, severity } = response.data;

      await this.accidentModel.findByIdAndUpdate(accident._id, {
        verified: is_accident,
        mlConfidence: confidence,
        severity: severity || accident.severity,
      });

      this.logger.log(
        `🤖 ML Result: accident=${is_accident}, confidence=${confidence}`,
      );

      // Emit updated accident with ML results
      const updated = await this.accidentModel.findById(accident._id);
      if (updated) {
        this.eventsGateway.emitAccidentUpdate(updated);
      }
    } catch (err) {
      this.logger.warn(`FastAPI ML unreachable: ${err.message}`);
    }
  }

  /**
   * Get all accidents with optional filters
   */
  async findAll(filters?: {
    severity?: string;
    status?: string;
    limit?: number;
  }): Promise<AccidentDocument[]> {
    const query: any = {};
    if (filters?.severity) query.severity = filters.severity;
    if (filters?.status) query.status = filters.status;

    return this.accidentModel
      .find(query)
      .sort({ timestamp: -1 })
      .limit(filters?.limit || 100)
      .exec();
  }

  /**
   * Get single accident by ID
   */
  async findById(id: string): Promise<AccidentDocument | null> {
    return this.accidentModel.findById(id).exec();
  }

  /**
   * Update accident (status, severity, etc.)
   */
  async update(
    id: string,
    dto: UpdateAccidentDto,
  ): Promise<AccidentDocument | null> {
    const updated = await this.accidentModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    if (updated) {
      this.eventsGateway.emitAccidentUpdate(updated);
    }
    return updated;
  }

  /**
   * Get accident stats
   */
  async getStats(): Promise<any> {
    const total = await this.accidentModel.countDocuments();
    const critical = await this.accidentModel.countDocuments({
      severity: 'critical',
    });
    const high = await this.accidentModel.countDocuments({ severity: 'high' });
    const pending = await this.accidentModel.countDocuments({
      status: 'pending',
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = await this.accidentModel.countDocuments({
      timestamp: { $gte: today },
    });

    return { total, critical, high, pending, todayCount };
  }
}
