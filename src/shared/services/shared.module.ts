import { Global, Module } from '@nestjs/common';
import { MinioService } from './minio.service';
import { AttachmentService } from './attachment.service';

@Global()
@Module({
  providers: [MinioService, AttachmentService],
  exports: [MinioService, AttachmentService],
})
export class SharedModule {}