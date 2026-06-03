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
import { serialize } from '@mikro-orm/postgresql';
import { AttachmentService } from '../attachments/attachment.service';
import { AttachmentEntityType } from '../shared/utils/attachment-entity-type.enum';
import { MinioService } from '../shared/services/minio.service';
import { Attachment } from '../database/entites/attachment.entity';


@Injectable()
export class EmployeeService {
  constructor(
    private readonly em: EntityManager,
    private readonly queueService: QueueService,
    private readonly attachmentService: AttachmentService,
    private readonly minioService: MinioService,
  ) { }


  async findAll() {
    const employees = await this.em.findAll(Employee, {
      fields: ['id', 'email', 'name', 'phone', 'role', 'firstName', 'lastName', 'imageUrl', 'dob', 'gender', 'verifiedAt'],
    });

    return serialize(employees, {
      forceObject: true,
    });
  }


  async findOne(id: string) {
    const employee = await this.em.findOne(Employee, { id }, { populate: ['store'] });
    if (!employee)
      throw new NotFoundException('Employee not found');

    return {
      id: employee.id,
      email: employee.email,
      name: employee.name,
      firstName: employee.firstName ?? null,
      lastName: employee.lastName ?? null,
      phone: employee.phone ?? null,
      role: employee.role ?? null,
      imageUrl: employee.imageUrlSigned,
      dob: employee.dob ?? null,
      gender: employee.gender ?? null,
      storeName: employee.store?.name ?? null,
      createdAt: employee.createdAt ?? null,
    };
  }


  async employeeRegister(dto: CreateEmployeeDto, store: Store) {
    const existing = await this.em.findOne(Employee, {
      email: dto.email,
    });

    if (existing) {
      if (existing.verifiedAt)
        throw new BadRequestException('Email already in use');

      await this.em.nativeDelete(SecurityAction, {
        employee: existing,
      });

      await this.em.remove(existing);
      await this.em.flush();
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const employee = this.em.create(Employee, {
      name: dto.name,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      role: dto.role ?? 'Cashier',
      gender: dto.gender,
      dob: dto.dob,
      imageUrl: dto.imageUrl,
      password: hashedPassword,
      store,
    });

    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const securityAction = this.em.create(SecurityAction, {
      employee,
      actionType: 'sign-up',
      secret: code,
      expiresAt,
      createdAt: new Date(),
    });

    employee.verifiedAt = new Date();
    await this.em.persistAndFlush(employee);
    await this.em.persistAndFlush(securityAction);

    await this.queueService.sendVerificationEmail(dto.email, code);

    return {
      email: employee.email,
      password: dto.password
    };
  }


  async remove(id: string) {
    const employee = await this.em.findOne(Employee, { id });
    if (!employee)
      throw new NotFoundException(`Employee with id ${id} not found`);

    await this.em.removeAndFlush(employee);

    return { message: `Employee ${id} deleted successfully` };
  }


  async updateEmployeeInfo(id: string, dto: UpdateEmployeeDto) {
    if (!dto)
      return { message: 'No changes to update' };

    const employee = await this.em.findOne(
      Employee,
      { id },
      { populate: ['store'] },
    );

    if (!employee)
      throw new NotFoundException(`Employee with id ${id} not found`);

    if (dto.attachmentId) {
      const attachment = await this.attachmentService.claimAttachment(
        dto.attachmentId,
        employee.id,
        AttachmentEntityType.EMPLOYEE,
      );

      employee.imageUrl = attachment.imageUrl;
    }

    if (dto.password) {
      if (!dto.oldPassword)
        throw new BadRequestException('Old password is required to change password');

      const isMatch = await bcrypt.compare(dto.oldPassword, employee.password);
      if (!isMatch)
        throw new BadRequestException('Old password is incorrect');

      dto.password = await bcrypt.hash(dto.password, 10);
    }

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
        metadata: { email: dto.email },
        expiresAt,
        createdAt: new Date(),
      });

      await this.em.persistAndFlush(securityAction);
      await this.queueService.sendVerificationEmail(dto.email, code);
    }

    const { storeName, email, oldPassword, attachmentId, ...rest } = dto;
    this.em.assign(employee, stripUndefined(rest));
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
    };
  }



  async deleteEmployeeImage(id: string) {
    const employee = await this.em.findOne(Employee, { id });
    if (!employee)
      throw new NotFoundException(`Employee with id ${id} not found`);

    if (!employee.imageUrl)
      throw new NotFoundException(`Employee has no profile picture`);

    await this.attachmentService.deleteAttachmentByUrl(
      employee.imageUrl,
      AttachmentEntityType.EMPLOYEE,
    );

    employee.imageUrl = null;
    employee.imageUrlSigned = null;
    await this.em.flush();

    return { message: 'Employee profile picture deleted successfully' };
  }
}
