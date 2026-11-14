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
 // Reproduce the production initialization error against a populated historical preorder table.
 db.exec("CREATE TABLE preorders(id INTEGER PRIMARY KEY,user_id INTEGER,product_name TEXT NOT NULL,status TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);INSERT INTO preorders VALUES(71,99,'Historical product','pending','2026-01-01 00:00:00')");
 assert.throws(()=>db.exec('CREATE INDEX IF NOT EXISTS preorders_product_status ON preorders(product_id, status)'),/no such column: product_id/);
 await c.api.ensureDbReady(DB);
 const saved=db.prepare('SELECT * FROM preorders WHERE id=71').get();assert.equal(saved.user_id,99);assert.equal(saved.product_name,'Historical product');assert.equal(saved.created_at,'2026-01-01 00:00:00');assert.equal(saved.product_id,null);assert.equal(saved.status,'pending');
 assert(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='preorders_product_status'").get());
 await c.api.ensureDbReady(DB,true);assert.equal(db.prepare('SELECT COUNT(*) n FROM preorders').get().n,1);
 db.prepare('INSERT INTO users(user_id,balance_usd,balance_bdt) VALUES(99,20,2500)').run();for(const[k,v]of [['external_api_url','https://provider.test'],['external_api_key','fixture-provider-key']])db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').run(k,v);
 db.prepare("UPDATE products SET is_external=1,external_id='remote-product',api_stock=20,price_usd=5,custom_price_usd=5 WHERE id=1").run();http=200;
 const cb=data=>c.api.handleUpdate({callback_query:{id:'cb',data,from:{first_name:'Buyer'},message:{chat:{id:99},message_id:12}}},env);
 await c.api.handleUpdate({message:{chat:{id:99},from:{first_name:'Buyer'},text:'/start'}},env);assert(messages.some(m=>m.text?.includes('Welcome')||m.reply_markup));
 await cb('preorder_1');const newPreorder=db.prepare('SELECT * FROM preorders WHERE product_id=1').get();assert(newPreorder.product_name);assert(newPreorder.created_at);assert.equal(newPreorder.user_id,99);
 await cb('buynow_1_1');assert(messages.at(-1).text.includes('Order Preview'));await cb('wallet_pay_check_1_1');assert.equal(last().status,'completed');assert.equal(last().delivery_data,'TEST-KEY');assert.equal(balance(),15);assert.equal(db.prepare('SELECT COUNT(*) n FROM preorders WHERE id=71').get().n,1);
 console.log('PASS: reproduced legacy missing product_id startup failure; migration preserves all historical preorder fields without invented mappings; repeated migration, /start, Buy Now and wallet provider delivery succeed');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
