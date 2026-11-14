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
 db.exec("CREATE TABLE orders(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,username TEXT,amount REAL NOT NULL,product_name TEXT NOT NULL,payment_method TEXT NOT NULL,trx_id TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL);INSERT INTO orders VALUES(71,88,'old-user',2468,'Historical product','WALLET','OLD-RECEIPT','completed','2026-01-01 00:00:00')");
 assert.throws(()=>db.prepare("INSERT INTO orders(user_id,product_name,payment_method,trx_id,status,created_at) VALUES(99,'Test','WALLET','X','pending','2026-01-01')").run(),/NOT NULL constraint failed: orders.amount/);
 const old=db.prepare('SELECT * FROM orders WHERE id=71').get();await c.api.ensureDbReady(DB);await c.api.ensureDbReady(DB,true);for(const [key,value]of Object.entries(old))assert.equal(db.prepare('SELECT * FROM orders WHERE id=71').get()[key],value);
 db.prepare('INSERT INTO users(user_id,balance_usd,balance_bdt) VALUES(99,20,2500)').run();for(const[k,v]of [['external_api_url','https://provider.test'],['external_api_key','fixture-provider-key']])db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').run(k,v);
 db.prepare("UPDATE products SET is_external=1,external_id='remote-product',api_stock=20,price_usd=5,custom_price_usd=5 WHERE id=1").run();http=200;
 const cb=data=>c.api.handleUpdate({callback_query:{id:'cb',data,from:{first_name:'Buyer'},message:{chat:{id:99},message_id:12}}},env);
 await cb('buynow_1_1');await cb('wallet_pay_check_1_1');let current=last();assert.equal(current.status,'completed');assert.equal(current.amount,5);assert.equal(current.amount_usd,5);assert.equal(current.product_name,'External Product');assert.equal(current.delivery_data,'TEST-KEY');assert(current.created_at);assert.equal(balance(),15);assert.equal(calls.filter(c=>c.method==='POST').length,1);
 await cb('pay_bkash_1_1');current=last();assert.equal(current.status,'pending');assert.equal(current.amount,5);assert.equal(current.trx_id,'');assert(current.product_name);assert(current.created_at);assert.equal(balance(),15);
 const local=db.prepare("SELECT * FROM products WHERE id=2").get();await c.api.executeWalletPurchase(env,99,'Buyer',local,1,5,125,12);current=last();assert.equal(current.status,'completed');assert.equal(current.amount,5);assert.equal(current.product_name,local.name);assert.equal(balance(),10);
 assert.equal(db.prepare('SELECT amount FROM orders WHERE id=71').get().amount,2468);
 console.log('PASS: reproduced legacy orders.amount NOT NULL failure; preserved historical values/constraints; API wallet, direct payment and local wallet orders fill legacy amount/name/trx/time fields and deliver correctly');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
