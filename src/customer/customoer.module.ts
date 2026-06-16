import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { EntityManager } from '@mikro-orm/core';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { Customer } from '../database/entites/customer.entity';
import { BaseRepository } from '../shared/repositories/base.repository';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    MikroOrmModule.forFeature([Customer]),
    AuditModule,
  ],
  controllers: [CustomerController],
  providers: [
    CustomerService,
    {
      provide: BaseRepository,
      useFactory: (em: EntityManager) => new BaseRepository(em, Customer),
      inject: [EntityManager],
    },
  ],
})
export class CustomerModule {}