import {
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { sign } from 'jsonwebtoken';
import { JwtGuard, RolesGuard } from './security';
import { PrismaService } from '../prisma/prisma.service';
import type { Settings } from '../config';
const secret = 'test-only-secret-with-at-least-32-characters';
function context(request: object) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
describe('authorization', () => {
  const user = { id: 'user-id', role: 'PATIENT', isVerified: true };
  const db = { user: { findUnique: jest.fn() } };
  const reflector = { getAllAndOverride: jest.fn() };
  let guard: JwtGuard;
  beforeEach(() => {
    jest.resetAllMocks();
    db.user.findUnique.mockResolvedValue(user);
    guard = new JwtGuard(
      reflector as unknown as Reflector,
      db as unknown as PrismaService,
      { jwtSecret: secret } as Settings,
    );
  });
  it('rejects a missing token', async () => {
    await expect(
      guard.canActivate(context({ headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('loads the current database role instead of trusting a stale token role', async () => {
    const access = sign({ role: 'SUPER_ADMIN' }, secret, {
      subject: user.id,
      issuer: 'zasshealth',
      audience: 'zasshealth-api',
      expiresIn: 60,
    });
    const req = {
      headers: { authorization: 'Bearer ' + access },
      user: undefined,
    };
    await expect(guard.canActivate(context(req))).resolves.toBe(true);
    expect(req.user).toEqual(user);
  });
  it('rejects an expired token', async () => {
    const access = sign({}, secret, {
      subject: user.id,
      issuer: 'zasshealth',
      audience: 'zasshealth-api',
      expiresIn: -1,
    });
    await expect(
      guard.canActivate(
        context({ headers: { authorization: 'Bearer ' + access } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('rejects a disabled account', async () => {
    db.user.findUnique.mockResolvedValue({ ...user, isVerified: false });
    const access = sign({}, secret, {
      subject: user.id,
      issuer: 'zasshealth',
      audience: 'zasshealth-api',
      expiresIn: 60,
    });
    await expect(
      guard.canActivate(
        context({ headers: { authorization: 'Bearer ' + access } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('returns service unavailable when the account lookup fails', async () => {
    db.user.findUnique.mockRejectedValue(new Error('Database offline'));
    const access = sign({}, secret, {
      subject: user.id,
      issuer: 'zasshealth',
      audience: 'zasshealth-api',
      expiresIn: 60,
    });
    await expect(
      guard.canActivate(
        context({ headers: { authorization: 'Bearer ' + access } }),
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('rejects an invalid signature without querying the database', async () => {
    const access = sign({}, 'wrong-secret', {
      subject: user.id,
      issuer: 'zasshealth',
      audience: 'zasshealth-api',
    });
    await expect(
      guard.canActivate(
        context({ headers: { authorization: 'Bearer ' + access } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
  it('denies a role that is absent from the route allowlist', () => {
    reflector.getAllAndOverride.mockReturnValue(['SUPER_ADMIN']);
    expect(() =>
      new RolesGuard(reflector as unknown as Reflector).canActivate(
        context({ user }),
      ),
    ).toThrow(ForbiddenException);
  });
});
