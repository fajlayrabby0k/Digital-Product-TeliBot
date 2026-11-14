const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto');const db=new DatabaseSync(':memory:');let http=401,fail=false,calls=[],messages=[];
const DB={prepare(sql){let args=[];const q={bind(...a){args=a;return q;},exec(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async run(){return q.exec();},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};}};return q;},async batch(stmts){db.exec('BEGIN');try{const r=stmts.map(s=>s.exec());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
const remote=new Map();let loseResponse=false,pending=false;
const c=vm.createContext({console,Intl,URL,URLSearchParams,TextEncoder,crypto:webcrypto,AbortController,setTimeout,clearTimeout,capture:async(e,method,payload)=>{messages.push(payload);return {ok:true};},fetch:async(url,options)=>{
 if(new URL(url).pathname.endsWith('/products')){return {ok:true,status:200,json:async()=>({products:[{id:'remote-product',name:'External Product',price:5,stock:20}]})};}
 if(options.method!=='POST'){calls.push({url,method:'GET'});const key=new URL(url).searchParams.get('external_order_id');const found=remote.get(key);return {ok:!!found,status:found?200:404,json:async()=>found||{error:{code:'order_not_found',message:'No order'}}};}
 const body=JSON.parse(options.body);calls.push({url,method:'POST',body});if(fail)throw Error('offline');
 const response={order_id:'remote-'+remote.size,external_order_id:body.external_order_id,status:pending?'processing':'paid',items:pending?[]:Array.from({length:body.quantity},()=>({content:'TEST-KEY'}))};
 if(http===200)remote.set(body.external_order_id,response);
 if(loseResponse){loseResponse=false;throw Error('response lost');}
 return {ok:http===200,status:http,json:async()=>http===200?response:{error:{code:http===402?'insufficient_funds':http===409?'out_of_stock':'invalid_api_key',message:'Bad credentials '+ 'fixture-provider-key'}}};
}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\ncallTg=capture;globalThis.api={ensureDbReady,executeWalletPurchase,refundRejectedExternalWalletOrder,handleUpdate};',c);
const env={DB,ADMIN_ID:1},balance=()=>db.prepare('SELECT balance_usd FROM users WHERE user_id=99').get().balance_usd,last=()=>db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 1').get();
(async()=>{
 await c.api.ensureDbReady(DB);db.prepare('INSERT INTO users(user_id,balance_usd,balance_bdt) VALUES(99,20,2500)').run();
 for(const[k,v]of [['external_api_url','https://provider.test'],['external_api_key','fixture-provider-key'],['default_profit_margin','0']])db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').run(k,v);
 db.prepare("UPDATE products SET is_external=1,external_id='remote-product',api_stock=20,price_usd=5,custom_price_usd=5 WHERE id=1").run();http=200;
 const cb=data=>c.api.handleUpdate({callback_query:{id:'cb',data,from:{first_name:'Buyer'},message:{chat:{id:99},message_id:12}}},env);
 await cb('buynow_1_1');let preview=messages.at(-1);assert(preview.text.includes('Order Preview'));assert.equal(preview.message_id,undefined,'Buy Now must send a fresh message below newer chat content');assert(preview.reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='wallet_pay_check_1_1'));assert.equal(balance(),20);assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n,0);
 await cb('qty_1_2');preview=messages.at(-1);assert.equal(preview.message_id,12);assert(preview.reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='wallet_pay_check_1_2'));
 await cb('wallet_pay_check_1_2');assert.equal(last().status,'completed');assert.equal(last().quantity,2);assert.equal(balance(),10);assert.equal(calls.filter(x=>x.method==='POST').length,1);assert(messages.some(m=>m.text?.includes('TEST-KEY')));
 console.log('PASS: Buy Now sends a fresh visible preview without charging; quantity edits preserve the preview; Wallet Payment invokes real stock check and exactly one provider purchase/delivery');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
