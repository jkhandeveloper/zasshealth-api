import { configuration } from './config';
describe('development configuration boundaries', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    Object.assign(process.env, {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://test:test@localhost/test',
      JWT_ACCESS_SECRET: 'j'.repeat(40),
      OTP_HASH_SECRET: 'o'.repeat(40),
      OTP_TRANSPORT: 'development',
      DEV_FIXED_OTP: '123456',
      REDIS_URL: 'redis://localhost:6379',
      SWAGGER_ENABLED: 'true',
    });
  });
  afterEach(() => {
    process.env = { ...saved };
  });
  it('enables fixed OTP and Swagger for local testing', () => {
    expect(configuration()).toMatchObject({
      fixedOtp: '123456',
      swaggerEnabled: true,
    });
  });
  it('rejects fixed OTPs even with a real SMS transport in production', () => {
    Object.assign(process.env, {
      NODE_ENV: 'production',
      OTP_TRANSPORT: 'webhook',
      SMS_WEBHOOK_URL: 'https://sms.example.test/send',
      SMS_WEBHOOK_TOKEN: 'test',
    });
    expect(() => configuration()).toThrow('DEV_FIXED_OTP');
  });
  it('rejects malformed fixed codes', () => {
    process.env.DEV_FIXED_OTP = 'abc';
    expect(() => configuration()).toThrow('DEV_FIXED_OTP');
  });
});
