const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto');const db=new DatabaseSync(':memory:');let http=401,fail=false,calls=[],messages=[];
const DB={prepare(sql){let args=[];const q={bind(...a){args=a;return q;},exec(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async run(){return q.exec();},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};}};return q;},async batch(stmts){db.exec('BEGIN');try{const r=stmts.map(s=>s.exec());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
const remote=new Map();let loseResponse=false,pending=false;
const c=vm.createContext({console,Intl,URL,Response,URLSearchParams,TextEncoder,crypto:webcrypto,AbortController,setTimeout,clearTimeout,capture:async(e,method,payload)=>{messages.push(payload);return {ok:true};},fetch:async(url,options)=>{
 if(options.method!=='POST'){calls.push({url,method:'GET'});const key=new URL(url).searchParams.get('external_order_id');const found=remote.get(key);return {ok:!!found,status:found?200:404,json:async()=>found||{error:{code:'order_not_found',message:'No order'}}};}
 const body=JSON.parse(options.body);calls.push({url,method:'POST',body});if(fail)throw Error('offline');
 const response={order_id:'remote-'+remote.size,external_order_id:body.external_order_id,status:pending?'processing':'paid',items:pending?[]:[{content:'TEST-KEY'}]};
 if(http===200)remote.set(body.external_order_id,response);
 if(loseResponse){loseResponse=false;throw Error('response lost');}
 return {ok:http===200,status:http,json:async()=>http===200?response:{error:{code:http===402?'insufficient_funds':http===409?'out_of_stock':'invalid_api_key',message:'Bad credentials '+ 'fixture-provider-key'}}};
}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\ncallTg=capture;globalThis.api={ensureDbReady,executeWalletPurchase,refundRejectedExternalWalletOrder,handleUpdate,processBotUpdate,sendOrderDiagnostics,worker};',c);
const env={DB,ADMIN_ID:1,BOT_TOKEN:'fixture-bot-secret'},balance=()=>db.prepare('SELECT balance_usd FROM users WHERE user_id=99').get().balance_usd,last=()=>db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 1').get();
(async()=>{
 await c.api.ensureDbReady(DB);db.prepare("INSERT INTO users(user_id,balance_usd,balance_bdt) VALUES(99,20,2500)").run();for(const[k,v]of [['external_api_url','https://provider.test'],['external_api_key','fixture-provider-key']])db.prepare('UPDATE settings SET value=? WHERE key=?').run(v,k);
 vm.runInContext("handleUpdate=async(update,env)=>{orderStage(env,'wallet.reserve');throw new Error('no such column: provider_request_id fixture-provider-key fixture-bot-secret');};",c);
 await c.api.processBotUpdate({callback_query:{data:'wallet_pay_check_1_1',message:{chat:{id:99}}}},env,'https://bot.test');
 assert.equal(balance(),20);assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n,0);
 const error=db.prepare('SELECT * FROM bot_runtime_errors').get();assert.equal(error.stage,'wallet.reserve');assert(error.detail.includes('no such column'));assert(!error.detail.includes('fixture-provider-key'));assert(!error.detail.includes('fixture-bot-secret'));
 assert(messages.some(m=>m.chat_id===99&&m.text.includes(error.reference)));assert(messages.some(m=>m.chat_id===1&&m.text.includes('wallet.reserve')));
 const before=messages.length;await c.api.processBotUpdate({message:{chat:{id:99},text:'/diagnostics'}},env,'https://bot.test');assert.equal(messages.length,before);
 await c.api.processBotUpdate({message:{chat:{id:1},text:'/diagnostics'}},env,'https://bot.test');assert(messages.at(-1).text.includes('Provider /me: HTTP'));assert(messages.at(-1).text.includes(error.reference));assert(calls.every(x=>x.method==='GET'));
 for(const command of ['  /diagnostics  ','\u200b/diagnostics\u200b',' /diagnostics@MyStoreBot\n']){const count=messages.length;await c.api.processBotUpdate({message:{chat:{id:1},text:command}},env,'https://bot.test');assert.equal(messages.length,count+1);assert(messages.at(-1).text.includes('API / Order Diagnostics'));}
 db.exec('ALTER TABLE orders DROP COLUMN provider_error');await c.api.sendOrderDiagnostics(env,1);assert(messages.at(-1).text.includes('missing columns: provider_error'));assert(messages.every(m=>!m.text?.includes('fixture-provider-key')&&!m.text?.includes('fixture-bot-secret')));
 const response=await c.api.worker.fetch({url:'https://bot.test/api/health'},env);const health=await response.json();assert.equal(typeof health.build,'string');assert.deepEqual(health.configured,{database:true,telegram:true,admin:true});
 await assert.rejects(()=>c.api.ensureDbReady({prepare(){throw Error('database unavailable');}},true),/database unavailable/);
 console.log('PASS: silent checkout exceptions reach customer/admin and persist references; secrets redacted; admin-only diagnostics survives missing columns and stale handlers, makes no purchase; migration failures propagate; public build check');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
