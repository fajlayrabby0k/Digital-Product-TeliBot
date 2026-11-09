const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
let now=10000, calls=0, stock=8, fail=false;
const context=vm.createContext({console,URL,Request,Response,AbortController,setTimeout,clearTimeout,
  Date:class extends Date {static now(){return now;}},
  fetch:async()=>{calls++;await new Promise(r=>setTimeout(r,40));if(fail)throw Error('offline');return Response.json({products:[{id:'a',stock,price:2,available:true}]});}});
const source=fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker = {');
vm.runInContext(source+'\nglobalThis.api={readProviderCatalog,worker};',context);
const {api}=context;
(async()=>{
 const db={};
 const start=performance.now();
 assert.equal((await api.readProviderCatalog(db,'https://provider.test','test',false))[0].stock,8);
 const cold=performance.now()-start;
 const warmStart=performance.now();
 for(let i=0;i<10;i++)await api.readProviderCatalog(db,'https://provider.test','test',false);
 const warm=performance.now()-warmStart;
 assert.equal(calls,1,'ten warm browsing requests must not call the provider again');
 stock=2;
 assert.equal((await api.readProviderCatalog(db,'https://provider.test','test',true))[0].stock,2);
 assert.equal(calls,2,'checkout/refresh must bypass the warm cache');
 now+=5001;stock=0;
 const concurrent=await Promise.all([api.readProviderCatalog(db,'https://provider.test','test',false),api.readProviderCatalog(db,'https://provider.test','test',false)]);
 assert.equal(calls,3,'concurrent refreshes must share one in-flight request');
 assert.equal(concurrent[0][0].stock,0);
 await api.readProviderCatalog(db,'https://provider.test','changed-key',false);
 assert.equal(calls,4,'changed credentials must not reuse the old cache');
 fail=true;
 await assert.rejects(api.readProviderCatalog(db,'https://provider.test','changed-key',true));
 fail=false;const before=calls;
 await api.readProviderCatalog(db,'https://provider.test','changed-key',false);
 assert.equal(calls,before+1,'failed verification must invalidate cached stock');
 // Verify webhook acknowledgement does not wait for processing, and retains its promise.
 let finish;
 context.work=()=>new Promise(resolve=>{finish=resolve;});
 vm.runInContext('handleUpdate=work;',context);
 const retained=[];
 const response=await api.worker.fetch(new Request('https://worker.test/api/webhook',{method:'POST',body:'{}'}),{}, {waitUntil:promise=>retained.push(promise)});
 assert.equal(await response.text(),'OK');assert.equal(retained.length,1);
 let done=false;retained[0].then(()=>{done=true;});await Promise.resolve();assert.equal(done,false);
 finish();await retained[0];
 console.log(`PASS: cold simulated API ${cold.toFixed(1)}ms; ten cached reads ${warm.toFixed(1)}ms (local mock, not live bot timing)`);
 console.log('PASS: cache expiry, zero stock, forced fresh checks, concurrent deduplication, credential changes, failure invalidation and retained webhook processing');
})().catch(error=>{console.error(error);process.exitCode=1;});
