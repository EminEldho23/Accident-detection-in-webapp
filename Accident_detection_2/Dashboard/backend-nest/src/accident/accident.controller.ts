import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  UploadedFile,
  UseInterceptors,
  HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AccidentService } from './accident.service';
import { CreateAccidentDto, UpdateAccidentDto } from './accident.dto';

@Controller('accidents')
export class AccidentController {
  constructor(private readonly accidentService: AccidentService) {}

  /**
   * GET /api/accidents
   * Query: ?severity=high&status=pending&limit=50
   */
  @Get()
  async findAll(
    @Query('severity') severity?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.accidentService.findAll({
      severity,
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /**
   * GET /api/accidents/stats
   */
  @Get('stats')
  async getStats() {
    return this.accidentService.getStats();
  }

  /**
   * GET /api/accidents/:id
   */
  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.accidentService.findById(id);
  }

  /**
   * POST /api/accidents
   * Body: { imageBase64, gps, severity?, deviceId? }
   */
  @Post()
  @HttpCode(201)
  async create(@Body() dto: CreateAccidentDto) {
    return this.accidentService.create(dto);
  }

  /**
   * POST /api/upload-image
   * Multipart form upload with GPS metadata
   */
  @Post('/upload-image')
  @UseInterceptors(FileInterceptor('image'))
  async uploadImage(
    @UploadedFile() file: any,
    @Body('gps') gps: string,
    @Body('severity') severity: string,
    @Body('deviceId') deviceId: string,
  ) {
    const imageBase64 = file.buffer.toString('base64');
    return this.accidentService.create({
      imageBase64,
      gps: gps || '0,0',
      severity: severity || 'medium',
      deviceId,
    });
  }

  /**
   * PUT /api/accidents/:id
   * Body: { status?, severity?, address? }
   */
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAccidentDto) {
    return this.accidentService.update(id, dto);
  }
}
