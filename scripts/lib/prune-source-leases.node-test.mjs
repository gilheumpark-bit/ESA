import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
test('scheduled metadata sweep deletes expired sources while isolating corrupt records',()=>{
 const root=mkdtempSync(join(tmpdir(),'esa-retention-'));mkdirSync(join(root,'leases'));
 try{
  for(const [name,value] of [['lease-old.json',JSON.stringify({expiresAt:Date.now()-1000})],['lease-live.json',JSON.stringify({expiresAt:Date.now()+60000})],['lease-corrupt.json','{']]) writeFileSync(join(root,'leases',name),value);
  const result=spawnSync(process.execPath,[resolve('scripts/prune-source-leases.mjs')],{env:{...process.env,DRAWING_JOB_STORE_DIR:root},encoding:'utf8'});
  assert.equal(result.status,2);assert.equal(JSON.parse(result.stdout).expiredRemoved,1);
  assert.equal(existsSync(join(root,'leases','lease-old.json')),false);
  assert.equal(existsSync(join(root,'leases','lease-live.json')),true);
  assert.equal(existsSync(join(root,'leases','lease-corrupt.json')),true);
 }finally{rmSync(root,{recursive:true,force:true});}
});
