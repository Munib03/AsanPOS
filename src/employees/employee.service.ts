import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import { Employee } from '../entites/Employee';
import { Store } from '../entites/Store';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class EmployeeService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: EntityRepository<Employee>,
    @InjectRepository(Store)
    private readonly storeRepo: EntityRepository<Store>,
  ) {}

  async findAll() {
    return this.employeeRepo.findAll({ exclude: ['password'] });
  }

  async findOne(id: string) {
    const employee = await this.employeeRepo.findOne({ id }, { exclude: ['password'] });
    if (!employee) 
      throw new NotFoundException(`Employee with id ${id} not found`);
    
    return employee;
  }

  async create(dto: CreateEmployeeDto) {
    const store = await this.storeRepo.findOne({ id: dto.storeId });
    if (!store) 
      throw new NotFoundException(`Store with id ${dto.storeId} not found`);
    
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const employee = this.employeeRepo.create({
      name: dto.name,
      email: dto.email,
      password: hashedPassword,
      phone: dto.phone,
      store,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await this.employeeRepo.getEntityManager().persistAndFlush(employee);
    
    return { id: employee.id, name: employee.name, email: employee.email, phone: employee.phone };
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    const employee = await this.employeeRepo.findOne({ id });
    if (!employee) 
      throw new NotFoundException(`Employee with id ${id} not found`);
    
    if (dto.password) {
      dto.password = await bcrypt.hash(dto.password, 10);
    }
    
    this.employeeRepo.assign(employee, dto);
    await this.employeeRepo.getEntityManager().flush();
    
    return { id: employee.id, name: employee.name, email: employee.email, phone: employee.phone };
  }

  async remove(id: string) {
    const employee = await this.employeeRepo.findOne({ id });
    if (!employee) 
      throw new NotFoundException(`Employee with id ${id} not found`);
    
    await this.employeeRepo.getEntityManager().removeAndFlush(employee);
    
    return { message: `Employee ${id} deleted successfully` };
  }

  async login(email: string, password: string) {
    const employee = await this.employeeRepo.findOne({ email });
    if (!employee) 
      throw new NotFoundException('Invalid email or password');
    
    const isMatch = await bcrypt.compare(password, employee.password);
    if (!isMatch) 
      throw new NotFoundException('Invalid email or password');
    
    return { message: 'Login successful', employee_id: employee.id };
  }
}