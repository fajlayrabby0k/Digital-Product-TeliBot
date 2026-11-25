const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto');const db=new DatabaseSync(':memory:'),messages=[];
const DB={prepare(sql){let args=[];const q={bind(...a){args=a;return q;},exec(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async run(){return q.exec();},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};}};return q;},async batch(stmts){db.exec('BEGIN');try{const r=stmts.map(s=>s.exec());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
const c=vm.createContext({console,Intl,URL,URLSearchParams,TextEncoder,crypto:webcrypto,AbortController,setTimeout,clearTimeout,capture:async(e,method,payload)=>{messages.push({method,...payload});return {ok:true,result:{message_id:1}};}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\ncallTg=capture;globalThis.api={ensureDbReady,handleUpdate,showAdminUserProfile,showAdminUserHistory,notifyAdminForUser,recordPaymentVerification,showPaymentDashboard,showPaymentDashboardDetail};',c);
const env={DB,ADMIN_ID:1},last=()=>messages.filter(m=>m.text).at(-1),buttons=()=>last().reply_markup.inline_keyboard.flat();
const cb=(data,id=1)=>c.api.handleUpdate({callback_query:{id:'cb',data,from:{first_name:'Admin',username:'admin_store'},message:{chat:{id},message_id:1}}},env);
const text=value=>c.api.handleUpdate({message:{chat:{id:1},from:{first_name:'Admin',username:'admin_store'},text:value}},env);
(async()=>{
 await c.api.ensureDbReady(DB);for(const id of [1,99])db.prepare('INSERT INTO users(user_id,balance_usd) VALUES(?,0)').run(id);
 const deposit=trx=>db.prepare("INSERT INTO deposits(user_id,method,amount_usd,amount_bdt,trx_id) VALUES(99,'BKASH',5,625,?)").run(trx).lastInsertRowid;
 const row=id=>db.prepare('SELECT * FROM deposits WHERE id=?').get(id),bal=()=>db.prepare('SELECT balance_usd FROM users WHERE user_id=99').get().balance_usd;
 const confirm=()=>buttons().find(b=>b.callback_data?.startsWith('adm_payreview_ok_')).callback_data;
 const id=deposit('TEST123456');await c.api.recordPaymentVerification(env,'deposit',id,99,'bkash','TEST123456','missing');
 await cb('adm_paydash_submitted_0');assert(last().text.includes('TEST123456'));
 await cb('adm_paydetail_deposit_'+id);assert(!buttons().some(b=>/approve/i.test(b.text)));assert(buttons().some(b=>b.callback_data==='adm_payreview_cancel_deposit_'+id));
 for(const data of ['adm_payreview_approve_deposit_'+id,'adm_apprdep_'+id,'admin_approve_1']){await cb(data);assert(last().text.includes('disabled'));assert.equal(bal(),0);}
 const oldToken='a'.repeat(32);db.prepare("INSERT OR REPLACE INTO admin_states(user_id,state,data) VALUES(1,'confirm_payment_review',?)").run(JSON.stringify({token:oldToken,action:'approve',type:'deposit',id,userId:99,expires:Date.now()+300000}));await cb('adm_payreview_ok_'+oldToken);assert.equal(row(id).status,'pending');assert.equal(bal(),0);
 await cb('adm_payreview_cancel_deposit_'+id);const abort=confirm();await cb('adm_paydetail_deposit_'+id);await cb(abort);assert.equal(row(id).status,'pending');
 await cb('adm_payreview_cancel_deposit_'+id);const ok=confirm();await cb(ok,99);assert.equal(row(id).status,'pending');
 await Promise.all([cb(ok),cb(ok)]);assert.equal(row(id).status,'cancelled');assert.equal(bal(),0);assert.equal(db.prepare('SELECT COUNT(*) n FROM admin_payment_reviews').get().n,1);
 assert.equal(last().method,'editMessageText');assert(last().text.includes('list is up to date'));assert(!buttons().some(b=>b.callback_data==='adm_paydetail_deposit_'+id));assert(!buttons().some(b=>b.callback_data?.startsWith('adm_payreview_ok_')));
 await cb(ok);assert(last().text.includes('list is up to date'));assert(!last().text.includes('expired'));assert.equal(bal(),0);assert.equal(messages.filter(m=>m.document).length,0);
 await cb('adm_paydash_cancelled_0');assert(last().text.includes('TEST123456'));
 const changed=deposit('CHANGE1234');await cb('adm_payreview_cancel_deposit_'+changed);const stale=confirm();db.prepare('UPDATE deposits SET trx_id=? WHERE id=?').run('CHANGED123',changed);await cb(stale);assert.equal(row(changed).status,'pending');
 const claimed=deposit('CLAIM12345');db.prepare("INSERT INTO binance_payment_claims(transaction_id,invoice_type,invoice_id,user_id,amount_usdt) VALUES('123456789','deposit',?,99,'5')").run(claimed);await cb('adm_payreview_cancel_deposit_'+claimed);await cb(confirm());assert.equal(row(claimed).status,'pending');
 const expiry=deposit('EXPIRE1234');await cb('adm_payreview_cancel_deposit_'+expiry);const expired=confirm();let d=JSON.parse(db.prepare('SELECT data FROM admin_states WHERE user_id=1').get().data);d.expires=1;db.prepare('UPDATE admin_states SET data=? WHERE user_id=1').run(JSON.stringify(d));await cb(expired);assert.equal(row(expiry).status,'pending');
 const product=db.prepare("INSERT INTO products(name,price_usd,price_bdt) VALUES('Product',5,625)").run().lastInsertRowid;
 const order=db.prepare("INSERT INTO orders(user_id,product_id,payment_method,amount_usd,amount_bdt,trx_id) VALUES(99,?,'NAGAD',5,625,'NG123456')").run(product).lastInsertRowid;
 await cb('adm_payreview_cancel_order_'+order);await cb(confirm());assert.equal(db.prepare('SELECT status FROM orders WHERE id=?').get(order).status,'cancelled');assert.equal(bal(),0);
 assert.throws(()=>db.prepare("INSERT INTO mobile_payment_claims(method,trx_id,event_id,invoice_type,invoice_id,user_id,amount_minor,amount_cents,token) VALUES('bkash','TEST123456','event','deposit',?,99,62500,500,'token')").run(id),/already reviewed/);
 // Old instruction-only requests never appear in pending, but old delete links still work.
 const old=deposit('');db.prepare("UPDATE deposits SET created_at='2000-01-01 00:00:00',amount_usd=0,amount_bdt=0 WHERE id=?").run(old);
 await c.api.recordPaymentVerification(env,'deposit',old,99,'bkash','','invalid_format');
 for(const filter of ['pending','submitted','issues']){await cb('adm_paydash_'+filter+'_0');assert(!buttons().some(b=>b.callback_data==='adm_paydetail_deposit_'+old));}
 await cb('adm_payreview_cancel_deposit_'+old);await cb(confirm());assert.equal(row(old).status,'cancelled');assert(last().text.includes('list is up to date'));assert.equal(bal(),0);
 await cb('adm_payreview_cancel_deposit_'+old);assert(last().text.includes('list is up to date'));
 const oldTrx=deposit('OLDER12345');db.prepare("UPDATE deposits SET created_at='2000-01-01 00:00:00' WHERE id=?").run(oldTrx);
 await cb('adm_paydash_pending_0');assert(buttons().some(b=>b.callback_data==='adm_paydetail_deposit_'+oldTrx));
 await cb('adm_payreview_cancel_deposit_'+oldTrx);await cb(confirm());assert.equal(row(oldTrx).status,'cancelled');assert(!buttons().some(b=>b.callback_data==='adm_paydetail_deposit_'+oldTrx));
 // The separate additive wallet credit remains available.
 await cb('adm_wallet_add_99');await text('5');await cb(buttons().find(b=>b.callback_data?.startsWith('adm_wallet_add_ok_')).callback_data);assert.equal(bal(),5);assert.equal(row(id).status,'cancelled');
 console.log('PASS: delete-only pending review, disabled approval/legacy buttons and stale approval tokens, admin/cancel/expiry/replay guards, automatic-claim exclusion, no credit/delivery and separate Add Balance');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
