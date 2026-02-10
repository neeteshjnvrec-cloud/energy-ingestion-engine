import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { typeOrmConfig } from './config/typeorm.config';
import { TelemetryModule } from './modules/telemetry/telemetry.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AppController } from './app.controller'; // 1. Import the controller

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => typeOrmConfig,
    }),
    ScheduleModule.forRoot(),
    TelemetryModule,
    AnalyticsModule,
  ],
  controllers: [AppController], // 2. Register the controller here
})
export class AppModule {}