import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { EmployeeModule } from './employees/employee.module';
import { StoresModule } from './stores/stores.module';
import { CategoryModule } from "./categories/category.module";
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { QueueModule } from './queue/queue.module';
import { SharedModule } from './shared/services/shared.module';
import config from './mikro-orm.config';
import { ProductModule } from './products/product.module';
import { InventoryModule } from './inventory/inventory.module';
import { CustomerModule } from './customer/customer.module';
import { PurchaseModule } from './purchase/purchase.module';
import { StockInModule } from './stock-in/stock-in.module';
import { JournalEntryModule } from './journal/journal.module';
import { SaleModule } from './sale/sale.module';
import { StockOutModule } from './stock-out/stock-out.module';
import { CashMovementModule } from './cash-movements/cash-movement.module';
import { PaymentModule } from './payments/payment.module';
import { StoreSessionModule } from './store-session/store-session.module';
import { ReceiptModule } from './receipt/receipt.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReportModule } from './reports/report.module';
import { StockMovementModule } from './stock-movement/stock-movement.module';
import { AiAssistantModule } from './ai-assistant/ai-assistant.module';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MikroOrmModule.forRoot(config),
    QueueModule,
    EmployeeModule,
    StoresModule,
    AuthModule,
    SharedModule,
    CategoryModule,
    ProductModule,
    InventoryModule,
    CustomerModule,
    PurchaseModule,
    StockInModule,
    JournalEntryModule,
    SaleModule,
    StockOutModule,
    CashMovementModule,
    StoreSessionModule,
    PaymentModule,
    ReceiptModule,
    DashboardModule,
    ReportModule,
    StockMovementModule,
    AiAssistantModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
