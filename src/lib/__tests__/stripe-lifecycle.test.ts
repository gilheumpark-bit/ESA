import { getStripeSession } from '../stripe';
const mockRpc=jest.fn();const mockCreateSession=jest.fn();const mockRetrieveSession=jest.fn();const mockCustomer=jest.fn();const mockSubscriptions=jest.fn();
jest.mock('@/lib/supabase',()=>({ensureUserProfile:jest.fn(),getSupabaseAdmin:()=>({rpc:mockRpc})}));
jest.mock('stripe',()=>({__esModule:true,default:jest.fn(()=>({customers:{create:mockCustomer},subscriptions:{list:mockSubscriptions},checkout:{sessions:{create:mockCreateSession,retrieve:mockRetrieveSession}}}))}));
describe('checkout purchase identity and provider reconciliation',()=>{
 const env={...process.env};
 beforeEach(()=>{
  jest.clearAllMocks();process.env.STRIPE_SECRET_KEY='sk_test_fixture_only';process.env.STRIPE_PRICE_PRO_MONTHLY='price_fixture';
  mockSubscriptions.mockResolvedValue({data:[],has_more:false});mockCustomer.mockResolvedValue({id:'cus_fixture'});
  mockRpc.mockImplementation(async(name:string)=>({error:null,data:name==='acquire_checkout_intent'?{id:'intent-fixture',expires_at:new Date(Date.now()+3600000).toISOString(),customer_id:'cus_fixture'}:name==='bind_stripe_customer'?'cus_fixture':true}));
  mockCreateSession.mockResolvedValue({id:'cs_same',url:'https://checkout.example.invalid/same'});
 });
 afterAll(()=>{process.env=env;});
 it('concurrent same purchase calls use identical idempotency keys and the same customer',async()=>{
  const results=await Promise.all([getStripeSession('pro_monthly','user-a','https://app.example.invalid/settings'),getStripeSession('pro_monthly','user-a','https://app.example.invalid/settings')]);
  expect(results[0]).toEqual(results[1]);expect(mockCreateSession).toHaveBeenCalledTimes(2);
  for(const [body,options] of mockCreateSession.mock.calls){expect(options).toEqual({idempotencyKey:'esa-checkout-intent-fixture'});expect(body.customer).toBe('cus_fixture');}
 });
 it('refuses provider subscriptions missing from the webhook database view',async()=>{
  mockSubscriptions.mockResolvedValue({data:[{status:'active'}],has_more:false});await expect(getStripeSession('pro_monthly','user-a','https://app.example.invalid/settings')).rejects.toThrow('SUBSCRIPTION_EXISTS');expect(mockCreateSession).not.toHaveBeenCalled();
 });
 it('retrieves the original open session instead of creating another',async()=>{
  mockRpc.mockResolvedValue({data:{id:'intent-fixture',session_id:'cs_same'},error:null});mockRetrieveSession.mockResolvedValue({status:'open',id:'cs_same',url:'https://checkout.example.invalid/same'});
  expect((await getStripeSession('pro_monthly','user-a','https://app.example.invalid/settings')).sessionId).toBe('cs_same');expect(mockCreateSession).not.toHaveBeenCalled();
 });
 it('fails closed when a completed intent awaits reconciliation',async()=>{
  mockRpc.mockResolvedValue({data:{id:'intent-fixture',session_id:'cs_same'},error:null});mockRetrieveSession.mockResolvedValue({status:'complete'});await expect(getStripeSession('pro_monthly','user-a','https://app.example.invalid/settings')).rejects.toThrow('CHECKOUT_PENDING');
 });
 it('does not discard an intent after the provider succeeded but result persistence failed',async()=>{
  mockRpc.mockImplementation(async(name:string)=>name==='acquire_checkout_intent'?{data:{id:'intent-fixture',expires_at:new Date(Date.now()+3600000).toISOString(),customer_id:'cus_fixture'},error:null}:{data:null,error:{message:'unavailable'}});
  for(let i=0;i<2;i++)await expect(getStripeSession('pro_monthly','user-a','https://app.example.invalid/settings')).rejects.toThrow('PERSIST_FAILED');
  expect(mockCreateSession.mock.calls.map((c)=>c[1].idempotencyKey)).toEqual(['esa-checkout-intent-fixture','esa-checkout-intent-fixture']);
 });
});
