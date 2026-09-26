import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { createOnpremiseFetch } from '../onpremise-fetch';
import { validateOnpremiseTarget } from '../onpremise-policy';
async function start(server: Server): Promise<string> { server.listen(0,'127.0.0.1');await once(server,'listening');const a=server.address();if(!a||typeof a==='string')throw Error('fixture');return `http://127.0.0.1:${a.port}`; }
async function stop(server: Server) {server.closeAllConnections();await new Promise<void>((resolve)=>server.close(()=>resolve()));}
describe('on-premise redirected targets never escape the allowlist',()=>{
 const previous=process.env.ONPREMISE_ALLOWED_ORIGINS;
 afterEach(()=>{if(previous===undefined)delete process.env.ONPREMISE_ALLOWED_ORIGINS;else process.env.ONPREMISE_ALLOWED_ORIGINS=previous;});
 it('blocks a real local redirect without reaching the unallowlisted server',async()=>{
  let targetHits=0;const target=createServer((_req,res)=>{targetHits++;res.end('not allowed');});const url=await start(target);
  const source=createServer((_req,res)=>{res.writeHead(302,{Location:url});res.end();});const base=await start(source);
  try{process.env.ONPREMISE_ALLOWED_ORIGINS=base;await expect(createOnpremiseFetch(base)(base)).rejects.toThrow();expect(targetHits).toBe(0);await expect(createOnpremiseFetch(base)(url)).rejects.toThrow('BLOCKED');}
  finally{await stop(source);await stop(target);}
 });
 it('rejects query/fragment target reinterpretation and permits a direct allowlisted request',async()=>{
  const server=createServer((_req,res)=>res.end('ok'));const base=await start(server);
  try{process.env.ONPREMISE_ALLOWED_ORIGINS=base;expect(validateOnpremiseTarget(`${base}?forward=/private`).ok).toBe(false);expect(validateOnpremiseTarget(`${base}#x`).ok).toBe(false);const response=await createOnpremiseFetch(base)(new URL(base));expect(await response.text()).toBe('ok');}
  finally{await stop(server);}
 });
});
