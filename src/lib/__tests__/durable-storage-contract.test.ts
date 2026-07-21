import { logAudit, getAuditLog } from '../audit-log';
import { createNotification, getUserNotifications } from '../notifications';
import { allowEphemeralStorage } from '../storage-policy';

const originalNodeEnv = process.env.NODE_ENV;
const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const originalEphemeral = process.env.ESVA_ALLOW_EPHEMERAL_STORAGE;

function setNodeEnv(value: string | undefined): void {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value,
    configurable: true,
    enumerable: true,
    writable: true,
  });
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe('production durability contract', () => {
  beforeEach(() => {
    setNodeEnv('production');
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.ESVA_ALLOW_EPHEMERAL_STORAGE = 'false';
  });

  afterAll(() => {
    setNodeEnv(originalNodeEnv);
    restoreEnv('NEXT_PUBLIC_SUPABASE_URL', originalSupabaseUrl);
    restoreEnv('SUPABASE_SERVICE_ROLE_KEY', originalServiceKey);
    restoreEnv('ESVA_ALLOW_EPHEMERAL_STORAGE', originalEphemeral);
  });

  it('does not pretend notifications persisted in process memory', async () => {
    await expect(createNotification({
      userId: 'user-a',
      type: 'system',
      title: 'test',
      body: 'test',
    })).rejects.toThrow('저장소');
    await expect(getUserNotifications('user-a')).rejects.toThrow('저장소');
  });

  it('fails closed for a production environment without an override', () => {
    expect(allowEphemeralStorage({ nodeEnv: 'production' })).toBe(false);
  });

  it('does not pretend audit events persisted in process memory', async () => {
    await expect(logAudit({
      tenantId: 'tenant-a',
      userId: 'user-a',
      action: 'calc.execute',
      resource: 'voltage-drop',
    })).rejects.toThrow('감사로그');
    await expect(getAuditLog('tenant-a')).rejects.toThrow('감사로그');
  });
});
