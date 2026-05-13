import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { EntityManager } from '@mikro-orm/core';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';
import { Category } from '../database/entites/category.entity';
import { BaseRepository } from '../shared/repositories/base.repository';

@Module({
  imports: [
    MikroOrmModule.forFeature([Category]),
  ],
  controllers: [CategoryController],
  providers: [
    CategoryService,
    {
      provide: BaseRepository,
      useFactory: (em: EntityManager) => new BaseRepository(em, Category),
      inject: [EntityManager],
    },
  ],
})
export class CategoryModule {}