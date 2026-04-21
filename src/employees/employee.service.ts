import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Employee } from '../database/entites/Employee.entity';
import { Store } from '../database/entites/store.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import * as bcrypt from 'bcrypt';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { SecurityAction } from '../database/entites/securityAction.entity';
import { generateOTP, sendEmail } from '../shared/utils/auth.utils';
import { VerifyDto } from './dto/verify.dto';


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


  async uploadImage(id: string, imageUrl: string) {
    const employee = await this.em.findOne(Employee, { id });
    if (!employee)
      throw new NotFoundException(`Employee with id ${id} not found`);

    employee.imageUrl = imageUrl;
    await this.em.flush();

    return { message: 'Image updated successfully', imageUrl: employee.imageUrl };
  }

  async verifyUpdatedEmail(dto: VerifyDto) {
    const employee = await this.em.findOne(Employee, { email: dto.email });
    if (!employee)
      throw new NotFoundException('Employee not found');
  
    const securityAction = await this.em.findOne(SecurityAction, {
      employee,
      secret: dto.code,
      actionType: 'email-update',
    });
  
    if (!securityAction)
      throw new BadRequestException('Invalid OTP code');
  
    const now = new Date();
    if (securityAction.expiresAt && securityAction.expiresAt < now)
      throw new BadRequestException('OTP has expired');
  
    employee.verifiedAt = new Date();
    await this.em.removeAndFlush(securityAction);
    await this.em.flush();
  
    return { message: 'New Email verified successfullyu', employee_id: employee.id };
  }
  

  async updateEmployeeInfo(id: string, dto: UpdateEmployeeDto, imageUrl?: string) {
    const employee = await this.em.findOne(Employee, { id }, { populate: ['store'] });
    if (!employee)
      throw new NotFoundException(`Employee with id ${id} not found`);

    if (dto.password)
      dto.password = await bcrypt.hash(dto.password, 10);

    if (dto.storeName)
      employee.store.name = dto.storeName;

    if (imageUrl)
      employee.imageUrl = imageUrl;

    let emailChange = false;
    if (dto.email && dto.email !== employee.email) {
      const existing = await this.em.findOne(Employee, { email: dto.email });
      if (existing)
        throw new BadRequestException('Email already in use');
        

      emailChange = true;
      employee.verifiedAt = undefined;

      const code = generateOTP();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      const securityAction = this.em.create(SecurityAction, {
        employee,
        actionType: 'email-update',
        secret: code,
        expiresAt,
        createdAt: new Date(),
      });

      await this.em.persistAndFlush(securityAction);
      await sendEmail(dto.email, code);
    }

    const { storeName, ...rest } = dto;
    this.em.assign(employee, rest);
    await this.em.flush();

    if (emailChange)
      return { message: 'Profile updated. Please verify your new email address.', id: employee.id, name: employee.name, email: employee.email, phone: employee.phone };

    return { message: 'Profile updated successfully', id: employee.id, name: employee.name, email: employee.email, phone: employee.phone, imageUrl: employee.imageUrl };
  }
}