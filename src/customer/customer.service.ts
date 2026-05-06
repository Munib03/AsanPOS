import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Customer } from '../database/entites/customer.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { stripUndefined } from '../shared/utils/strip-undefined.util';
import { BaseRepository } from '../shared/repositories/base.repository';

@Injectable()
export class CustomerService {
  constructor(
    private readonly em: EntityManager,
    private readonly customerRepository: BaseRepository<Customer>,
  ) {}

  
  async findAll() {
    return this.em.findAll(Customer, {});
  }


  async findOne(id: string) {
    return this.customerRepository.findOneOrFail(
      { id },
      { notFoundMessage: `Customer with id ${id} not found` },
    );
  }


  async create(dto: CreateCustomerDto) {
    const customer = this.em.create(Customer, stripUndefined({
      name: dto.name,
      address: dto.address,
      phone: dto.phone
    }));

    await this.em.persistAndFlush(customer);

    return customer;
  }


  async update(id: string, dto: UpdateCustomerDto) {
    const customer = await this.customerRepository.findOneOrFail(
      { id },
      { notFoundMessage: `Customer with id ${id} not found` },
    );

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