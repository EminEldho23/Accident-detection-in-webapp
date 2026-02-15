import { Module } from '@nestjs/common';
import { MqttService } from './mqtt.service';
import { AccidentModule } from '../accident/accident.module';

@Module({
  imports: [AccidentModule],
  providers: [MqttService],
  exports: [MqttService],
})
export class MqttModule {}
