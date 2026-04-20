import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { EmployeeModule } from './employees/employee.module';
import { StoresModule } from './stores/stores.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { QueueModule } from './queue/queue.module';  
import { SharedModule } from './shared/services/shared.module';
import config from './mikro-orm.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MikroOrmModule.forRoot(config),
    QueueModule,     
    EmployeeModule,
    StoresModule,
    AuthModule,
    SharedModule
  ],
  controllers: [AppController],
  providers: [AppService],
})

export class AppModule { }