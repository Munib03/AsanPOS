import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository, EntityManager } from '@mikro-orm/postgresql';
import { Employee } from '../entites/Employee';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: EntityRepository<Employee>,
    private readonly em: EntityManager,
  ) { }

  async register(data: {
    email: string;
    name: string;
    phone: string;
    password: string;
  }) {
    const existing = await this.employeeRepo.findOne({ email: data.email });
    if (existing) {
      throw new BadRequestException('Email already in use');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const employee = this.em.create(Employee, {
      ...data,
      password: hashedPassword,
      store: null as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await this.em.persistAndFlush(employee);
    return { message: 'User registered successfully' };
  }
}