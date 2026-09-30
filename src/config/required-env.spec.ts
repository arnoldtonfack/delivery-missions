import { validateRequiredEnv } from './required-env';

const completeEnv = (): NodeJS.ProcessEnv => ({
  DATABASE_URL: 'postgresql://user:secret-password@localhost:5432/db',
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',
});

describe('validateRequiredEnv', () => {
  it('passes when every required variable is present', () => {
    expect(() => validateRequiredEnv(completeEnv())).not.toThrow();
  });

  it('throws when a required variable is missing', () => {
    const env = completeEnv();
    delete env.DATABASE_URL;

    expect(() => validateRequiredEnv(env)).toThrow(/DATABASE_URL/);
  });

  it('throws when a required variable is present but blank', () => {
    expect(() =>
      validateRequiredEnv({ ...completeEnv(), REDIS_HOST: '  ' }),
    ).toThrow(/REDIS_HOST/);
  });

  it('reports every problem at once rather than failing on the first', () => {
    let message = '';
    try {
      validateRequiredEnv({});
    } catch (err) {
      message = err instanceof Error ? err.message : '';
    }

    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('REDIS_HOST');
    expect(message).toContain('REDIS_PORT');
  });

  it('requires CORS_ORIGIN in production only', () => {
    expect(() =>
      validateRequiredEnv({ ...completeEnv(), NODE_ENV: 'production' }),
    ).toThrow(/CORS_ORIGIN/);
    expect(() =>
      validateRequiredEnv({ ...completeEnv(), NODE_ENV: 'development' }),
    ).not.toThrow();
  });

  it('never leaks a value in the error message', () => {
    let message = '';
    try {
      validateRequiredEnv({ ...completeEnv(), REDIS_HOST: '' });
    } catch (err) {
      message = err instanceof Error ? err.message : '';
    }

    expect(message).not.toContain('secret-password');
  });
});
