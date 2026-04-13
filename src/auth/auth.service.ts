import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository, EntityManager } from '@mikro-orm/postgresql';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';
import { Employee } from '../database/entites/mployee.entity';
import { TwoFactorAuth } from '../database/entites/twoFactorAuth.entity';
import { Store } from '../database/entites/store.entity';
import { SecurityAction } from '../database/entites/securityAction.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyDto } from './dto/verify.dto';
import * as crypto from 'crypto';
import * as OTPAuth from 'otpauth';
import * as QRCode from 'qrcode';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: EntityRepository<Employee>,
    @InjectRepository(TwoFactorAuth)
    private readonly twoFactorRepo: EntityRepository<TwoFactorAuth>,
    @InjectRepository(Store)
    private readonly storeRepo: EntityRepository<Store>,
    @InjectRepository(SecurityAction)
    private readonly securityActionRepo: EntityRepository<SecurityAction>,
    private readonly em: EntityManager,
    private readonly jwtService: JwtService,
  ) {}

  private generateOTP(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  private generateJWT(employee: Employee): string {
    return this.jwtService.sign({
      sub: employee.id,
      email: employee.email,
    });
  }

  async enableTwoFactor(employeeId: string) {
    const employee = await this.employeeRepo.findOne({ id: employeeId });
    if (!employee)
      throw new NotFoundException('Employee not found');

    const existing = await this.twoFactorRepo.findOne({ employee });
    if (existing)
      throw new BadRequestException('2FA is already enabled');

    const totp = new OTPAuth.TOTP({
      issuer: 'AsanPOS',
      label: employee.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });

    const secret = totp.secret.base32;

    const twoFactor = this.twoFactorRepo.create({
      employee,
      secret,
      createdAt: new Date(),
    });

    await this.em.persistAndFlush(twoFactor);

    const otpAuthUrl = totp.toString();
    const qrCode = await QRCode.toDataURL(otpAuthUrl);

    return { qrCode, secret };
  }

  async disableTwoFactor(employeeId: string) {
    const employee = await this.employeeRepo.findOne({ id: employeeId });
    if (!employee)
      throw new NotFoundException('Employee not found');

    const twoFactor = await this.twoFactorRepo.findOne({ employee });
    if (!twoFactor)
      throw new BadRequestException('2FA is not enabled');

    await this.em.removeAndFlush(twoFactor);

    return { message: '2FA disabled successfully' };
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

  async register(dto: RegisterDto) {
    const existing = await this.employeeRepo.findOne({ email: dto.email });

    if (existing) {
      if (existing.verifiedAt) {
        throw new BadRequestException('Email already in use');
      }
      await this.securityActionRepo.nativeDelete({ employee: existing });
      await this.em.removeAndFlush(existing);
    }

    const store = await this.storeRepo.findOne({ name: dto.storeName });
    if (!store)
      throw new NotFoundException(`Store with name ${dto.storeName} not found`);

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

    await this.em.persistAndFlush(employee);

    const code = this.generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const securityAction = this.securityActionRepo.create({
      employee,
      actionType: 'sign-up',
      secret: code,
      expiresAt,
      createdAt: new Date(),
    });

    await this.em.persistAndFlush(securityAction);
    await this.sendEmail(dto.email, code);

    return { message: 'OTP sent to your email. Please verify to complete registration.' };
  }

  async verifyRegister(dto: VerifyDto) {
    const employee = await this.employeeRepo.findOne({ email: dto.email });
    if (!employee)
      throw new NotFoundException('Employee not found');

    const securityAction = await this.securityActionRepo.findOne({
      employee,
      secret: dto.code,
      actionType: 'sign-up',
    });

    if (!securityAction)
      throw new BadRequestException('Invalid OTP code');

    const now = new Date();
    if (securityAction.expiresAt && securityAction.expiresAt < now)
      throw new BadRequestException('OTP has expired');

    employee.verifiedAt = new Date();
    await this.em.removeAndFlush(securityAction);
    await this.em.flush();

    return { message: 'Registration successful', employee_id: employee.id };
  }

  async login(dto: LoginDto) {
    const employee = await this.employeeRepo.findOne({ email: dto.email });
    if (!employee)
      throw new NotFoundException('Invalid email or password');

    if (!employee.verifiedAt)
      throw new BadRequestException('Please verify your email first');

    const isMatch = await bcrypt.compare(dto.password, employee.password);
    if (!isMatch)
      throw new NotFoundException('Invalid email or password');

    const twoFactor = await this.twoFactorRepo.findOne({ employee });

    if (twoFactor) {
      if (!dto.code)
        return { twoFactorRequired: true, message: 'Please provide your Google Authenticator code' };

      const totp = new OTPAuth.TOTP({
        issuer: 'AsanPOS',
        label: employee.email,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(twoFactor.secret),
      });

      const isValid = totp.validate({ token: dto.code, window: 1 });
      if (isValid === null)
        throw new BadRequestException('Invalid or expired 2FA code');
    }

    return { message: 'Login successful', token: this.generateJWT(employee) };
  }
}