import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { Sale } from '../database/entites/sale.entity';
import { SaleItem } from '../database/entites/sale-item.entity';
import { StockQuantity } from '../database/entites/stock-quantity.entity';
import { PurchasedItem } from '../database/entites/purchased_item.entity';
import { StoreSession } from '../database/entites/store-session.entity';
import { Payment } from '../database/entites/payments.entity';
import { CashMovement } from '../database/entites/cash-movement.entity';

@Module({
    imports: [MikroOrmModule.forFeature([Sale, SaleItem, StockQuantity, PurchasedItem, StoreSession, Payment, CashMovement])],
    controllers: [DashboardController],
    providers: [DashboardService],
    exports: [DashboardService],
})
export class DashboardModule { }
