import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { PurchaseController } from "./purchase.controller";
import { PurchaseService } from "./purchase.service";
import { Purchase } from "../database/entites/purchase.entity";
import { PurchasedItem } from "../database/entites/purchased_item.entity";

@Module({
  imports: [MikroOrmModule.forFeature([Purchase, PurchasedItem])],
  controllers: [PurchaseController],
  providers: [PurchaseService],
})
export class PurchaseModule {}