import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { sign } from 'jsonwebtoken';
import { Prisma, Role, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SETTINGS, type Settings } from '../config';
import { RegisterDto, SendOtpDto, VerifyOtpDto } from './auth.dto';
@Injectable()
export class AuthService {
  constructor(
    private db: PrismaService,
    @Inject(SETTINGS) private config: Settings,
  ) {}
  me(userId: string) {
    return this.db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, phone: true, role: true, patientProfile: { select: { age: true, gender: true, allergies: true } } },
    }).then((user) => ({ id: user.id, name: user.name, phone: user.phone, role: user.role, ...user.patientProfile }));
  }
  private otpHash(phone: string, otp: string) {
    return createHmac('sha256', this.config.otpSecret)
      .update(phone + ':' + otp)
      .digest('hex');
  }
  private tokenHash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
  private access(user: User) {
    return {
      accessToken: sign({ role: user.role }, this.config.jwtSecret, {
        subject: user.id,
        expiresIn: '15m',
        algorithm: 'HS256',
        issuer: 'zasshealth',
        audience: 'zasshealth-api',
      }),
      tokenType: 'Bearer',
      expiresIn: 900,
      user: { id: user.id, role: user.role },
    };
  }
  private async lockPhone(tx: Prisma.TransactionClient, phone: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${phone}))`;
  }
  async sendOtp(dto: SendOtpDto) {
    const otp =
      this.config.fixedOtp ?? randomInt(0, 1000000).toString().padStart(6, '0');
    const otpHash = this.otpHash(dto.phone, otp);
    await this.db.$transaction(async (tx) => {
      await this.lockPhone(tx, dto.phone);
      const old = await tx.otpChallenge.findUnique({
        where: { phone: dto.phone },
      });
      if (old && Date.now() - old.sentAt.getTime() < 60000)
        throw new HttpException(
          'Wait 60 seconds before requesting another OTP',
          429,
        );
      const data = {
        otpHash,
        expiresAt: new Date(Date.now() + 300000),
        sentAt: new Date(),
        attempts: 0,
        consumed: false,
        registrationHash: null,
        registrationExpiresAt: null,
      };
      await tx.otpChallenge.upsert({
        where: { phone: dto.phone },
        create: { phone: dto.phone, ...data },
        update: data,
      });
    });
    if (this.config.otpTransport === 'development')
      return {
        message: 'Development OTP generated',
        developmentOtp: otp,
        expiresIn: 300,
      };
    try {
      const response = await fetch(process.env.SMS_WEBHOOK_URL!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + process.env.SMS_WEBHOOK_TOKEN,
        },
        body: JSON.stringify({
          phone: dto.phone,
          message:
            'Your ZassHealth code is ' + otp + '. It expires in 5 minutes.',
        }),
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      });
      if (!response.ok) throw new Error('SMS delivery rejected');
    } catch {
      await this.db.otpChallenge.updateMany({
        where: { phone: dto.phone, otpHash },
        data: { consumed: true },
      });
      throw new ServiceUnavailableException(
        'Unable to deliver OTP; try again later',
      );
    }
    return { message: 'OTP sent', expiresIn: 300 };
  }
  async verifyOtp(dto: VerifyOtpDto) {
    const result = await this.db.$transaction(async (tx) => {
      await this.lockPhone(tx, dto.phone);
      const challenge = await tx.otpChallenge.findUnique({
        where: { phone: dto.phone },
      });
      if (
        !challenge ||
        challenge.consumed ||
        challenge.expiresAt <= new Date() ||
        challenge.attempts >= 5
      )
        return null;
      if (
        !timingSafeEqual(
          Buffer.from(challenge.otpHash, 'hex'),
          Buffer.from(this.otpHash(dto.phone, dto.otp), 'hex'),
        )
      ) {
        // Return, rather than throw, so the failed-attempt increment commits.
        await tx.otpChallenge.update({
          where: { phone: dto.phone },
          data: { attempts: { increment: 1 } },
        });
        return null;
      }
      const user = await tx.user.findUnique({ where: { phone: dto.phone } });
      const token = randomBytes(32).toString('hex');
      await tx.otpChallenge.update({
        where: { phone: dto.phone },
        data: {
          consumed: true,
          registrationHash: user ? null : this.tokenHash(token),
          registrationExpiresAt: user ? null : new Date(Date.now() + 600000),
        },
      });
      return user ? { user } : { token };
    });
    if (!result)
      throw new UnauthorizedException('Invalid, expired or exhausted OTP');
    if ('user' in result && result.user) {
      if (!result.user.isVerified)
        throw new ForbiddenException('Account disabled');
      return this.access(result.user);
    }
    return { registrationToken: result.token, expiresIn: 600 };
  }
  async register(dto: RegisterDto) {
    if (dto.role === Role.SUPER_ADMIN) {
      const expected = this.config.adminInvite;
      if (
        !expected ||
        !dto.adminInviteSecret ||
        !timingSafeEqual(
          createHash('sha256').update(expected).digest(),
          createHash('sha256').update(dto.adminInviteSecret).digest(),
        )
      )
        throw new ForbiddenException('Valid admin invitation required');
    }
    if (dto.role === Role.PHARMACIST && !dto.pharmacyName?.trim())
      throw new BadRequestException('pharmacyName is required');
    const registrationHash = this.tokenHash(dto.registrationToken);
    const user = await this.db.$transaction(async (tx) => {
      const initial = await tx.otpChallenge.findUnique({
        where: { registrationHash },
      });
      if (!initial)
        throw new UnauthorizedException('Invalid registration token');
      await this.lockPhone(tx, initial.phone);
      const challenge = await tx.otpChallenge.findUnique({
        where: { registrationHash },
      });
      if (
        !challenge?.registrationExpiresAt ||
        challenge.registrationExpiresAt <= new Date()
      )
        throw new UnauthorizedException('Expired or used registration token');
      if (await tx.user.findUnique({ where: { phone: challenge.phone } }))
        throw new ConflictException('Account already registered');
      const created = await tx.user.create({
        data: {
          phone: challenge.phone,
          role: dto.role,
          isVerified: true,
          name: dto.name?.trim(),
          ...(dto.role === Role.PATIENT
            ? { patientProfile: { create: { age: dto.age, gender: dto.gender, allergies: dto.allergies } } }
            : {}),
          ...(dto.role === Role.DOCTOR
            ? {
                doctorProfile: {
                  create: { specialty: 'Not specified', fees: 0 },
                },
              }
            : {}),
          ...(dto.role === Role.PHARMACIST
            ? {
                pharmacistProfile: {
                  create: { pharmacyName: dto.pharmacyName!.trim() },
                },
              }
            : {}),
        },
      });
      await tx.otpChallenge.update({
        where: { phone: challenge.phone },
        data: { registrationHash: null, registrationExpiresAt: null },
      });
      return created;
    });
    return this.access(user);
  }
}
