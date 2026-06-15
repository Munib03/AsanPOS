import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { EntityManager } from '@mikro-orm/core';
import { AuditLog } from '../database/entites/audit-log.entity';
import { AuditService } from './audit.service';
import { BaseRepository } from '../shared/repositories/base.repository';
import { AuditController } from './audit.controller';

@Module({
  imports: [MikroOrmModule.forFeature([AuditLog])],
  controllers: [AuditController],
  providers: [
    AuditService,
    {
      provide: BaseRepository,
      useFactory: (em: EntityManager) => new BaseRepository(em, AuditLog),
      inject: [EntityManager],
    },
  ],
  exports: [AuditService],
})
export class AuditModule {}