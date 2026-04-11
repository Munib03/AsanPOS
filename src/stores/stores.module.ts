import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { StoresController } from './stores.controller';
import { StoresService } from './stores.service';
import { Store } from '../database/entites/store.entity';

@Module({
  imports: [MikroOrmModule.forFeature([Store])],
  controllers: [StoresController],
  providers: [StoresService],
})
export class StoresModule {}