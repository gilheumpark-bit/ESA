import { __resetTokenBudget, checkTokenBudget, settleTokenUsage } from '../token-budget';
describe('finite and idempotent budget reservations', () => {
 beforeEach(() => __resetTokenBudget());
 afterEach(() => jest.useRealTimers());
 it.each([NaN, Infinity, -1, 1.2, Number.MAX_VALUE])('rejects %s without corrupting a later request', (input) => {
   expect(checkTokenBudget('a', input).allowed).toBe(false);
   expect(checkTokenBudget('a', 500001).allowed).toBe(false);
   expect(checkTokenBudget('a', 100).remaining).toBe(499900);
 });
 it('charges an overage exactly once', () => {
   const { reservationId } = checkTokenBudget('a',100);
   settleTokenUsage('a',100,1000,reservationId); settleTokenUsage('a',100,1000,reservationId);
   expect(checkTokenBudget('a',0).remaining).toBe(499000);
 });
 it('settles concurrent same-size reservations independently', () => {
   const a=checkTokenBudget('a',1000), b=checkTokenBudget('a',1000);
   settleTokenUsage('a',1000,100,a.reservationId); settleTokenUsage('a',1000,200,b.reservationId);
   expect(checkTokenBudget('a',0).remaining).toBe(499700);
 });
 it('never credits an old UTC day into a fresh budget', () => {
   jest.useFakeTimers().setSystemTime(new Date('2026-09-26T23:59:59Z'));
   const old=checkTokenBudget('a',1000);
   jest.setSystemTime(new Date('2026-09-27T00:00:01Z'));
   checkTokenBudget('a',1000); settleTokenUsage('a',1000,0,old.reservationId);
   expect(checkTokenBudget('a',0).remaining).toBe(499000);
 });
 it('does not apply invalid, wrong-size or unknown settlement receipts', () => {
   const r=checkTokenBudget('a',100);
   settleTokenUsage('a',100,NaN,r.reservationId); settleTokenUsage('a',101,0,r.reservationId); settleTokenUsage('a',100,0,'wrong');
   expect(checkTokenBudget('a',0).remaining).toBe(499900);
 });
});
