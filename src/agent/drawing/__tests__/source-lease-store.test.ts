import {
  _resetSourceLeasesForTests,
  createSourceLease,
  readSourceLease,
  releaseSourceLease,
} from '../source-lease-store';

describe('encrypted drawing source lease ownership', () => {
  const originalSecret = process.env.DRAWING_SOURCE_LEASE_SECRET;

  beforeEach(() => {
    process.env.DRAWING_SOURCE_LEASE_SECRET = ['drawing', 'lease', 'test', 'secret'].join('-');
    _resetSourceLeasesForTests();
  });

  afterAll(() => {
    process.env.DRAWING_SOURCE_LEASE_SECRET = originalSecret;
  });

  it('decrypts only for the creating owner and resists cross-owner release', () => {
    const bytes = Uint8Array.from([1, 2, 3]).buffer;
    const lease = createSourceLease(bytes, 'a'.repeat(64), 'owner-a');
    if ('error' in lease) throw new Error(lease.error);

    expect(readSourceLease(lease.leaseId, 'owner-b')).toBeNull();
    expect(releaseSourceLease(lease.leaseId, 'owner-b')).toBe(false);
    expect(Array.from(new Uint8Array(readSourceLease(lease.leaseId, 'owner-a')!))).toEqual([1, 2, 3]);
    expect(releaseSourceLease(lease.leaseId, 'owner-a')).toBe(true);
    expect(readSourceLease(lease.leaseId, 'owner-a')).toBeNull();
  });
});
