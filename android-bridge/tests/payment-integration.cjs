const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{webcrypto,createHmac}=require('node:crypto');
const sqlite=new DatabaseSync(':memory:'),messages=[],supplierCalls=[];let clock=Date.now(),failBalance=false;
const DB={prepare(sql){let args=[];const q={bind(...a){args=a;return q;},exec(){if(failBalance&&sql.startsWith('UPDATE users SET balance_usd=COALESCE'))throw Error('injected write failure');const r=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async run(){return q.exec();},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};return q;},async batch(statements){sqlite.exec('BEGIN');try{const r=statements.map(s=>s.exec());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const context=vm.createContext({console,Intl,URL,URLSearchParams,TextEncoder,TextDecoder,Response,crypto:webcrypto,AbortController,setTimeout,clearTimeout,fetch:async(url,options)=>{if(options.method!=='POST'||!String(url).endsWith('/api/reseller/orders'))throw Error('Unexpected supplier request');supplierCalls.push(JSON.parse(options.body));return {ok:true,status:201,json:async()=>({order_id:'supplier-order-1',status:'paid',items:[{content:'SUPPLIER-DELIVERY-CONTENT'}]})};},Date:class extends Date{static now(){return clock;}},capture:async(_env,method,payload)=>{messages.push({method,...payload});return {ok:true,result:{message_id:9}};}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../../_worker.js'),'utf8').replace('export default {','const worker={')+'\ncallTg=capture;globalThis.api={ensureDbReady,handleUpdate,receiveMobileBridgeReceipt,settleMobileInvoice,createMobileInvoice,completeSuccessfulOrder,executeWalletPurchase};',context);
const {api}=context,env={DB,ADMIN_ID:1,MOBILE_BRIDGE_SECRET:'a'.repeat(64),MOBILE_BRIDGE_DEVICE_ID:'phone'},account='01712345678';let serial=100000;
const cb=(data,id=99)=>api.handleUpdate({callback_query:{id:'cb',data,from:{first_name:'Buyer'},message:{chat:{id},message_id:9}}},env);
const text=(value,id=99)=>api.handleUpdate({message:{chat:{id},from:{first_name:'Buyer'},text:value}},env);
const row=(table,id)=>sqlite.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id),lastInvoice=()=>sqlite.prepare('SELECT * FROM deposits ORDER BY id DESC LIMIT 1').get(),balance=(id=99)=>sqlite.prepare('SELECT balance_usd FROM users WHERE user_id=?').get(id).balance_usd;
async function invoice(method='bkash',user=99){await cb('dep_setmeth_'+method+'_5.00',user);return lastInvoice();}
function trx(method){return method==='bkash'?'TEST'+String(serial++).padStart(6,'0'):'NG'+String(serial++).padStart(6,'0');}
async function receipt(method,id,options={}){const body={version:1,eventId:webcrypto.randomUUID(),deviceId:'phone',method,account,trxId:id,amountMinor:62500,receivedAt:clock,paidAt:Math.floor(clock/60000)*60000,...options};const raw=JSON.stringify(body),ts=String(Math.floor(clock/1000));const sig=createHmac('sha256',env.MOBILE_BRIDGE_SECRET).update(raw+ts).digest('hex');const response=await api.receiveMobileBridgeReceipt(new Request('https://test/api/mobile-receipt',{method:'POST',body:raw,headers:{'X-Timestamp':ts,'X-Signature':sig}}),env);assert.equal(response.status,200);return body;}
async function submit(d,t,user=99){await cb('mobile_enter_deposit_'+d.id,user);await text(t,user);}
(async()=>{
 const fixtures=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));assert.equal(fixtures.length,8);
 await api.ensureDbReady(DB);for(const id of [1,99,100])sqlite.prepare('INSERT INTO users(user_id) VALUES(?)').run(id);
 for(const method of ['bkash','nagad'])sqlite.prepare('UPDATE settings SET value=? WHERE key=?').run(account,method+'_num');
 for(const [key,value] of [['external_api_url','https://supplier.test'],['external_api_key','fixture-api-key']])sqlite.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').run(key,value);
 let expectedBalance=0;
 for(let i=0;i<fixtures.length;i++){
  const parsed=fixtures[i],isExternal=i===3||i===5,isDeposit=i>=6,type=isDeposit?'deposit':'order',usd=Math.round(parsed.amountMinor/100/125*100)/100;clock=parsed.paidAt-30000;
  const product=sqlite.prepare('INSERT INTO products(name,description,price_usd,price_bdt,is_external,external_id,api_stock,cost_price_usd,custom_price_usd) VALUES(?,?,?,?,?,?,?,?,?)').run('SMS integration '+i,'Fixture product',usd,parsed.amountMinor/100,isExternal?1:0,isExternal?'remote-fixture':'',isExternal?4:0,isExternal?0.15:0,isExternal?usd:0).lastInsertRowid;
  if(!isExternal)sqlite.prepare('INSERT INTO inventory(product_id,item_data) VALUES(?,?)').run(product,'LOCAL-DELIVERY-'+i);
  // Payment selection creates the real invoice; API order is created directly to avoid unrelated catalog mocks.
  let order;
  if(isDeposit){const id=sqlite.prepare("INSERT INTO deposits(user_id,method,amount_usd,amount_bdt) VALUES(99,?,?,?)").run(parsed.method.toUpperCase(),usd,parsed.amountMinor/100).lastInsertRowid;await api.createMobileInvoice(env,type,id,99,parsed.method,account,usd,parsed.amountMinor/100);order=row('deposits',id);}
  else if(!isExternal){await cb('pay_'+parsed.method+'_'+product+'_1');order=sqlite.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 1').get();}
  else{const id=sqlite.prepare("INSERT INTO orders(user_id,product_id,product_name,quantity,payment_method,amount_usd,amount_bdt) VALUES(99,?,'API fixture',1,?,?,?)").run(product,parsed.method.toUpperCase(),usd,parsed.amountMinor/100).lastInsertRowid;await api.createMobileInvoice(env,'order',id,99,parsed.method,account,usd,parsed.amountMinor/100);order=row('orders',id);}
  assert(order);assert.equal(order.amount_bdt,parsed.amountMinor/100);assert.equal(order.status,'pending');clock=parsed.paidAt+5000;
  if(i%2===1){await cb('mobile_enter_'+type+'_'+order.id);await text(parsed.trxId);assert.equal(row(isDeposit?'deposits':'orders',order.id).status,'pending');}
  const payload={version:1,eventId:webcrypto.randomUUID(),deviceId:'phone',account,receivedAt:clock,...parsed},raw=JSON.stringify(payload),ts=String(Math.floor(clock/1000)),signature=createHmac('sha256',env.MOBILE_BRIDGE_SECRET).update(raw+ts).digest('hex');
  const upload=()=>api.receiveMobileBridgeReceipt(new Request('https://store.test/api/mobile-receipt',{method:'POST',body:raw,headers:{'X-Timestamp':ts,'X-Signature':signature}}),env);
  assert.equal((await upload()).status,200);
  if(i%2===0){assert.equal(row(isDeposit?'deposits':'orders',order.id).status,'pending');await cb('mobile_enter_'+type+'_'+order.id);await text(parsed.trxId);}
  assert.equal(row(isDeposit?'deposits':'orders',order.id).status,'completed');assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM mobile_payment_claims WHERE method=? AND trx_id=?').get(parsed.method,parsed.trxId).n,1);
  const documents=()=>messages.filter(m=>m.chat_id===99&&m.document?.filename==='Order-'+row('orders',order.id)?.public_order_id+'.txt');
  if(isDeposit){expectedBalance+=usd;assert.equal(balance(),expectedBalance);assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM wallet_history WHERE user_id=99 AND reason='deposit' AND reference=?").get('deposit:'+order.id).n,1);}
  else{assert.equal(documents().length,1);assert(documents()[0].document.content.includes(isExternal?'SUPPLIER-DELIVERY-CONTENT':'LOCAL-DELIVERY-'+i));}
  assert.equal((await upload()).status,200);await cb('mobile_retry_'+type+'_'+order.id);if(!isDeposit)assert.equal(documents().length,1);assert.equal(balance(),expectedBalance);
  // Another account cannot reuse an already verified receipt.
  const other=sqlite.prepare("INSERT INTO deposits(user_id,method,amount_usd,amount_bdt) VALUES(100,?,?,?)").run(parsed.method.toUpperCase(),usd,parsed.amountMinor/100).lastInsertRowid;await api.createMobileInvoice(env,'deposit',other,100,parsed.method,account,usd,parsed.amountMinor/100);await cb('mobile_enter_deposit_'+other,100);await text(parsed.trxId,100);assert.equal(balance(100),0);assert.equal(row('deposits',other).status,'pending');
 }
 assert.equal(supplierCalls.length,2);assert.equal(supplierCalls[0].product_id,'remote-fixture');assert.equal(supplierCalls[0].quantity,1);assert(supplierCalls[0].external_order_id);
 console.log('PASS: actual Android parser output → signed SMS upload → user TrxID → once-only payment claim → local/API order → .txt delivery or exact-once wallet deposit; bKash/Nagad with/without Ref, SMS before/after submission, Nagad Cash In Received, supplier called once per API order and reused TrxID refused');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>sqlite.close());
