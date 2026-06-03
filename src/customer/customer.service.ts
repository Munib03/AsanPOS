import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Customer } from '../database/entites/customer.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { stripUndefined } from '../shared/utils/strip-undefined.util';
import { BaseRepository } from '../shared/repositories/base.repository';
import { Store } from '../database/entites/store.entity';
import { PaginateQuery } from '../shared/types/paginate-query.types';
import { Account } from '../database/entites/account.entity';

@Injectable()
export class CustomerService {
  constructor(
    private readonly em: EntityManager,
    private readonly customerRepository: BaseRepository<Customer>,
  ) { }


  async findAll(store: Store, query: PaginateQuery) {
    const [customers, meta] = await this.customerRepository.findAndPaginate(
      { store },
      {
        fields: ['id', 'name', 'phone', 'address'],
      },
      {
        searchable: ['name', 'phone', 'address'],
      },
      query,
    );

    const sorted = [
      ...customers.filter(c => c.name === 'Walk-in Customer'),
      ...customers.filter(c => c.name !== '-in Customer'),
    ];

    return { data: sorted, meta };
  }


  async findOne(id: string) {
    return this.customerRepository.findOneOrFail(
      { id },
      { notFoundMessage: `Customer with id ${id} not found` },
    );
  }


  async create(store: Store, dto: CreateCustomerDto) {
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

      return { message: 'Customer created successfully.' };
    });
  }

  async update(id: string, dto: UpdateCustomerDto) {
    const customer = await this.customerRepository.findOneOrFail(
      { id },
      { notFoundMessage: `Customer with id ${id} not found` },
    );

    const phone = await this.em.findOne(Customer, { phone: dto.phone, store: customer.store });
    if (phone && phone.id !== id)
      throw new BadRequestException(`Customer with phone ${dto.phone} already exists`);

    this.em.assign(customer, stripUndefined(dto));
    await this.em.flush();

    return { message: `Customer with id ${id} updated successfully.` };
  }


  async remove(id: string) {
    const customer = await this.customerRepository.findOneOrFail(
      { id },
      { notFoundMessage: `Customer with id ${id} not found` },
    );

    await this.em.removeAndFlush(customer);

    return { message: `Customer with id ${id} deleted successfully.` };
  }
}