import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreateVideoHandler } from './create-video.handler';
import { Video } from './entity/video.entity';
import { FindVideosQueryHandler } from './find-videos.handler';
import { VideoCreatedHandler } from './video-created.handler';
import { VideoController } from './video.controller';
import { VideoService } from './video.service';

@Module({
  imports: [TypeOrmModule.forFeature([Video]), CqrsModule],
  controllers: [VideoController],
  providers: [VideoService, CreateVideoHandler, VideoCreatedHandler, FindVideosQueryHandler],
  exports: [VideoService],
})
export class VideoModule {}
