import { Module } from '@nestjs/common';
import { EmployeeController } from './emplyee.controller';
import { EmployeeService } from './employee.service';
import { MinioService } from '../shared/services/minio.service';

@Module({
  controllers: [EmployeeController],
  providers: [EmployeeService, MinioService],
})
export class EmployeeModule {}