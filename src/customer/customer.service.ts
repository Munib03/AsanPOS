import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Customer } from '../database/entites/customer.entity';
import { Employee } from '../database/entites/employee.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { stripUndefined } from '../shared/utils/strip-undefined.util';
import { BaseRepository } from '../shared/repositories/base.repository';
import { Store } from '../database/entites/store.entity';
import { AuditService } from '../audit/audit.service';
import { AuditEntityType } from '../shared/utils/audit-entity-type.enum';
import { PaginateQuery } from '../shared/types/paginate-query.types';
import { Account } from '../database/entites/account.entity';
import { Purchase } from '../database/entites/purchase.entity';
import { PurchasedItem } from '../database/entites/purchased_item.entity';
import { SaleItem } from '../database/entites/sale-item.entity';
import { Sale } from '../database/entites/sale.entity';
import { JournalEntryItem } from '../database/entites/journal-entry-item.entity';
import { StockInItem } from '../database/entites/stock-in-item.entity';
import { StockIn } from '../database/entites/stock-in.entity';
import { StockOutItem } from '../database/entites/stock-out-item.entity';
import { StockOut } from '../database/entites/stock-out.entity';

@Injectable()
export class CustomerService {
  constructor(
    private readonly em: EntityManager,
    private readonly customerRepository: BaseRepository<Customer>,
    private readonly auditService: AuditService,
  ) { }

  async findAll(store: Store, query: PaginateQuery) {
    const [customers, meta] = await this.customerRepository.findAndPaginate(
      { store },
      { fields: ['id', 'name', 'phone', 'address'] },
      { searchable: ['name', 'phone', 'address'] },
      query,
    );

    const sorted = [
      ...customers.filter(c => c.name === 'Walk-in Customer'),
      ...customers.filter(c => c.name !== 'Walk-in Customer'),
    ];

    return { data: sorted, meta };
  }

  async findOne(id: string) {
    return this.customerRepository.findOneOrFail(
      { id },
      { notFoundMessage: `Customer with id ${id} not found` },
    );
  }

  async create(store: Store, employeeId: string, dto: CreateCustomerDto) {
    return await this.em.transactional(async (em) => {
      const existing = await em.findOne(Customer, { phone: dto.phone, store });
      if (existing)
        throw new BadRequestException(`Customer with phone ${dto.phone} already exists`);

      const payable = em.create(Account, {
        name: `${dto.name} - Accounts Payable`,
        type: 'liability',
      });

      const receivable = em.create(Account, {
        name: `${dto.name} - Accounts Receivable`,
        type: 'asset',
      });

      em.persist(payable);
      em.persist(receivable);

      const customer = em.create(Customer, {
        name: dto.name,
        phone: dto.phone,
        address: dto.address,
        store,
        payable,
        receivable,
      });

      await em.persistAndFlush(customer);

      const employee = await em.findOne(Employee, { id: employeeId });
      if (!employee)
        throw new NotFoundException('Employee not found');

      this.auditService.log(
        em,
        employee,
        AuditEntityType.Customer,
        customer.id,
        null,
        { name: customer.name, phone: customer.phone, address: customer.address },
      );

      await em.flush();

      return { message: 'Customer created successfully.' };
    });
  }

  async update(id: string, employeeId: string, dto: UpdateCustomerDto) {
    const customer = await this.customerRepository.findOneOrFail(
      { id },
      { notFoundMessage: `Customer with id ${id} not found` },
    );

    if (dto.phone !== undefined) {
      const phone = await this.em.findOne(Customer, {
        phone: dto.phone,
        store: customer.store,
      });
      if (phone && phone.id !== id)
        throw new BadRequestException(`Customer with phone ${dto.phone} already exists`);
    }

    const before: Record<string, any> = {};
    const after: Record<string, any> = {};

    if (dto.name !== undefined && dto.name !== customer.name) {
      before.name = customer.name;
      after.name = dto.name;
    }
    if (dto.phone !== undefined && dto.phone !== customer.phone) {
      before.phone = customer.phone;
      after.phone = dto.phone;
    }
    if (dto.address !== undefined && dto.address !== customer.address) {
      before.address = customer.address;
      after.address = dto.address;
    }

    this.em.assign(customer, stripUndefined(dto));

    const employee = await this.em.findOne(Employee, { id: employeeId });
    if (!employee)
      throw new NotFoundException('Employee not found');

    const hasChanges = Object.keys(before).length > 0;
    if (hasChanges) {
      this.auditService.log(
        this.em,
        employee,
        AuditEntityType.Customer,
        customer.id,
        before,
        after,
      );
    }

    await this.em.flush();

    return { message: `Customer with id ${id} updated successfully.` };
  }


  async remove(id: string, employeeId: string) {
    return await this.em.transactional(async (em) => {
      const customer = await em.findOne(Customer, { id });

      if (!customer)
        throw new NotFoundException(`Customer with id ${id} not found`);

      if (customer.name === 'Walk-in Customer')
        throw new BadRequestException(`Walk-in Customer cannot be deleted.`);

      const employee = await em.findOne(Employee, { id: employeeId });
      if (!employee)
        throw new NotFoundException('Employee not found');

      this.auditService.log(
        em,
        employee,
        AuditEntityType.Customer,
        customer.id,
        { name: customer.name, phone: customer.phone, address: customer.address },
        null,
      );

      const purchases = await em.find(Purchase, { customer: { id } });
      const purchaseIds = purchases.map(p => p.id);

      if (purchaseIds.length > 0) {
        await em.nativeDelete(JournalEntryItem, { purchase: { $in: purchaseIds } });
        await em.nativeDelete(StockInItem, { stockIn: { purchase: { $in: purchaseIds } } });
        await em.nativeDelete(StockIn, { purchase: { $in: purchaseIds } });
        await em.nativeDelete(PurchasedItem, { purchase: { $in: purchaseIds } });
        await em.nativeDelete(Purchase, { id: { $in: purchaseIds } });
      }

      const sales = await em.find(Sale, { customer: { id } });
      const saleIds = sales.map(s => s.id);

      if (saleIds.length > 0) {
        const saleItems = await em.find(SaleItem, { sale: { $in: saleIds } });
        const saleItemIds = saleItems.map(si => si.id);

        await em.nativeDelete(JournalEntryItem, { sale: { $in: saleIds } });
        if (saleItemIds.length > 0)
          await em.nativeDelete(StockOutItem, { saleItem: { $in: saleItemIds } });

        await em.nativeDelete(StockOut, { sale: { $in: saleIds } });
        await em.nativeDelete(SaleItem, { sale: { $in: saleIds } });
        await em.nativeDelete(Sale, { id: { $in: saleIds } });
      }

      await em.flush();
      await em.nativeDelete(Customer, { id });

      return { message: `Customer with id ${id} deleted successfully.` };
    });
  }
}