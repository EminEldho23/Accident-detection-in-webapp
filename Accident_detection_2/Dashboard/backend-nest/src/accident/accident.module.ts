import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccidentController } from './accident.controller';
import { AccidentService } from './accident.service';
import { Accident, AccidentSchema } from './accident.schema';
import { EventsModule } from '../gateway/events.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Accident.name, schema: AccidentSchema },
    ]),
    EventsModule,
  ],
  controllers: [AccidentController],
  providers: [AccidentService],
  exports: [AccidentService],
})
export class AccidentModule {}
