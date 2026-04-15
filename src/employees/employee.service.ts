import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Employee } from '../database/entites/mployee.entity';
import { Store } from '../database/entites/store.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class EmployeeService {
  constructor(
    private readonly em: EntityManager,
  ) {}

  
  async findAll() {
    return this.em.findAll(Employee, { exclude: ['password'] });
  }


  async findOne(id: string) {
    const employee = await this.em.findOne(Employee, { id }, { exclude: ['password'] });
    if (!employee)
      throw new NotFoundException(`Employee with id ${id} not found`);
    return employee;
  }


  async create(dto: CreateEmployeeDto) {
    const store = await this.em.findOne(Store, { name: dto.storeName });
    if (!store)
      throw new NotFoundException(`Store with name ${dto.storeName} not found`);

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const employee = this.em.create(Employee, {
      name: dto.name,
      email: dto.email,
      password: hashedPassword,
      phone: dto.phone,
      store
    });

    await this.em.persistAndFlush(employee);

    return { id: employee.id, name: employee.name, email: employee.email, phone: employee.phone };
  }


  async update(id: string, dto: UpdateEmployeeDto) {
    const employee = await this.em.findOne(Employee, { id });
    if (!employee)
      throw new NotFoundException(`Employee with id ${id} not found`);

    if (dto.password) {
      dto.password = await bcrypt.hash(dto.password, 10);
    }

    this.em.assign(employee, dto);
    await this.em.flush();

    return { id: employee.id, name: employee.name, email: employee.email, phone: employee.phone };
  }


  async remove(id: string) {
    const employee = await this.em.findOne(Employee, { id });
    if (!employee)
      throw new NotFoundException(`Employee with id ${id} not found`);

    await this.em.removeAndFlush(employee);

    return { message: `Employee ${id} deleted successfully` };
  }


  async login(email: string, password: string) {
    const employee = await this.em.findOne(Employee, { email });
    if (!employee)
      throw new NotFoundException('Invalid email or password');

    const isMatch = await bcrypt.compare(password, employee.password);
    if (!isMatch)
      throw new NotFoundException('Invalid email or password');

    return { message: 'Login successful', employee_id: employee.id };
  }
}