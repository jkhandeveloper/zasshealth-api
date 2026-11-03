import { createHmac } from 'node:crypto';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import type { Settings } from '../config';
describe('development fixed OTP', () => {
  it('stores a phone-bound hash of 123456 for any valid phone', async () => {
    const tx = {
      $executeRaw: jest.fn(),
      otpChallenge: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    };
    const db = {
      $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    };
    const settings = {
      fixedOtp: '123456',
      otpTransport: 'development',
      otpSecret: 'test-otp-secret',
    } as Settings;
    const auth = new AuthService(db as unknown as PrismaService, settings);
    for (const phone of ['+923001234561', '+14155552671']) {
      expect(await auth.sendOtp({ phone })).toMatchObject({
        developmentOtp: '123456',
      });
      expect(tx.otpChallenge.upsert).toHaveBeenLastCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            phone,
            otpHash: createHmac('sha256', settings.otpSecret)
              .update(phone + ':123456')
              .digest('hex'),
          }),
        }),
      );
    }
  });
});
