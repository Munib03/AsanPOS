import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { EntityManager } from '@mikro-orm/core';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { MinioService } from '../shared/services/minio.service';
import { Product } from '../database/entites/product.entity';
import { BaseRepository } from '../shared/repositories/base.repository';
import { AttachmentModule } from '../attachments/attachment.module';

@Module({
  imports: [
    MikroOrmModule.forFeature([Product]),
    AttachmentModule,
  ],
  controllers: [ProductController],
  providers: [
    ProductService,
    MinioService,
    {
      provide: BaseRepository,
      useFactory: (em: EntityManager) => new BaseRepository(em, Product),
      inject: [EntityManager],
    },
  ],
})
export class ProductModule {}