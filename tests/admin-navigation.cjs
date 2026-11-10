const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto');
const sqlite=new DatabaseSync(':memory:'),messages=[];
const DB={prepare(sql){let args=[];const q={bind(...a){args=a;return q;},exec(){const r=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async run(){return q.exec();},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};return q;},async batch(statements){sqlite.exec('BEGIN');try{const r=statements.map(s=>s.exec());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const context=vm.createContext({console,Intl,URL,URLSearchParams,TextEncoder,crypto:webcrypto,AbortController,setTimeout,clearTimeout,capture:async(_env,method,payload)=>{messages.push({method,...payload});return {ok:true,result:{username:'TestBot',message_id:9}};}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\ncallTg=capture;globalThis.api={ensureDbReady,handleUpdate};',context);
const {api}=context,env={DB,ADMIN_ID:1};
const text=(value,id=1)=>api.handleUpdate({message:{chat:{id},from:{first_name:'Tester'},text:value,reply_to_message:{text:'Order ID: #1'}}},env);
(async()=>{
 await api.ensureDbReady(DB);for(const id of [1,99])sqlite.prepare('INSERT INTO users(user_id) VALUES(?)').run(id);
 sqlite.prepare("INSERT INTO orders(id,user_id,product_id,payment_method,amount_usd,status) VALUES(1,1,2,'BKASH',5,'pending')").run();
 const states=['awaiting_stock','awaiting_new_price','awaiting_deposit_amount','awaiting_product_icon','awaiting_setting_binance','awaiting_redeem_amount','unknown_legacy_state'];
 for(const state of states)for(const command of ['/start','/admin','/start@TestBot','/cancel']){
  sqlite.prepare('INSERT OR REPLACE INTO admin_states(user_id,state,data) VALUES(1,?,?)').run(state,'2');
  sqlite.prepare("INSERT OR REPLACE INTO user_states(user_id,state,data) VALUES(1,'awaiting_custom_qty','2')").run();
  messages.length=0;await text(command);
  assert.equal(sqlite.prepare('SELECT * FROM admin_states WHERE user_id=1').get(),undefined);
  assert.equal(sqlite.prepare('SELECT * FROM user_states WHERE user_id=1').get(),undefined);
  assert(messages.some(m=>m.text?.includes(command==='/admin'||command==='/cancel'?'Administration Control Center':'Welcome to SMART SUBS STORE')));
  assert.equal(sqlite.prepare('SELECT trx_id FROM orders WHERE id=1').get().trx_id,'','navigation replies must not be processed as payment IDs');
 }
 sqlite.prepare("INSERT INTO admin_states(user_id,state,data) VALUES(1,'awaiting_deposit_amount','1')").run();
 messages.length=0;await text('10');assert(messages.some(m=>m.text?.includes('previous admin action was reset')));assert.equal(sqlite.prepare('SELECT * FROM admin_states WHERE user_id=1').get(),undefined);assert.equal(sqlite.prepare('SELECT balance_usd FROM users WHERE user_id=1').get().balance_usd,0);
 messages.length=0;await text('/start',99);assert(messages.some(m=>m.text?.includes('Welcome to SMART SUBS STORE')));assert(!messages.some(m=>m.text?.includes('Administration Control Center')));
 console.log('PASS: admin /start, /admin, /cancel and addressed commands recover from legacy/admin/quantity states; navigation replies do not submit payments; users retain normal startup');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>sqlite.close());
