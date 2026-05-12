import { EntityManager, serialize } from "@mikro-orm/postgresql";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Purchase } from "../database/entites/purchase.entity";
import { Customer } from "../database/entites/customer.entity";
import { Product } from "../database/entites/product.entity";
import { Inventory } from "../database/entites/inventory.entity";
import { UpdatePurchaseDto } from "./dto/update-purchase.dto";
import { PurchasedItem } from "../database/entites/purchased_item.entity";
import { CreatePurchaseDto } from "./dto/create-purchase.dto";
import { Store } from "../database/entites/store.entity";
import { BaseRepository } from "../shared/repositories/base.repository";
import { PaginateQuery } from "../shared/types/paginate-query.types";
import { PurchaseStatus } from "../shared/utils/purchase-status-enum";


@Injectable()
export class PurchaseService {
  constructor(
  private readonly em: EntityManager,
  private readonly purchaseRepository: BaseRepository<Purchase>,
  ) {}


  async findAll(store: Store, query: PaginateQuery) {
    const [purchases, meta] = await this.purchaseRepository.findAndPaginate(
      { inventory: { store } },
      {
        populate: ["customer", "inventory", "items", "items.product"],
        fields: [
          "id", "sequenceId", "status", "customDate", "createdAt",
          "customer.id", "customer.name",
          "inventory.id", "inventory.name",
          "items.id", "items.quantity", "items.unitPrice",
          "items.product.id", "items.product.name", "items.product.price",
        ],
      },
      {
        searchable: ["customer.name", "status"]
      },
      query,
    );

    return {
      data: serialize(purchases, { populate: ["customer", "inventory", "items", "items.product"] }),
      meta,
    };
  }


  async findOne(store: Store, id: string) {
    const purchase = await this.em.findOne(Purchase,
      { id, inventory: { store } },
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
        status: PurchaseStatus.DRAFT,
      });

      await em.persistAndFlush(purchase);


      const products = await em.findAll(Product, {
        where: { id: { $in: dto.items.map(item => item.productId) } },
      });

      if (products.length !== dto.items.length)
        throw new NotFoundException(`One or more products not found`);

      const productMap = new Map(products.map(product => [product.id, product]));

      const purchasedItems = dto.items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product)
          throw new NotFoundException(`Product with id ${item.productId} not found`);

        return em.create(PurchasedItem, {
          purchase,
          product,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        });
      });

      await em.persistAndFlush(purchasedItems);

      const totalPrice = dto.items.reduce((sum, item) => {
        return sum + item.unitPrice * item.quantity;
      }, 0);

      return { "Total Cost": totalPrice };
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

      if (dto.status) {
        this.getAllowedTransitions(purchase.status as PurchaseStatus, dto.status);
        purchase.status = dto.status;
      }
      
      await this.em.flush();
      return { message: `Purchase with id ${id} updated successfully.` };
    }


    private getAllowedTransitions(currentStatus: PurchaseStatus, newStatus: PurchaseStatus): void {
      const transitions = new Map([
        [PurchaseStatus.DRAFT, [PurchaseStatus.DONE, PurchaseStatus.CANCELLED]],
        [PurchaseStatus.DONE, []],
        [PurchaseStatus.CANCELLED, []],
      ]);

      const allowedTransitions = transitions.get(currentStatus) ?? [];
      if (!allowedTransitions.includes(newStatus))
        throw new BadRequestException(`Cannot transition from '${currentStatus}' to '${newStatus}'.`);
    }
}