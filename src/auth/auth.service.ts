import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Employee } from '../database/entites/employee.entity';
import { TwoFactorAuth } from '../database/entites/twoFactorAuth.entity';
import { Store } from '../database/entites/store.entity';
import { SecurityAction } from '../database/entites/securityAction.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { NewPasswordDto } from './dto/new-password.dto';
import { VerifyDto } from '../employees/dto/verify.dto';
import { VerifyTwoFactorDto } from './dto/verify-2fa.dto';
import * as OTPAuth from 'otpauth';
import * as QRCode from 'qrcode';
import {
  generateOTP,
  getAuthTokenVersionKey,
} from '../shared/utils/auth.utils';
import { QueueService } from '../queue/queue.service';
import Redis from 'ioredis';
import { Account } from '../database/entites/account.entity';
import { StoreSettings } from '../database/entites/store-settings.entity';
import { Role } from '../shared/utils/role.enum';
import { Customer } from '../database/entites/customer.entity';
import { randomUUID } from 'crypto';

const PASSWORD_RESET_ACTION = 'password-reset';
const PASSWORD_RESET_SESSION_TTL_SECONDS = 5 * 60;
const PASSWORD_RESET_SESSION_KEY_PREFIX = 'auth:password-reset-session:';

@Injectable()
export class AuthService {
  constructor(
    private readonly em: EntityManager,
    private readonly jwtService: JwtService,
    private readonly queueService: QueueService,

    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
  ) {}

  async enableTwoFactor(employeeId: string) {
    const employee = await this.em.findOne(Employee, { id: employeeId });
    if (!employee) throw new NotFoundException('Employee not found');

    const existing = await this.em.findOne(TwoFactorAuth, { employee });
    if (existing) throw new BadRequestException('2FA is already enabled');

    const totp = new OTPAuth.TOTP({
      issuer: 'AsanPOS',
      label: employee.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });

    const secret = totp.secret.base32;

    await this.redis.set(`2fa_secret_${employeeId}`, secret, 'EX', 300);

    const otpAuthUrl = totp.toString();
    const qrCode = await QRCode.toDataURL(otpAuthUrl);

    return { qrCode };
  }

  async verifyTwoFactorSetup(employeeId: string, dto: VerifyTwoFactorDto) {
    const employee = await this.em.findOne(Employee, { id: employeeId });
    if (!employee) throw new NotFoundException('Employee not found');

    const secret = await this.redis.get(`2fa_secret_${employeeId}`);
    if (!secret)
      throw new BadRequestException(
        '2FA setup expired. Please try enabling 2FA again',
      );

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
      throw new BadRequestException(
        'Invalid code. Please scan the QR code again',
      );

    const twoFactor = this.em.create(TwoFactorAuth, {
      employee,
      secret,
      createdAt: new Date(),
    });

    await this.em.persistAndFlush(twoFactor);

    return { message: '2FA enabled successfully' };
  }

