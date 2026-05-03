import { Module } from '@nestjs/common';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { MinioService } from '../shared/services/minio.service';
import { AttachmentService } from '../shared/services/attachment.service';

@Module({
  controllers: [ProductController],
  providers: [ProductService, MinioService, AttachmentService],
})
export class ProductModule {}