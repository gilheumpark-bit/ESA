import { NextRequest } from 'next/server';
import { POST } from '../route';
import { __resetTokenBudget, checkTokenBudget } from '@/lib/token-budget';
import { resetRateLimits } from '@/lib/rate-limit';
const mockStream=jest.fn((_options?:unknown)=>({textStream:(async function*(){yield 'ok';})(),finishReason:Promise.resolve('stop'),usage:Promise.resolve({totalTokens:10})}));
jest.mock('ai',()=>({streamText:(options:unknown)=>mockStream(options)}));
jest.mock('@ai-sdk/openai',()=>({createOpenAI:()=>()=>({})}));
jest.mock('@/lib/auth-helpers',()=>({extractVerifiedUserId:jest.fn()}));
const valid={provider:'openai',model:'fixture',messages:[{role:'user',content:'hello'}]};
function req(body:unknown,signal?:AbortSignal){return new NextRequest('http://localhost/api/chat',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json','x-fixture-ip':'198.51.100.81'},body:JSON.stringify(body),signal});}
describe('chat rejects malformed values before provider or budget side effects',()=>{
 const env={...process.env};
 beforeEach(()=>{mockStream.mockClear();__resetTokenBudget();resetRateLimits();process.env.OPENAI_API_KEY='server-fixture';process.env.TRUSTED_CLIENT_IP_HEADER='x-fixture-ip';});
 afterAll(()=>{process.env=env;});
 it.each([{...valid,maxTokens:'NaN'},{...valid,messages:[{role:'user',content:175}]},{...valid,messages:[{role:['user'],content:'hello'}]}])('returns 400 without poisoning the quota %#',async(body)=>{
  expect((await POST(req(body))).status).toBe(400);expect(mockStream).not.toHaveBeenCalled();expect(checkTokenBudget('198.51.100.81',500001).allowed).toBe(false);expect(checkTokenBudget('198.51.100.81',500000).allowed).toBe(true);
 });
 it('does not call the provider for a request already aborted',async()=>{const c=new AbortController();c.abort();expect((await POST(req(valid,c.signal))).status).toBe(499);expect(mockStream).not.toHaveBeenCalled();});
 it('passes a cancellation signal and bounded timeout into the remote SDK',async()=>{
  const response=await POST(req(valid));expect(response.status).toBe(200);await response.text();
  expect(mockStream).toHaveBeenCalledWith(expect.objectContaining({abortSignal:expect.any(AbortSignal),timeout:{totalMs:120000,chunkMs:30000},maxRetries:0}));
 });
});
