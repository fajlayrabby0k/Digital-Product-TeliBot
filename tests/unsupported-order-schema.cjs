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
vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\ncallTg=capture;globalThis.api={ensureDbReady,executeWalletPurchase,refundRejectedExternalWalletOrder,handleUpdate,sendOrderDiagnostics};',c);
const env={DB,ADMIN_ID:1},balance=()=>db.prepare('SELECT balance_usd FROM users WHERE user_id=99').get().balance_usd,last=()=>db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 1').get();
(async()=>{
 db.exec("CREATE TABLE orders(id INTEGER PRIMARY KEY,user_id INTEGER,status TEXT, trx_id TEXT,legacy_receipt_key TEXT NOT NULL,unknown_total REAL NOT NULL)");await c.api.ensureDbReady(DB);db.prepare('INSERT INTO users(user_id,balance_usd,balance_bdt) VALUES(99,20,2500)').run();
 const product={id:1,name:'Test',is_external:1,external_id:'remote',api_stock:10};
 await assert.rejects(()=>c.api.executeWalletPurchase(env,99,'Buyer',product,1,5,125,1),error=>error.message.includes('legacy_receipt_key')&&error.message.includes('unknown_total'));
 assert.equal(balance(),20);assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n,0);assert.equal(calls.length,0);
 await c.api.sendOrderDiagnostics(env,1);const report=messages.at(-1).text;assert(report.includes('Unsupported required order fields: legacy_receipt_key, unknown_total'));
 console.log('PASS: all unknown legacy NOT NULL requirements detected together before any wallet debit/provider call and exposed in admin diagnostics');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
