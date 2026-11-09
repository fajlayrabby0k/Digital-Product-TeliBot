const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {webcrypto,createHmac}=require('node:crypto');
const now=Date.now();
const invoice={type:'order',id:1,user_id:99,status:'pending',created_at:new Date(now-60000).toISOString()};
const incoming={transactionId:'1234567890123',transactionTime:now-10000,orderType:'C2C',amount:'5.00000000',currency:'USDT'};
let records=[incoming], claims=[], calls=0, httpOk=true, success=true, used=false, enabled='1';
const DB={prepare(sql){let args;return {bind(...values){args=values;return this;},async first(){
 if(sql.includes('FROM settings'))return {value:enabled};
 if(sql.includes('FROM binance_payment_claims'))return claims.find(c=>c.id===args[0]||(c.type===args[1]&&c.invoice===args[2]))||null;
 return used?{id:7}:null;
},async run(){
 if(sql.startsWith('INSERT INTO binance_payment_claims')){
  if(claims.some(c=>c.id===args[0]||(c.type===args[1]&&c.invoice===args[2])))throw Error('UNIQUE constraint');
  claims.push({id:args[0],type:args[1],invoice:args[2]});
 }
 return {success:true};
}}}};
const env={DB,BINANCE_API_KEY:'fixture-key',BINANCE_API_SECRET:'fixture-secret'};
const context=vm.createContext({console,TextEncoder,crypto:webcrypto,URLSearchParams,AbortController,setTimeout,clearTimeout,URL,
 fetch:async(url,options)=>{
  calls++;
  const u=new URL(url);const signature=u.searchParams.get('signature');u.searchParams.delete('signature');
  assert.equal(u.origin,'https://api.binance.com');assert.equal(u.pathname,'/sapi/v1/pay/transactions');
  assert.equal(signature,createHmac('sha256',env.BINANCE_API_SECRET).update(u.searchParams.toString()).digest('hex'));
  assert.equal(options.headers['X-MBX-APIKEY'],env.BINANCE_API_KEY);
  assert.equal(u.searchParams.get('startTime'),String(Date.parse(invoice.created_at)));
  return {ok:httpOk,json:async()=>({success,code:success?'000000':'-2015',data:records})};
 }});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker = {')+'\nglobalThis.api={verifyBinancePayOrder,completeSuccessfulOrder};',context);
const verify=(settings=env,inv=invoice,expected=5)=>context.api.verifyBinancePayOrder(settings,incoming.transactionId,expected,inv);
(async()=>{
 assert.equal((await verify({DB})).success,false);assert.equal(calls,0);
 assert.equal((await verify(env,{...invoice,status:'completed'})).success,false);
 const paid=await verify();assert.equal(paid.success,true);assert.equal(paid.paidAmount,5);assert.equal(claims.length,1);
 assert.equal((await verify()).reason,'already_used');
 claims=[];
 for(const changes of [{amount:'-5'},{amount:'4.99999999'},{currency:'BTC'},{orderType:'PAY_REFUND'},{transactionTime:now-120000},{transactionTime:now+60000},{status:'PENDING'},{amount:'NaN'}]){
  records=[{...incoming,...changes}];assert.equal((await verify()).success,false);assert.equal(claims.length,0);
 }
 records=[];assert.equal((await verify()).reason,'not_found');
 records=[incoming];httpOk=false;assert.equal((await verify()).success,false);httpOk=true;
 success=false;assert.equal((await verify()).success,false);success=true;
 used=true;assert.equal((await verify()).reason,'already_used');used=false;
 enabled='0';assert.equal((await verify()).reason,'manual_approval');enabled='1';
 const results=await Promise.all([verify(),verify()]);assert.equal(results.filter(r=>r.success).length,1);assert.equal(claims.length,1);
 claims=[];records=[{...incoming,amount:'0.50000000'}];
 assert.equal((await verify(env,{...invoice,type:'deposit'},0)).paidAmount,0.5);
 claims=[];records=[{...incoming,amount:'11.00'}];
 assert.equal((await verify(env,{...invoice,type:'deposit'},5)).reason,'amount_high');
 assert.equal(claims.length,0);
 const originalCreated=invoice.created_at;
 invoice.created_at=new Date(now-10*60000).toISOString();
 records=[{...incoming,transactionTime:now-6*60000}];
 assert.equal((await verify()).reason,'payment_expired');assert.equal(claims.length,0);
 invoice.created_at=originalCreated;
 // A successful payment must not be described as delivered if the provider fails.
 const messages=[],updates=[];
 context.capture=async(_env,_chat,text)=>{messages.push(text);return {ok:true};};
 vm.runInContext('sendMsg=capture; dispatchExternalOrder=async()=>({success:false});',context);
 const deliveryDB={prepare(sql){return {bind(){return this;},async run(){updates.push(sql);}}}};
 await context.api.completeSuccessfulOrder({DB:deliveryDB,ADMIN_ID:1},{id:9,is_external:1,quantity:1,product_id:4},incoming.transactionId,99);
 assert(messages.some(text=>text.includes('Delivery is pending')));
 assert(!messages.some(text=>text.includes('Your Order is Delivered')));
 assert(!updates.some(sql=>sql.includes("status = 'completed'")));
 messages.length=0;updates.length=0;
 vm.runInContext('dispatchExternalOrder=async()=>({success:true,credentials:"TEST-KEY"});processReferralCommission=async()=>{};',context);
 await context.api.completeSuccessfulOrder({DB:deliveryDB,ADMIN_ID:1},{id:10,is_external:1,quantity:1,product_id:4,product_name:'Test'},incoming.transactionId,99);
 assert(messages.some(text=>text.includes('Your Order is Delivered')&&text.includes('TEST-KEY')));
 assert(updates.some(sql=>sql.includes("status = 'completed'")));
 console.log('PASS: signed personal Pay API request, incoming USDT, exact amount, invoice age/status, outgoing/refund rejection, credential/API failure, duplicate/concurrent claims, deposit amount and failed delivery messaging');
})().catch(error=>{console.error(error);process.exitCode=1;});
