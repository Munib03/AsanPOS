import { Module } from '@nestjs/common';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { MinioService } from '../shared/services/minio.service';

@Module({
  controllers: [ProductController],
  providers: [ProductService, MinioService],
})
export class ProductModule {}