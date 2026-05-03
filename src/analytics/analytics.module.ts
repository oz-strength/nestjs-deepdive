import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EmailModule } from 'src/email/email.module';
import { VideoModule } from 'src/video/video.module';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [ScheduleModule.forRoot(), VideoModule, EmailModule],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
