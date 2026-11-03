import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  ServiceUnavailableException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role, User } from '@prisma/client';
import { verify } from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import { SETTINGS, type Settings } from '../config';
export const Public = () => SetMetadata('public', true);
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User =>
    ctx.switchToHttp().getRequest().user,
);
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private db: PrismaService,
    @Inject(SETTINGS) private config: Settings,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>('public', [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    )
      return true;
    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers.authorization ?? '';
    if (!header.startsWith('Bearer ')) throw new UnauthorizedException();
    let userId: string;
    try {
      const payload = verify(header.slice(7), this.config.jwtSecret, {
        algorithms: ['HS256'],
        issuer: 'zasshealth',
        audience: 'zasshealth-api',
      });
      if (typeof payload === 'string' || typeof payload.sub !== 'string')
        throw new Error();
      userId = payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    let user: User | null;
    try {
      user = await this.db.user.findUnique({ where: { id: userId } });
    } catch {
      throw new ServiceUnavailableException(
        'Authentication service unavailable',
      );
    }
    if (!user?.isVerified)
      throw new UnauthorizedException('Account unavailable');
    req.user = user;
    return true;
  }
}
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<Role[]>('roles', [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (roles && !roles.includes(ctx.switchToHttp().getRequest().user?.role))
      throw new ForbiddenException();
    return true;
  }
}
