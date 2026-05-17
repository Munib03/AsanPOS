import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Sequence } from '../database/entites/sequence.entity';
import { SequenceService } from './sequence.service';

@Module({
  imports: [MikroOrmModule.forFeature([Sequence])],
  providers: [SequenceService],
  exports: [SequenceService],
})
export class SequenceModule {}