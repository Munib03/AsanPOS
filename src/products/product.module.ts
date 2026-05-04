import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { EntityManager } from '@mikro-orm/core';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { MinioService } from '../shared/services/minio.service';
import { AttachmentService } from '../shared/services/attachment.service';
import { Product } from '../database/entites/product.entity';
import { ProductRepository } from './product.repository';

@Module({
  imports: [MikroOrmModule.forFeature([Product])],
  controllers: [ProductController],
  providers: [
    ProductService,
    MinioService,
    AttachmentService,
    {
      provide: ProductRepository,
      useFactory: (em: EntityManager) => new ProductRepository(em),
      inject: [EntityManager],
    },
  ],
})
export class ProductModule {}