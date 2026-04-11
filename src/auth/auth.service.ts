import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import * as bcrypt from 'bcrypt';
import * as nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';
import { Employee } from '../database/entites/mployee.entity';
import { TwoFactorAuth } from '../database/entites/twoFactorAuth.entity';
import { Store } from '../database/entites/store.entity';


@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: EntityRepository<Employee>,
    @InjectRepository(TwoFactorAuth)
    private readonly twoFactorRepo: EntityRepository<TwoFactorAuth>,
    @InjectRepository(Store)
    private readonly storeRepo: EntityRepository<Store>,
  ) {}

  private generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async sendEmail(to: string, code: string) {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to,
      subject: 'Your OTP Code',
      text: `Your OTP code is: ${code}. It expires in 5 minutes.`,
    });
  }

  async register(dto: { name: string; email: string; phone: string; password: string; storeId: string }) {
    const existing = await this.employeeRepo.findOne({ email: dto.email });
    if (existing) throw new BadRequestException('Email already in use');

    const store = await this.storeRepo.findOne({ id: dto.storeId });
    if (!store) throw new NotFoundException(`Store with id ${dto.storeId} not found`);

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const employee = this.employeeRepo.create({
      id: uuidv4(),
      name: dto.name,
      email: dto.email,
      password: hashedPassword,
      phone: dto.phone,
      store,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await this.employeeRepo.getEntityManager().persistAndFlush(employee);

    const code = this.generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const otp = this.twoFactorRepo.create({
      employee,
      code,
      expiresAt,
      createdAt: new Date(),
    });

    await this.twoFactorRepo.getEntityManager().persistAndFlush(otp);
    await this.sendEmail(dto.email, code);

    return { message: 'OTP sent to your email. Please verify to complete registration.' };
  }

  async verifyRegister(email: string, code: string) {
    const employee = await this.employeeRepo.findOne({ email });
    if (!employee) throw new NotFoundException('Employee not found');

    const otp = await this.twoFactorRepo.findOne({
      employee,
      code,
      usedAt: null,
    });

    if (!otp) throw new BadRequestException('Invalid OTP code');

    const now = new Date();
    if (otp.expiresAt < now) throw new BadRequestException('OTP has expired');

    otp.usedAt = new Date();
    employee.verifiedAt = new Date();
    await this.twoFactorRepo.getEntityManager().flush();

    return { message: 'Registration successful', employee_id: employee.id };
  }

  async login(email: string, password: string) {
    const employee = await this.employeeRepo.findOne({ email });
    if (!employee) throw new NotFoundException('Invalid email or password');

    if (!employee.verifiedAt) throw new BadRequestException('Please verify your email first');

    const isMatch = await bcrypt.compare(password, employee.password);
    if (!isMatch) throw new NotFoundException('Invalid email or password');

    const code = this.generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const otp = this.twoFactorRepo.create({
      employee,
      code,
      expiresAt,
      createdAt: new Date(),
    });

    await this.twoFactorRepo.getEntityManager().persistAndFlush(otp);
    await this.sendEmail(employee.email, code);

    return { message: 'OTP sent to your email' };
  }

  async verifyLogin(email: string, code: string) {
    const employee = await this.employeeRepo.findOne({ email });
    if (!employee) throw new NotFoundException('Employee not found');

    const otp = await this.twoFactorRepo.findOne({
      employee,
      code,
      usedAt: null,
    });

    if (!otp) throw new BadRequestException('Invalid OTP code');

    const now = new Date();
    if (otp.expiresAt < now) throw new BadRequestException('OTP has expired');

    otp.usedAt = new Date();
    await this.twoFactorRepo.getEntityManager().flush();

    return { message: 'Login successful', employee_id: employee.id };
  }
}
