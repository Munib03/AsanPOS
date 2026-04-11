import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { EmployeeController } from './emplyee.controller';
import { EmployeeService } from './employee.service';
import { Employee } from '../entites/Employee';
import { Store } from '../entites/Store';

@Module({
  imports: [MikroOrmModule.forFeature([Employee, Store])],
  controllers: [EmployeeController],
  providers: [EmployeeService],
})
export class EmployeeModule {}