import { Module } from '@nestjs/common';
import { EmployeeController } from './emplyee.controller';
import { EmployeeService } from './employee.service';
import { MinioService } from '../shared/services/minio.service';
import { QueueModule } from '../queue/queue.module';
import { QueueService } from '../queue/queue.service';

@Module({
  imports: [QueueModule],
  controllers: [EmployeeController],
  providers: [EmployeeService, MinioService, QueueService],
})
export class EmployeeModule {}