import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccidentModule } from './accident/accident.module';
import { MqttModule } from './mqtt/mqtt.module';
import { EventsModule } from './gateway/events.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    // MongoDB connection - defaults to local, override via MONGO_URI env
    MongooseModule.forRoot(
      process.env.MONGO_URI || 'mongodb://localhost:27017/traffcon360',
    ),
    AccidentModule,
    MqttModule,
    EventsModule,
    AuthModule,
  ],
})
export class AppModule {}
