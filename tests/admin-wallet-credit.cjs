const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto');const db=new DatabaseSync(':memory:'),messages=[];
const DB={prepare(sql){let args=[];const q={bind(...a){args=a;return q;},exec(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async run(){return q.exec();},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};}};return q;},async batch(stmts){db.exec('BEGIN');try{const r=stmts.map(s=>s.exec());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
const c=vm.createContext({console,Intl,URL,URLSearchParams,TextEncoder,crypto:webcrypto,AbortController,setTimeout,clearTimeout,capture:async(e,method,payload)=>{messages.push({method,...payload});return {ok:true,result:{message_id:1}};}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\ncallTg=capture;globalThis.api={ensureDbReady,handleUpdate,showAdminUserProfile,showAdminUserHistory,notifyAdminForUser,showWalletHistory,walletChangeSql,handleOrderSearchText,sendOrders};',c);
const env={DB,ADMIN_ID:1},last=()=>messages.filter(m=>m.text).at(-1),buttons=()=>last().reply_markup.inline_keyboard.flat();
const cb=(data,id=1)=>c.api.handleUpdate({callback_query:{id:'cb',data,from:{first_name:'Admin',username:'admin_store'},message:{chat:{id},message_id:1}}},env);
const text=value=>c.api.handleUpdate({message:{chat:{id:1},from:{first_name:'Admin',username:'admin_store'},text:value}},env);
(async()=>{
 await c.api.ensureDbReady(DB);
 db.prepare('INSERT INTO users(user_id,balance_usd,balance_bdt) VALUES(99,10,1250)').run();
 const user=()=>db.prepare('SELECT * FROM users WHERE user_id=99').get();
 const confirm=()=>buttons().find(b=>b.callback_data?.startsWith('adm_wallet_add_ok_')).callback_data;
 await cb('adm_user_view_99');assert(buttons().some(b=>b.callback_data==='adm_wallet_add_99'));assert(buttons().some(b=>b.callback_data==='adm_wallet_zero_99'));
 await cb('adm_wallet_add_99',99);assert(!db.prepare('SELECT * FROM admin_states WHERE user_id=99').get());
 await cb('adm_wallet_add_99');
 for(const invalid of ['0','-1','1.999','1000001','5%','oops']){await text(invalid);assert.equal(user().balance_usd,10);assert.equal(db.prepare('SELECT state FROM admin_states WHERE user_id=1').get().state,'awaiting_wallet_credit');}
 await text('5.25');const ok=confirm();assert(last().text.includes('$15.25'));assert.equal(user().balance_usd,10);
 await cb(ok,99);assert.equal(user().balance_usd,10);
 // Concurrent money added after preview must be preserved.
 db.prepare('UPDATE users SET balance_usd=balance_usd+2,balance_bdt=balance_bdt+250 WHERE user_id=99').run();
 await Promise.all([cb(ok),cb(ok)]);assert.equal(user().balance_usd,17.25);assert.equal(user().balance_bdt,2156.25);
 let rows=db.prepare("SELECT * FROM wallet_history WHERE reason='admin_credit' AND user_id=99").all();assert.equal(rows.length,1);assert.equal(rows[0].usd_delta_cents,525);assert.equal(rows[0].usd_before_cents,1200);assert.equal(rows[0].usd_after_cents,1725);assert.equal(rows[0].bdt_delta_minor,65625);assert(rows[0].reference.startsWith('admin:1:credit:'));
 await cb(ok);assert.equal(user().balance_usd,17.25);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM deposits').get().n,0);
 await cb('adm_wallet_add_99');await text('1');const cancelled=confirm();await cb('adm_user_view_99');await cb(cancelled);assert.equal(user().balance_usd,17.25);
 await cb('adm_credit_99');await text('0.01');let expired=confirm();let state=JSON.parse(db.prepare('SELECT data FROM admin_states WHERE user_id=1').get().data);state.expires=1;db.prepare('UPDATE admin_states SET data=? WHERE user_id=1').run(JSON.stringify(state));await cb(expired);assert.equal(user().balance_usd,17.25);
 await cb('adm_wallet_add_99');await text('0.01');await cb(confirm());assert.equal(user().balance_usd,17.26);
 await cb('adm_wallet_history_99_0');assert(last().text.includes('Admin balance credit'));
 await cb('adm_wallet_zero_99');await cb(buttons().find(b=>b.callback_data?.startsWith('adm_wallet_zero_ok_')).callback_data);assert.equal(user().balance_usd,0);
 await cb('adm_wallet_add_99');await text('2.50');await cb(confirm());assert.equal(user().balance_usd,2.5);
 await cb('adm_wallet_add_999999');assert(last().text.includes('Customer not found'));
 console.log('PASS: exact additive admin credits, cents, concurrent deposits, confirmation/cancel/expiry/replay, authorization, ledger, zero reset and subsequent top-up');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
