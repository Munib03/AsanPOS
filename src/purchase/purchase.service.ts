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
import { PurchaseStatus } from "../shared/utils/purchase-status-enum";
import { PaginateQuery, Meta } from "../shared/types/paginate-query.types";
import { PurchaseListItem } from "../shared/types/purchase.types";
import { SequenceService } from "../sequence/sequence.service";


@Injectable()
export class PurchaseService {
  constructor(
    private readonly em: EntityManager,
    private readonly purchaseRepository: BaseRepository<Purchase>,
    private readonly sequenceService: SequenceService,
  ) {}


  async findAll(store: Store, query: PaginateQuery): Promise<{ data: PurchaseListItem[]; meta: Meta }> {
    const [purchases, meta] = await this.purchaseRepository.findAndPaginate(
      { store },
      {
        populate: ["customer", "items", "items.product", "sequence"],
        fields: [
          "id", "status", "customDate", "createdAt",
          "sequence.prefix", "sequence.lastIndex",
          "customer.id", "customer.name",
          "items.id", "items.quantity", "items.unitPrice",
          "items.product.id", "items.product.name", "items.product.price",
        ],
      },
      {
        searchable: ["customer.name", "status"]
      },
      query,
    );

    const serialized = serialize(purchases, { populate: ["customer", "items", "items.product", "sequence"] });

    const data = serialized.map(purchase => ({
      ...purchase,
      sequenceId: `${purchase.sequence.prefix}-${String(purchase.sequence.lastIndex).padStart(4, '0')}`,
      totalPrice: purchase.items.reduce((sum, item) => {
        return sum + item.unitPrice * item.quantity;
      }, 0),
    }));

    return { data, meta };
  }


  async findOne(store: Store, id: string): Promise<PurchaseListItem> {
    const purchase = await this.em.findOne(Purchase,
      { id, store },
      {
        populate: ["customer", "items", "items.product", "sequence"],
        fields: [
          "id", "status", "customDate",
          "sequence.prefix", "sequence.lastIndex",
          "customer.id", "customer.name", "customer.phone", "customer.address",
          "items.id", "items.quantity", "items.unitPrice", "items.received",
          "items.product.id", "items.product.name", "items.product.price",
        ],
      }
    );

    if (!purchase)
      throw new NotFoundException(`Purchase with id ${id} not found`);

    const serialized = serialize(purchase, { populate: ["customer", "items", "items.product", "sequence"] });

    const { sequence, createdAt, updatedAt, ...rest } = serialized;

    return {
      ...rest,
      sequenceId: `${sequence.prefix}-${String(sequence.lastIndex).padStart(4, '0')}`,
      totalPrice: serialized.items.reduce((sum, item) => {
        return sum + item.unitPrice * item.quantity;
      }, 0),
      items: serialized.items.map(({ purchase, ...item }) => item),
    };
  }


  async create(store: Store, dto: CreatePurchaseDto) {
    return await this.em.transactional(async (em) => {
      const customer = await em.findOne(Customer, { id: dto.customerId });
      if (!customer)
        throw new NotFoundException(`Customer with id ${dto.customerId} not found`);

      const sequence = await this.sequenceService.generateSequence(em, 'Purchase', 'PUR');

      const purchase = em.create(Purchase, {
        customer,
        store,
        customDate: dto.customDate,
        status: PurchaseStatus.DRAFT,
        sequence,
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

      return { message: `Purchase created successfully with sequence ${this.sequenceService.formatSequence(sequence)}.` };
    });
  }


  async remove(store: Store, id: string) {
    return await this.em.transactional(async (em) => {
      const purchase = await em.findOne(Purchase, { id, store }, { populate: ["items"] });
      if (!purchase)
        throw new NotFoundException(`Purchase with id ${id} not found`);

      await em.removeAndFlush(purchase);
      return { message: `Purchase with id ${id} deleted successfully.` };
    });
  }


  async update(store: Store, id: string, dto: UpdatePurchaseDto) {
    const purchase = await this.em.findOne(Purchase, { id, store });
    if (!purchase)
      throw new NotFoundException(`Purchase with id ${id} not found`);

    if (purchase.status === PurchaseStatus.CANCELLED)
      throw new BadRequestException(`Cannot update a cancelled purchase.`);

    if (purchase.status === PurchaseStatus.DONE)
      throw new BadRequestException(`Cannot update a completed purchase.`);

    if (dto.status === PurchaseStatus.CANCELLED) {
      this.getAllowedTransitions(purchase.status as PurchaseStatus, dto.status as PurchaseStatus);
      purchase.status = dto.status;
      await this.em.flush();
      return { message: `Purchase with id ${id} cancelled successfully.` };
    }

    await this.em.flush();
    return { message: `Purchase with id ${id} updated successfully.` };
  }


  private getAllowedTransitions(currentStatus: PurchaseStatus, newStatus: PurchaseStatus): void {
    const transitions = new Map([
      [PurchaseStatus.DRAFT, [PurchaseStatus.PENDING, PurchaseStatus.DONE, PurchaseStatus.CANCELLED]],
      [PurchaseStatus.PENDING, [PurchaseStatus.DONE, PurchaseStatus.CANCELLED]],
      [PurchaseStatus.DONE, []],
      [PurchaseStatus.CANCELLED, []],
    ]);

    const allowedTransitions = transitions.get(currentStatus) ?? [];
    if (!allowedTransitions.includes(newStatus))
      throw new BadRequestException(`Cannot transition from '${currentStatus}' to '${newStatus}'.`);
  }
}