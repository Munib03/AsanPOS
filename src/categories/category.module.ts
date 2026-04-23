import { Module } from '@nestjs/common';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';
import { StoreGuard } from '../shared/guards/store.guard';

@Module({
  controllers: [CategoryController],
  providers: [ CategoryService, StoreGuard ],
})
export class CategoryModule {}