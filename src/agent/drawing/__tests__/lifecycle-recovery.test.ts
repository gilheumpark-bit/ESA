import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createJob, claimOwnedJobRun, DRAWING_RUN_LEASE_MS, getOwnedJob, updateJob, finishOwnedJobRun, heartbeatOwnedJobRun, cancelOwnedJob } from '../drawing-job-store';
import { createSourceLease, readSourceLease, purgeExpiredLeases } from '../source-lease-store';
const budget={ maxPages:1,maxVlmCalls:0,maxPixels:1000,deadlineMs:1000 };
describe('durable lifecycle recovery and damage containment', () => {
 let root: string; let store: string | undefined; let secret: string | undefined;
 beforeEach(() => { store=process.env.DRAWING_JOB_STORE_DIR; secret=process.env.DRAWING_SOURCE_LEASE_SECRET;
   root=mkdtempSync(join(tmpdir(),'esa-lifecycle-')); process.env.DRAWING_JOB_STORE_DIR=root; process.env.DRAWING_SOURCE_LEASE_SECRET='synthetic-local-secret-not-production'; });
 afterEach(() => { jest.useRealTimers(); rmSync(root,{recursive:true,force:true});
   if(store===undefined)delete process.env.DRAWING_JOB_STORE_DIR;else process.env.DRAWING_JOB_STORE_DIR=store;
   if(secret===undefined)delete process.env.DRAWING_SOURCE_LEASE_SECRET;else process.env.DRAWING_SOURCE_LEASE_SECRET=secret;
 });
 it('reclaims an expired execution and rejects both old writes and old release', () => {
   jest.useFakeTimers();
   const job=createJob({documentHash:'a'.repeat(64),ownerId:'owner',budget,estimatedPages:1});
   const first=claimOwnedJobRun(job.jobId,'owner',['QUEUED'])!;
   expect(claimOwnedJobRun(job.jobId,'owner',['QUEUED'])).toBeUndefined();
   jest.advanceTimersByTime(DRAWING_RUN_LEASE_MS+1);
   const next=claimOwnedJobRun(job.jobId,'owner',['QUEUED'])!;
   expect(next.runLease!.id).not.toBe(first.runLease!.id);
   expect(()=>updateJob(job.jobId,{status:'COMPLETE'},first.runLease!.id)).toThrow('LEASE_LOST');
   expect(finishOwnedJobRun(job.jobId,'owner',first.runLease!.id)).toBe(false);
   expect(heartbeatOwnedJobRun(job.jobId,'owner',next.runLease!.id)).toBe(true);
   expect(finishOwnedJobRun(job.jobId,'owner',next.runLease!.id,{status:'PARTIAL'})).toBe(true);
   expect(getOwnedJob(job.jobId,'owner')?.status).toBe('PARTIAL');
 });
 it('never steals a heartbeat or resumes a cancelled job',()=>{
   jest.useFakeTimers();const j=createJob({documentHash:'b'.repeat(64),ownerId:'owner',budget,estimatedPages:1});
   const claimed=claimOwnedJobRun(j.jobId,'owner',['QUEUED'])!;
   jest.advanceTimersByTime(60_000);expect(heartbeatOwnedJobRun(j.jobId,'owner',claimed.runLease!.id)).toBe(true);
   jest.advanceTimersByTime(40_000);expect(claimOwnedJobRun(j.jobId,'owner',['QUEUED'])).toBeUndefined();
   expect(claimOwnedJobRun(j.jobId,'other',['QUEUED'])).toBeUndefined();
   cancelOwnedJob(j.jobId,'owner');jest.advanceTimersByTime(DRAWING_RUN_LEASE_MS+1);
   expect(claimOwnedJobRun(j.jobId,'owner',['CANCELLED'])).toBeUndefined();
 });
 it('quarantines one corrupt JSON without denying another owner or new uploads',()=>{
   const a=createSourceLease(Uint8Array.from([1,2,3]).buffer,'c'.repeat(64),'owner');
   if('error' in a)throw Error(a.error);
   writeFileSync(join(root,'leases','lease-broken.json'),'{');
   expect(()=>purgeExpiredLeases()).not.toThrow();
   expect([...new Uint8Array(readSourceLease(a.leaseId,'owner')!)]).toEqual([1,2,3]);
   expect(readSourceLease(a.leaseId,'other')).toBeNull();
   expect(readdirSync(join(root,'leases','quarantine'))).toHaveLength(1);
   expect(createSourceLease(Uint8Array.from([4]).buffer,'d'.repeat(64),'other')).not.toHaveProperty('error');
 });
 it('enforces expiry at the exact boundary, independently of cleanup cadence',()=>{
   jest.useFakeTimers();const a=createSourceLease(Uint8Array.from([1]).buffer,'e'.repeat(64),'owner',1);
   if('error' in a)throw Error(a.error);jest.advanceTimersByTime(1);
   expect(readSourceLease(a.leaseId,'owner')).toBeNull();
 });
});