  async disableTwoFactor(employeeId: string) {
    const employee = await this.em.findOne(Employee, { id: employeeId });
    if (!employee) throw new NotFoundException('Employee not found');

    const twoFactor = await this.em.findOne(TwoFactorAuth, { employee });
    if (!twoFactor) throw new BadRequestException('2FA is not enabled');

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

      if (existingEmployee)
        throw new BadRequestException(
          'This store already has an owner. Please create a new store.',
        );
    } else {
      const defaultAccount = this.em.create(Account, {
        name: 'Default Account',
        type: 'asset',
      });

      const storeSettings = this.em.create(StoreSettings, {
        defaultAccount,
      });

      store = this.em.create(Store, {
        name: dto.storeName,
        address: dto.storeAddress,
        storeSettings,
      });

      await this.em.persistAndFlush([defaultAccount, storeSettings, store]);

      const payable = this.em.create(Account, {
        name: 'Walk-in Customer - Accounts Payable',
        type: 'liability',
      });

      await this.em.persistAndFlush(payable);

      const walkInCustomer = this.em.create(Customer, {
        name: 'Walk-in Customer',
        phone: this.generateWalkInPhone(),
        address: 'N/A',
        store,
        payable,
      });

      await this.em.persistAndFlush(walkInCustomer);
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const employee = this.em.create(Employee, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      role: Role.Admin,
      password: hashedPassword,
      phone: dto.phone,
      imageUrl: dto.imageUrl,
      gender: dto.gender,
      dob: dto.dob,
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

    this.em.persist(employee);
    this.em.persist(securityAction);
    await this.em.flush();
    await this.queueService.sendVerificationEmail(dto.email, code);

    return {
      message:
        'OTP sent to your email. Please verify to complete registration.',
    };
  }

  private generateWalkInPhone(): string {
    let phone = '0';
    for (let i = 0; i < 9; i++) {
      phone += Math.floor(Math.random() * 10).toString();
    }
    return phone;
  }

  async verifyRegister(dto: VerifyDto) {
    const employee = await this.em.findOne(Employee, { email: dto.email });
    if (!employee) throw new NotFoundException('Employee not found');

    const securityAction = await this.em.findOne(SecurityAction, {
      employee,
      secret: dto.code,
      actionType: 'sign-up',
    });

    if (!securityAction) throw new BadRequestException('Invalid OTP code');

    const now = new Date();
    if (securityAction.expiresAt && securityAction.expiresAt < now)
      throw new BadRequestException('OTP has expired');

    employee.verifiedAt = new Date();
    await this.em.removeAndFlush(securityAction);
    await this.em.flush();

    return {
      message: 'Email verified successfully',
      token: await this.generateJWT(employee),
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const employee = await this.em.findOne(Employee, { email: dto.email });

    if (!employee || employee.role !== Role.Admin)
      throw new BadRequestException(
        `Employee with email ${dto.email} not found or is not an admin`,
      );

    await this.em.nativeDelete(SecurityAction, {
      employee,
      actionType: PASSWORD_RESET_ACTION,
    });

    const code = generateOTP();
    const securityAction = this.em.create(SecurityAction, {
      employee,
      actionType: PASSWORD_RESET_ACTION,
      secret: await bcrypt.hash(code, 10),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      createdAt: new Date(),
    });

    await this.em.persistAndFlush(securityAction);
    await this.queueService.sendVerificationEmail(employee.email, code);

    return {
      message: 'Reset code sent to your email. Please check your inbox.',
    };
  }

  async verifyResetCode(dto: ResetPasswordDto) {
    const employee = await this.em.findOne(Employee, { email: dto.email });
    if (!employee || employee.role !== Role.Admin)
      throw new BadRequestException('Invalid password reset request');

    const securityAction = await this.em.findOne(
      SecurityAction,
      { employee, actionType: PASSWORD_RESET_ACTION },
      { orderBy: { createdAt: 'DESC' } },
    );
    if (!securityAction?.secret)
      throw new BadRequestException('Invalid password reset code');

    if (securityAction.expiresAt && securityAction.expiresAt <= new Date()) {
      await this.em.removeAndFlush(securityAction);
      throw new BadRequestException('Password reset code has expired');
    }

    const isCodeValid = await bcrypt.compare(dto.code, securityAction.secret);
    if (!isCodeValid)
      throw new BadRequestException('Invalid password reset code');

    const passwordResetSession = randomUUID();
    await this.em.removeAndFlush(securityAction);
    await this.redis.set(
      `${PASSWORD_RESET_SESSION_KEY_PREFIX}${passwordResetSession}`,
      employee.id,
      'EX',
      PASSWORD_RESET_SESSION_TTL_SECONDS,
    );

    return {
      message: 'Reset code verified successfully',
      passwordResetSession,
    };
  }

  async setNewPassword(dto: NewPasswordDto, passwordResetSession: string) {
    const employeeId = await this.redis.getdel(
      `${PASSWORD_RESET_SESSION_KEY_PREFIX}${passwordResetSession}`,
    );
    if (!employeeId)
      throw new BadRequestException(
        'Password reset session is invalid or expired',
      );

    const employee = await this.em.findOne(Employee, { id: employeeId });
    if (!employee || employee.role !== Role.Admin)
      throw new BadRequestException('Invalid password reset request');

    employee.password = await bcrypt.hash(dto.newPassword, 10);
    await this.em.flush();
    await this.redis.incr(getAuthTokenVersionKey(employee.id));

    return { message: 'Password reset successfully' };
  }

  async login(dto: LoginDto) {
    const employee = await this.em.findOne(Employee, { email: dto.email });
    if (!employee) throw new NotFoundException('Invalid email or password');

    if (!employee.verifiedAt)
      throw new BadRequestException('Please verify your email first');

    const isMatch = await bcrypt.compare(dto.password, employee.password);
    if (!isMatch) throw new NotFoundException('Invalid email or password');

    const twoFactor = await this.em.findOne(TwoFactorAuth, { employee });

    if (twoFactor) {
      if (!dto.code)
        return {
          twoFactorRequired: true,
          message: 'Please provide your Google Authenticator code',
        };

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

    return {
      message: 'Login successful',
      token: await this.generateJWT(employee),
    };
  }

  private async generateJWT(employee: Employee): Promise<string> {
    const storedTokenVersion = await this.redis.get(
      getAuthTokenVersionKey(employee.id),
    );
    const tokenVersion = Number.parseInt(storedTokenVersion ?? '0', 10) || 0;

    return this.jwtService.sign({
      sub: employee.id,
      email: employee.email,
      role: employee.role,
      tokenVersion,
    });
  }
}
