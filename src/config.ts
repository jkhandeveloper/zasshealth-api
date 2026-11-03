import 'dotenv/config';
export function configuration() {
  const secret = (name: string) => {
    const value = process.env[name];
    if (!value || value.length < 32 || value.includes('CHANGE_ME'))
      throw new Error(
        name + ' must be a unique secret of at least 32 characters',
      );
    return value;
  };
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const production = process.env.NODE_ENV === 'production';
  const otpTransport = process.env.OTP_TRANSPORT ?? 'webhook';
  if (
    !['webhook', 'development'].includes(otpTransport) ||
    (production && otpTransport === 'development')
  )
    throw new Error('Invalid OTP_TRANSPORT');
  if (
    otpTransport === 'webhook' &&
    (!process.env.SMS_WEBHOOK_URL?.startsWith('https://') ||
      !process.env.SMS_WEBHOOK_TOKEN)
  )
    throw new Error('HTTPS SMS webhook and token are required');
  const fixedOtp = process.env.DEV_FIXED_OTP || undefined;
  if (
    fixedOtp &&
    (production || otpTransport !== 'development' || !/^\d{6}$/.test(fixedOtp))
  )
    throw new Error(
      'DEV_FIXED_OTP requires development transport, a non-production environment and six digits',
    );
  const redisUrl = process.env.REDIS_URL || undefined;
  if (redisUrl && !/^rediss?:\/\//.test(redisUrl))
    throw new Error('Invalid REDIS_URL');
  const swaggerEnabled =
    process.env.SWAGGER_ENABLED === undefined
      ? !production
      : process.env.SWAGGER_ENABLED === 'true';
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid PORT');
  const adminInvite = process.env.ADMIN_INVITE_SECRET || undefined;
  if (adminInvite && adminInvite.length < 32)
    throw new Error('ADMIN_INVITE_SECRET must have at least 32 characters');
  return {
    port,
    production,
    otpTransport,
    fixedOtp,
    redisUrl,
    swaggerEnabled,
    jwtSecret: secret('JWT_ACCESS_SECRET'),
    otpSecret: secret('OTP_HASH_SECRET'),
    adminInvite,
    corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean),
  };
}
export type Settings = ReturnType<typeof configuration>;
export const SETTINGS = Symbol('SETTINGS');
