import { ApiTags } from '@nestjs/swagger';
import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  HttpCode,
  HttpException,
  Injectable,
  Module,
  Post,
  UseGuards,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/security';
import { AuthService } from './auth.service';
import { RegisterDto, SendOtpDto, VerifyOtpDto } from './auth.dto';
@Injectable()
export class AuthRateGuard implements CanActivate {
  constructor(private db: PrismaService) {}
  async canActivate(ctx: ExecutionContext) {
    const request = ctx.switchToHttp().getRequest();
    const bucket = Math.floor(Date.now() / 60000);
    const key = createHash('sha256')
      .update(String(request.ip) + ':' + bucket)
      .digest('hex');
    const limit = await this.db.requestLimit.upsert({
      where: { key },
      create: { key, expiresAt: new Date((bucket + 2) * 60000) },
      update: { count: { increment: 1 } },
    });
    if (limit.count > 20)
      throw new HttpException('Too many authentication requests', 429);
    return true;
  }
}
@Public()
@UseGuards(AuthRateGuard)
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}
  @Post('send-otp') @HttpCode(200) send(@Body() dto: SendOtpDto) {
    return this.auth.sendOtp(dto);
  }
  @Post('verify-otp') @HttpCode(200) verify(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto);
  }
  @Post('register-profile') register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }
}
@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthRateGuard],
})
export class AuthModule {}
