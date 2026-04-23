import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Employee } from '../database/entites/employee.entity';
import { Store } from '../database/entites/store.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import * as bcrypt from 'bcrypt';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { SecurityAction } from '../database/entites/securityAction.entity';
import { generateOTP } from '../shared/utils/auth.utils';
import { VerifyDto } from './dto/verify.dto';
import { QueueService } from '../queue/queue.service';
import { stripUndefined } from '../shared/utils/strip-undefined.util';


@Injectable()
export class EmployeeService {

  constructor(
    private readonly em: EntityManager,
    private readonly queueService: QueueService,
  ) {}


  async findAll() {
    return this.em.findAll(Employee, { exclude: ['password'] });
  }


  async findOne(id: string) {
    const employee = await this.em.findOne(
      Employee,
      { id },
      { exclude: ['password'] },
    );
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
      store,
    });

    await this.em.persistAndFlush(employee);

    return {
      id: employee.id,
      name: employee.name,
      email: employee.email,
      phone: employee.phone,
    };
  }


  async remove(id: string) {
    const employee = await this.em.findOne(Employee, { id });
    if (!employee)
      throw new NotFoundException(`Employee with id ${id} not found`);

    await this.em.removeAndFlush(employee);

    return { message: `Employee ${id} deleted successfully` };
  }


  async updateEmployeeInfo(id: string, dto: UpdateEmployeeDto, imageUrl?: string | null) {
    const employee = await this.em.findOne(
      Employee,
      { id },
      { populate: ['store'] },
    );
    if (!employee)
      throw new NotFoundException(`Employee with id ${id} not found`);

    if (dto.password)
      dto.password = await bcrypt.hash(dto.password, 10);

    if (dto.storeName) {
      if (dto.storeName === employee.store.name)
        throw new BadRequestException('Store name is the same as the current one');

      const existingStore = await this.em.findOne(Store, { name: dto.storeName });
      if (existingStore)
        throw new BadRequestException(`Store with name ${dto.storeName} already exists`);

      employee.store.name = dto.storeName;
    }

    let emailChange = false;
    if (dto.email) {
      if (dto.email === employee.email)
        throw new BadRequestException('New email is the same as the current one');

      const existing = await this.em.findOne(Employee, { email: dto.email });
      if (existing)
        throw new BadRequestException('Email already in use');

      emailChange = true;

      const code = generateOTP();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      const securityAction = this.em.create(SecurityAction, {
        employee,
        actionType: 'email-update',
        secret: code,
        metadata: { email: dto.email }, // store new email in metadata as JSON
        expiresAt,
        createdAt: new Date(),
      });

      await this.em.persistAndFlush(securityAction);
      await this.queueService.sendVerificationEmail(dto.email, code);
    }

    const { storeName, email, ...rest } = dto;
    this.em.assign(employee, stripUndefined({ ...rest, imageUrl }));
    await this.em.flush();

    if (emailChange)
      return {
        message: 'Profile updated. Please verify your new email address.',
        id: employee.id,
        name: employee.name,
        email: employee.email,
        phone: employee.phone,
      };

    return {
      message: 'Profile updated successfully',
      id: employee.id,
      name: employee.name,
      email: employee.email,
      phone: employee.phone,
      imageUrl: employee.imageUrl,
    };
  }


  async verifyUpdatedEmail(dto: VerifyDto) {
    const securityAction = await this.em.findOne(SecurityAction, {
      secret: dto.code,
      actionType: 'email-update',
    }, { populate: ['employee'] });

    if (!securityAction)
      throw new BadRequestException('Invalid OTP code');

    const employee = securityAction.employee;

    if (!employee)
      throw new NotFoundException('Employee not found');

    const now = new Date();
    if (securityAction.expiresAt && securityAction.expiresAt < now)
      throw new BadRequestException('OTP has expired');

    if (securityAction.metadata?.email) {
      employee.email = securityAction.metadata.email;
    } else {
      throw new BadRequestException('No email found in metadata');
    }

    employee.verifiedAt = new Date();

    await this.em.removeAndFlush(securityAction);
    await this.em.flush();

    return {
      message: 'Email updated successfully',
      employee_id: employee.id,
    };
  }
}
