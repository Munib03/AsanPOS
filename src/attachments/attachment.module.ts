import { Module } from '@nestjs/common';
import { AttachmentController } from './attachment.controller';
import { AttachmentService } from './attachment.service';
import { MinioService } from '../shared/services/minio.service';

@Module({
  controllers: [AttachmentController],
  providers: [AttachmentService, MinioService],
})
export class AttachmentModule {}