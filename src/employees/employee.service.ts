import { EntityManager } from '@mikro-orm/postgresql';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AttachmentService } from '../attachments/attachment.service';
import { Employee } from '../database/entites/employee.entity';
import { SecurityAction } from '../database/entites/securityAction.entity';
import { Store } from '../database/entites/store.entity';
import { QueueService } from '../queue/queue.service';
import { AttachmentEntityType } from '../shared/utils/attachment-entity-type.enum';
import { generateOTP } from '../shared/utils/auth.utils';
import { Role } from '../shared/utils/role.enum';
import { stripUndefined } from '../shared/utils/strip-undefined.util';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeeQueryDto } from './dto/employee-query.dto';
import { VerifyDto } from './dto/verify.dto';

export interface EmployeeDetail {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: string | null;
  imageUrl: string | null;
  dob: Date | null;
  gender: string | null;
  storeName: string | null;
  createdAt: Date | null;
}

type EmployeeDetailProjection = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  role?: string | null;
  imageUrl?: string | null;
  imageUrlSigned?: string | null;
  dob?: Date | null;
  gender?: string | null;
  createdAt?: Date | null;
  store?: {
    name?: string | null;
  } | null;
};

@Injectable()
export class EmployeeService {
  constructor(
    private readonly em: EntityManager,
    private readonly queueService: QueueService,
    private readonly attachmentService: AttachmentService,
  ) { }

  async findAll(store: Store, query: EmployeeQueryDto) {
    const where: Record<string, any> = { store };

    if (query.role) {
      where.role = query.role;
    }

    if (query.search) {
      const search = `%${query.search}%`;
      where.$or = [
        { firstName: { $ilike: search } },
        { lastName: { $ilike: search } },
        { email: { $ilike: search } },
      ];
    }

    const employees = await this.em.findAll(Employee, {
      where,
      fields: [
        'id',
        'email',
        'phone',
        'role',
        'firstName',
        'lastName',
        'imageUrl',
        'dob',
        'gender',
        'verifiedAt',
      ],
    });

    return employees.map((employee) =>
      this.toEmployeeDetail(employee as EmployeeDetailProjection),
    );
  }

  async findOne(store: Store, id: string): Promise<EmployeeDetail> {
    const employee = await this.em.findOne(
      Employee,
      { id, store },
      { populate: ['store'] },
    );
    if (!employee) throw new NotFoundException('Employee not found');

    return this.toEmployeeDetail(employee);
  }

  private toEmployeeDetail(
    employee: EmployeeDetailProjection,
  ): EmployeeDetail {
    return {
      id: employee.id,
      email: employee.email,
      firstName: employee.firstName ?? null,
      lastName: employee.lastName ?? null,
      phone: employee.phone ?? null,
      role: employee.role ?? null,
      imageUrl: employee.imageUrlSigned ?? null,
      dob: employee.dob ?? null,
      gender: employee.gender ?? null,
      storeName: employee.store?.name ?? null,
      createdAt: employee.createdAt ?? null,
    };
  }

