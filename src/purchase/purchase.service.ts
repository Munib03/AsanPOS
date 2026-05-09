import { EntityManager, serialize } from "@mikro-orm/postgresql";
import { Injectable, NotFoundException } from "@nestjs/common";
import { Purchase } from "../database/entites/purchase.entity";
import { Customer } from "../database/entites/customer.entity";
import { Product } from "../database/entites/product.entity";
import { Inventory } from "../database/entites/inventory.entity";
import { UpdatePurchaseDto } from "./dto/update-purchase.dto";
import { PurchasedItem } from "../database/entites/purchased_item.entity";
import { CreatePurchaseDto } from "./dto/create-purchase.dto";


@Injectable()
export class PurchaseService {
  constructor(private readonly em: EntityManager) {}


  async findAll() {
    const purchases = await this.em.findAll(Purchase, {
      populate: ["customer", "inventory", "items", "items.product"],
      fields: [
        "id", "sequenceId", "status", "customDate", "createdAt",
        "customer.id", "customer.name",
        "inventory.id", "inventory.name",
        "items.id", "items.quantity", "items.unitPrice", "items.status",
        "items.product.id", "items.product.name", "items.product.price",
      ],
    });

    return serialize(purchases, { populate: ["customer", "inventory", "items", "items.product"] });
  }


  async findOne(id: string) {
    const purchase = await this.em.findOne(Purchase,
      { id },
      { populate: ["customer", "inventory", "items", "items.product"] }
    );

    if (!purchase)
      throw new NotFoundException(`Purchase with id ${id} not found`);

    return serialize(purchase, { populate: ["customer", "inventory", "items", "items.product"] });
  }


  async create(dto: CreatePurchaseDto) {
    return await this.em.transactional(async (em) => {
      const customer = await em.findOne(Customer, { id: dto.customerId });
      if (!customer)
        throw new NotFoundException(`Customer with id ${dto.customerId} not found`);

      const inventory = await em.findOne(Inventory, { id: dto.inventoryId });
      if (!inventory)
        throw new NotFoundException(`Inventory with id ${dto.inventoryId} not found`);

      const purchase = em.create(Purchase, {
        customer,
        inventory,
        customDate: dto.customDate,
        status: "pending",
      });

      await em.persistAndFlush(purchase);

      const purchasedItems = await Promise.all(
        dto.items.map(async (item) => {
          const product = await em.findOne(Product, { id: item.productId });
          if (!product)
            throw new NotFoundException(`Product with id ${item.productId} not found`);

          return em.create(PurchasedItem, {
            purchase,
            product,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            status: "pending",
          });
        })
      );

      await em.persistAndFlush(purchasedItems);
      return { message: "Purchase created successfully." };
    });
  }


  async remove(id: string) {
    return await this.em.transactional(async (em) => {
      const purchase = await em.findOne(Purchase, { id }, { populate: ["items"] });
      if (!purchase)
        throw new NotFoundException(`Purchase with id ${id} not found`);

      await em.removeAndFlush(purchase);
      return { message: `Purchase with id ${id} deleted successfully.` };
    });
  }


  async update(id: string, dto: UpdatePurchaseDto) {
    const purchase = await this.em.findOne(Purchase, { id });
    if (!purchase)
      throw new NotFoundException(`Purchase with id ${id} not found`);

    purchase.status = dto.status ?? purchase.status;
    await this.em.flush();

    return { message: `Purchase with id ${id} updated successfully.` };
  }

}