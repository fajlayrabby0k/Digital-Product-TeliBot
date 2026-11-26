const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto');const db=new DatabaseSync(':memory:'),messages=[];
const DB={prepare(sql){let args=[];const q={bind(...a){args=a;return q;},exec(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async run(){return q.exec();},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};}};return q;},async batch(stmts){db.exec('BEGIN');try{const r=stmts.map(s=>s.exec());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
const c=vm.createContext({console,Intl,URL,URLSearchParams,TextEncoder,crypto:webcrypto,AbortController,setTimeout,clearTimeout,capture:async(e,method,payload)=>{messages.push({method,...payload});return {ok:true,result:{message_id:1}};}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\ncallTg=capture;globalThis.api={ensureDbReady,handleUpdate,showAdminUserProfile,showAdminUserHistory,notifyAdminForUser,recordPaymentVerification,showPaymentDashboard,showPaymentDashboardDetail};',c);
const env={DB,ADMIN_ID:1},last=()=>messages.filter(m=>m.text).at(-1),buttons=()=>last().reply_markup.inline_keyboard.flat();
const cb=(data,id=1)=>c.api.handleUpdate({callback_query:{id:'cb',data,from:{first_name:'Admin',username:'admin_store'},message:{chat:{id},message_id:1}}},env);
const text=value=>c.api.handleUpdate({message:{chat:{id:1},from:{first_name:'Admin',username:'admin_store'},text:value}},env);
(async()=>{
 await c.api.ensureDbReady(DB);for(const id of [1,99])db.prepare('INSERT INTO users(user_id,balance_usd) VALUES(?,10)').run(id);
 const d=db.prepare("INSERT INTO deposits(user_id,method,amount_usd,amount_bdt) VALUES(99,'BKASH',5,625)").run().lastInsertRowid;
 const alert=(trx='TEST123456',reason='missing')=>c.api.recordPaymentVerification(env,'deposit',d,99,'bkash',trx,reason);
 const notices=()=>messages.filter(m=>m.chat_id===1&&m.text?.includes('Payment Pending · Verification Failed'));
 await Promise.all([alert(),alert()]);assert.equal(notices().length,1);assert(notices()[0].text.includes('TEST123456'));assert(notices()[0].text.includes('625.00 BDT'));assert(notices()[0].text.includes('99'));assert(notices()[0].reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='adm_paydetail_deposit_'+d));
 await alert();assert.equal(notices().length,1);
 await alert('TEST123456','mismatch');assert.equal(notices().length,2);
 await alert('TEST654321','missing');assert.equal(notices().length,3);
 await alert('','missing');await alert('TEST654321','verified');assert.equal(notices().length,3);
 db.prepare("UPDATE deposits SET status='completed' WHERE id=?").run(d);await alert('DONE123456','missing');assert.equal(notices().length,3);
 db.prepare("UPDATE deposits SET status='pending' WHERE id=?").run(d);
 // A rejected Telegram send remains retryable; it is never marked sent.
 c.capture=async(e,method,payload)=>{messages.push({method,...payload});return {ok:!c.failSend,result:{message_id:1}};};vm.runInContext('callTg=capture;',c);c.failSend=true;
 await alert('RETRY12345','unavailable');assert.equal(db.prepare("SELECT sent FROM payment_pending_alerts WHERE trx_key='RETRY12345'").get().sent,0);
 c.failSend=false;await alert('RETRY12345','unavailable');assert.equal(db.prepare("SELECT sent FROM payment_pending_alerts WHERE trx_key='RETRY12345'").get().sent,1);
 for(const method of ['NAGAD','BINANCE','BEP20']){const id=db.prepare('INSERT INTO deposits(user_id,method,amount_usd,amount_bdt) VALUES(99,?,5,625)').run(method).lastInsertRowid;await c.api.recordPaymentVerification(env,'deposit',id,99,method,'FORMAT1234','not_found');assert(notices().some(n=>n.text.includes(method)));}
 const order=db.prepare("INSERT INTO orders(user_id,product_id,payment_method,amount_usd,amount_bdt) VALUES(99,1,'NAGAD',5,625)").run().lastInsertRowid;await c.api.recordPaymentVerification(env,'order',order,99,'nagad','ORDER123','missing');assert(notices().some(n=>n.reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='adm_paydetail_order_'+order)));
 assert.equal(db.prepare('SELECT balance_usd FROM users WHERE user_id=99').get().balance_usd,10);assert.equal(db.prepare('SELECT COUNT(*) n FROM mobile_payment_claims').get().n,0);
 console.log('PASS: immediate admin pending alerts, reason/ID deduplication and concurrency, failed-send retry, all automatic methods, order/deposit links, closed/success suppression and unchanged funds');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
