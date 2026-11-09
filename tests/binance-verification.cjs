const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
let credentials=false, response={status:'FAIL'}, httpOk=true, requests=0;
const DB={prepare(sql){let args;return {bind(...values){args=values;return this;},async first(){
 if(sql.includes('FROM settings'))return {value:args[0]==='binance_auto_verify'?'1':credentials?'test-credential':''};
 return null;
}}}};
const context=vm.createContext({console,TextEncoder,crypto:webcrypto,fetch:async()=>{requests++;return {ok:httpOk,json:async()=>response}}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker = {')+'\nglobalThis.verify=verifyBinancePayOrder;',context);
(async()=>{
 for(const id of ['1234567890123','FAKEORDER1234']) {
   assert.equal((await context.verify({DB},id,5)).success,false,'a plausible ID must not grant products or wallet credit');
 }
 assert.equal(requests,0);
 credentials=true;
 assert.equal((await context.verify({DB},'1234567890123',5)).success,false,'API refusal must never fall back to accepting a valid-looking ID');
 httpOk=false;
 assert.equal((await context.verify({DB},'1234567890123',5)).success,false);
 httpOk=true;response={status:'SUCCESS',data:{status:'UNPAID',orderAmount:'5'}};
 assert.equal((await context.verify({DB},'1234567890123',5)).success,false);
 console.log('PASS: no credentials, fabricated IDs, rejected API requests and unpaid transactions cannot trigger automatic delivery');
})().catch(error=>{console.error(error);process.exitCode=1;});
