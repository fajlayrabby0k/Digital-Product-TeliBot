const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto');const db=new DatabaseSync(':memory:');let http=401,fail=false,calls=[],messages=[];
const DB={prepare(sql){let args=[];const q={bind(...a){args=a;return q;},exec(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async run(){return q.exec();},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};}};return q;},async batch(stmts){db.exec('BEGIN');try{const r=stmts.map(s=>s.exec());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
const remote=new Map();let loseResponse=false,pending=false;
const c=vm.createContext({console,Intl,URL,URLSearchParams,TextEncoder,crypto:webcrypto,AbortController,setTimeout,clearTimeout,capture:async(e,method,payload)=>{messages.push(payload);return {ok:true};},fetch:async(url,options)=>{
 if(options.method!=='POST'){calls.push({url,method:'GET'});const key=new URL(url).searchParams.get('external_order_id');const found=remote.get(key);return {ok:!!found,status:found?200:404,json:async()=>found||{error:{code:'order_not_found',message:'No order'}}};}
 const body=JSON.parse(options.body);calls.push({url,method:'POST',body});if(fail)throw Error('offline');
 const response={order_id:'remote-'+remote.size,external_order_id:body.external_order_id,status:pending?'processing':'paid',items:pending?[]:[{content:'TEST-KEY'}]};
 if(http===200)remote.set(body.external_order_id,response);
 if(loseResponse){loseResponse=false;throw Error('response lost');}
 return {ok:http===200,status:http,json:async()=>http===200?response:{error:{code:http===402?'insufficient_funds':http===409?'out_of_stock':'invalid_api_key',message:'Bad credentials '+ 'fixture-provider-key'}}};
}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\ncallTg=capture;globalThis.api={ensureDbReady,executeWalletPurchase,refundRejectedExternalWalletOrder,handleUpdate};',c);
const env={DB,ADMIN_ID:1},balance=()=>db.prepare('SELECT balance_usd FROM users WHERE user_id=99').get().balance_usd,last=()=>db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 1').get();
(async()=>{await c.api.ensureDbReady(DB);db.prepare('INSERT INTO users(user_id,balance_usd,balance_bdt) VALUES(99,20,2500)').run();for(const[k,v]of [['external_api_url','https://provider.test'],['external_api_key','fixture-provider-key']])db.prepare('UPDATE settings SET value=? WHERE key=?').run(v,k);db.prepare("UPDATE products SET is_external=1,external_id='remote-product',api_stock=20 WHERE id=1").run();const prod={id:1,is_external:1,external_id:'remote-product',api_stock:20,name:'Product'};
 const buy=()=>c.api.executeWalletPurchase(env,99,'Buyer',prod,1,5,125,1);
 await buy();let o=last();assert.equal(o.status,'refunded');assert.equal(balance(),20);assert(o.provider_error.includes('HTTP 401'));assert(!o.provider_error.includes('fixture-provider-key'));await Promise.all([c.api.refundRejectedExternalWalletOrder(env,o.id,99),c.api.refundRejectedExternalWalletOrder(env,o.id,99)]);assert.equal(balance(),20);
 fail=true;await buy();o=last();assert.equal(o.status,'paid_pending_delivery');assert.equal(balance(),15);fail=false;
 http=200;await buy();o=last();assert.equal(o.status,'completed');assert.equal(o.delivery_data,'TEST-KEY');assert.equal(balance(),10);
 await Promise.all([buy(),buy(),buy()]);assert.equal(balance(),0);assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n,5);assert.equal(calls.filter(x=>x.method==='POST').length,5);assert(calls.filter(x=>x.method==='POST').every(x=>/^[A-Za-z0-9._:-]{8,64}$/.test(x.body.external_order_id)));
 const before=calls.length;await c.api.executeWalletPurchase(env,99,'Buyer',prod,-1,-5,125,1);assert.equal(balance(),0);assert.equal(calls.length,before);
 // A lost success response is recovered with a read, without charging/buying twice.
 db.prepare('UPDATE users SET balance_usd=20,balance_bdt=2500 WHERE user_id=99').run();loseResponse=true;await buy();assert.equal(last().status,'completed');assert.equal(balance(),15);
 // Accepted orders with codes arriving later use GET recovery, not a second purchase.
 pending=true;await buy();o=last();assert.equal(o.status,'paid_pending_delivery');const beforeRetry=calls.filter(x=>x.method==='POST').length;remote.set(o.provider_request_id,{order_id:'late',external_order_id:o.provider_request_id,items:[{content:'LATE-KEY'}]});const cb=(id,user=99)=>c.api.handleUpdate({callback_query:{id:'cb',data:'provider_retry_'+id,from:{first_name:'Buyer'},message:{chat:{id:user},message_id:1}}},env);await cb(o.id,100);assert.equal(last().status,'paid_pending_delivery');await cb(o.id);assert.equal(last().status,'completed');assert.equal(last().delivery_data,'LATE-KEY');assert.equal(calls.filter(x=>x.method==='POST').length,beforeRetry);assert.equal(balance(),10);await cb(o.id);assert.equal(balance(),10);
 // An uncertain request later confirmed absent and rejected can safely refund on retry.
 fail=true;await buy();const uncertain=last();assert.equal(balance(),5);fail=false;http=402;await cb(uncertain.id);assert.equal(last().status,'refunded');assert.equal(balance(),10);
 await c.api.handleUpdate({callback_query:{id:'history',data:'my_orders',from:{first_name:'Buyer'},message:{chat:{id:99},message_id:1}}},env);assert(messages.at(-1).text.includes('Wallet payment refunded'));
 pending=false;for(const status of [402,409]){http=status;await buy();assert.equal(last().status,'refunded');assert.equal(balance(),10);}
 console.log('PASS: documented provider errors refund once; lost responses recover by lookup; pending orders deliver via owner-only retry without a second POST; successful codes persist; concurrent purchases cannot overdraw; secrets redacted');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
