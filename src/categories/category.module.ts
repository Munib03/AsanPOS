import { Module } from '@nestjs/common';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';
import { BaseRepository } from '../shared/repositories/base.repository';
import { Category } from '../database/entites/category.entity';
import { EntityManager } from '@mikro-orm/core';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [CategoryController],
  providers: [
    CategoryService,
    {
      provide: BaseRepository,
      useFactory: (em) => new BaseRepository(em, Category),
      inject: [EntityManager],
    },
  ],
})
export class CategoryModule { }