  async employeeRegister(
    dto: CreateEmployeeDto,
    store: Store,
  ) {
    const existing = await this.em.findOne(Employee, { email: dto.email });

    if (existing) {
      if (existing.verifiedAt)
        throw new BadRequestException('Email already in use');

      await this.em.nativeDelete(SecurityAction, { employee: existing });
      await this.em.remove(existing);
      await this.em.flush();
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const employee = this.em.create(Employee, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      role: dto.role ?? Role.Cashier,
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
    this.em.persist(employee);
    this.em.persist(securityAction);

    await this.em.flush();

    return {
      message: 'Employee registered successfully',
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
    };
  }

  async remove(id: string) {
    const employee = await this.em.findOne(Employee, { id });
    if (!employee)
      throw new NotFoundException(`Employee with id ${id} not found`);

    employee.deletedAt = new Date();

    await this.em.flush();

    return { message: `Employee ${id} deleted successfully` };
  }


  async updateEmployeeInfo(
    id: string,
    dto: UpdateEmployeeDto,
  ) {
    if (!dto)
      return { message: 'No changes to update' };

    const employee = await this.em.findOne(
      Employee,
      { id },
      { populate: ['store'] },
    );
    if (!employee)
      throw new NotFoundException(`Employee with id ${id} not found`);

    if (dto.role)
      throw new BadRequestException('Admin role cannot be updated');


    if (dto.attachmentId) {
      const attachment = await this.attachmentService.claimAttachment(
        dto.attachmentId,
        employee.id,
        AttachmentEntityType.EMPLOYEE,
      );
      employee.imageUrl = attachment.fileUrl;
    }

    if (dto.password) {
      if (!dto.oldPassword)
        throw new BadRequestException(
          'Old password is required to change password',
        );

      const isMatch = await bcrypt.compare(dto.oldPassword, employee.password);
      if (!isMatch)
        throw new BadRequestException('Old password is incorrect');

      dto.password = await bcrypt.hash(dto.password, 10);
    }

    if (dto.storeName) {
      if (dto.storeName === employee.store.name)
        throw new BadRequestException('Store name is the same as the current one');

      const existingStore = await this.em.findOne(Store, {
        name: dto.storeName,
      });
      if (existingStore)
        throw new BadRequestException(
          `Store with name ${dto.storeName} already exists`,
        );

      employee.store.name = dto.storeName;
    }

    let emailChange = false;
    if (dto.email) {
      if (dto.email === employee.email)
        throw new BadRequestException(
          'New email is the same as the current one',
        );

      const existing = await this.em.findOne(Employee, { email: dto.email });
      if (existing) throw new BadRequestException('Email already in use');

      const code = generateOTP();
      const securityAction = this.em.create(SecurityAction, {
        employee,
        actionType: 'email-update',
        secret: code,
        metadata: { email: dto.email },
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        createdAt: new Date(),
      });

      await this.em.persistAndFlush(securityAction);
      await this.queueService.sendVerificationEmail(dto.email, code);
      emailChange = true;
    }

    this.em.assign(
      employee,
      stripUndefined({
        password: dto.password,
        phone: dto.phone,
        imageUrl: dto.imageUrl,
        firstName: dto.firstName,
        lastName: dto.lastName,
        dob: dto.dob,
        gender: dto.gender,
      }),
    );

    await this.em.flush();

    if (emailChange)
      return { message: 'Profile updated. Please verify your new email address.' };

    return { message: 'Profile updated successfully' };
  }


  async verifyUpdateEmail(
    store: Store,
    dto: VerifyDto,
  ) {
    const securityAction = await this.em.findOne(
      SecurityAction,
      {
        employee: { store },
        actionType: 'email-update',
        secret: dto.code,
      },
      { populate: ['employee'] },
    );
    if (!securityAction)
      throw new BadRequestException('Invalid verification code');

    if (
      securityAction.expiresAt &&
      securityAction.expiresAt < new Date()
    )
      throw new BadRequestException('Verification code has expired');

    const employee = securityAction.employee;
    const newEmail = securityAction.metadata?.email;
    if (!newEmail)
      throw new BadRequestException('New email address was not found');

    if (dto.email !== newEmail)
      throw new BadRequestException('Invalid email or verification code');

    const existing = await this.em.findOne(Employee, { email: newEmail });
    if (existing && existing.id !== employee.id)
      throw new BadRequestException('Email already in use');

    employee.email = newEmail;
    employee.verifiedAt = new Date();

    this.em.remove(securityAction);
    await this.em.flush();

    return {
      message: 'Employee email updated successfully.',
      email: employee.email,
    };
  }


  async deleteEmployeeImage(id: string) {
    const employee = await this.em.findOne(Employee, { id });
    if (!employee)
      throw new NotFoundException(`Employee with id ${id} not found`);

    if (!employee.imageUrl)
      throw new NotFoundException(`Employee has no profile picture`);

    await this.attachmentService.deleteAttachmentByFileUrl(
      employee.imageUrl,
      AttachmentEntityType.EMPLOYEE,
    );

    employee.imageUrl = null;
    employee.imageUrlSigned = null;
    await this.em.flush();

    return { message: 'Employee profile picture deleted successfully' };
  }
}
