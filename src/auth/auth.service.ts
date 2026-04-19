import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { JwtService } from '@nestjs/jwt';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import * as bcrypt from 'bcrypt';
import { Employee } from '../database/entites/mployee.entity';
import { TwoFactorAuth } from '../database/entites/twoFactorAuth.entity';
import { Store } from '../database/entites/store.entity';
import { SecurityAction } from '../database/entites/securityAction.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyDto } from './dto/verify.dto';
import { VerifyTwoFactorDto } from "./dto/verify-2fa.dto";
import * as OTPAuth from 'otpauth';
import * as QRCode from 'qrcode';
import { generateOTP } from '../shared/utils/auth.utils';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly em: EntityManager,
    private readonly jwtService: JwtService,
    private readonly queueService: QueueService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager
  ) { }

  private generateJWT(employee: Employee): string {
    return this.jwtService.sign({
      sub: employee.id,
      email: employee.email,
    });
  }

  async enableTwoFactor(employeeId: string) {
    const employee = await this.em.findOne(Employee, { id: employeeId });
    if (!employee)
      throw new NotFoundException('Employee not found');

    const existing = await this.em.findOne(TwoFactorAuth, { employee });
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

    await this.cacheManager.set(`2fa_secret_${employeeId}`, secret, 300000);

    const otpAuthUrl = totp.toString();
    const qrCode = await QRCode.toDataURL(otpAuthUrl);

    return { qrCode };
  }

  async verifyTwoFactorSetup(employeeId: string, dto: VerifyTwoFactorDto) {
    const employee = await this.em.findOne(Employee, { id: employeeId });
    if (!employee)
      throw new NotFoundException('Employee not found');

    const secret = await this.cacheManager.get(`2fa_secret_${employeeId}`) as string;
    if (!secret)
      throw new BadRequestException('2FA setup expired. Please try enabling 2FA again');

    const totp = new OTPAuth.TOTP({
      issuer: 'AsanPOS',
      label: employee.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });

    const isValid = totp.validate({ token: dto.code, window: 1 });
    if (isValid === null)
      throw new BadRequestException('Invalid code. Please scan the QR code again');

    const twoFactor = this.em.create(TwoFactorAuth, {
      employee,
      secret,
      createdAt: new Date(),
    });

    await this.em.persistAndFlush(twoFactor);

    await this.cacheManager.del(`2fa_secret_${employeeId}`);

    return { message: '2FA enabled successfully' };
  }

  async disableTwoFactor(employeeId: string) {
    const employee = await this.em.findOne(Employee, { id: employeeId });
    if (!employee)
      throw new NotFoundException('Employee not found');

    const twoFactor = await this.em.findOne(TwoFactorAuth, { employee });
    if (!twoFactor)
      throw new BadRequestException('2FA is not enabled');

    await this.em.removeAndFlush(twoFactor);

    return { message: '2FA disabled successfully' };
  }

  async register(dto: RegisterDto) {
    const existing = await this.em.findOne(Employee, { email: dto.email });

    if (existing) {
      if (existing.verifiedAt)
        throw new BadRequestException('Email already in use');

      await this.em.nativeDelete(SecurityAction, { employee: existing });
      await this.em.removeAndFlush(existing);
    }

    let store = await this.em.findOne(Store, { name: dto.storeName });
    if (store) {
      const existingEmployee = await this.em.findOne(Employee, {
        store,
        verifiedAt: { $ne: null },  
      });

      if (existingEmployee) {
        throw new BadRequestException('This store already has an owner. Please create a new store.');
      }
    } else {
      store = this.em.create(Store, {
        name: dto.storeName,
        address: dto.storeAddress,
      });
      await this.em.persistAndFlush(store);
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const employee = this.em.create(Employee, {
      name: dto.name,
      email: dto.email,
      password: hashedPassword,
      phone: dto.phone,
      store,
    });

    await this.em.persistAndFlush(employee);

    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const securityAction = this.em.create(SecurityAction, {
      employee,
      actionType: 'sign-up',
      secret: code,
      expiresAt,
      createdAt: new Date(),
    });

    await this.em.persistAndFlush(securityAction);
    await this.queueService.sendVerificationEmail(dto.email, code);
    return { message: 'OTP sent to your email. Please verify to complete registration.' };
  }

  async verifyRegister(dto: VerifyDto) {
    const employee = await this.em.findOne(Employee, { email: dto.email });
    if (!employee)
      throw new NotFoundException('Employee not found');

    const securityAction = await this.em.findOne(SecurityAction, {
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
    const employee = await this.em.findOne(Employee, { email: dto.email });
    if (!employee)
      throw new NotFoundException('Invalid email or password');

    if (!employee.verifiedAt)
      throw new BadRequestException('Please verify your email first');

    const isMatch = await bcrypt.compare(dto.password, employee.password);
    if (!isMatch)
      throw new NotFoundException('Invalid email or password');

    const twoFactor = await this.em.findOne(TwoFactorAuth, { employee });

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