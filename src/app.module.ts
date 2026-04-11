import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { EmployeeModule } from './employees/employee.module';import config from './mikro-orm.config';

@Module({
  imports: [
    MikroOrmModule.forRoot(config),
    EmployeeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}