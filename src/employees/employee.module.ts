import { Module } from '@nestjs/common';
import { EmployeeController } from './emplyee.controller';
import { EmployeeService } from './employee.service';

@Module({
  controllers: [EmployeeController],
  providers: [EmployeeService],
})
export class EmployeeModule {}