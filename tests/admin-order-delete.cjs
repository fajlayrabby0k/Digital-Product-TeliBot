const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto');const db=new DatabaseSync(':memory:'),messages=[];
const DB={prepare(sql){let args=[];const q={bind(...a){args=a;return q;},exec(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async run(){return q.exec();},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};}};return q;},async batch(stmts){db.exec('BEGIN');try{const r=stmts.map(s=>s.exec());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
const c=vm.createContext({console,Intl,URL,URLSearchParams,TextEncoder,crypto:webcrypto,AbortController,setTimeout,clearTimeout,capture:async(e,method,payload)=>{messages.push({method,...payload});return {ok:true,result:{message_id:1}};}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\ncallTg=capture;globalThis.api={ensureDbReady,handleUpdate,showAdminUserProfile,showAdminUserHistory,notifyAdminForUser,showWalletHistory,walletChangeSql,handleOrderSearchText,sendOrders};',c);
const env={DB,ADMIN_ID:1},last=()=>messages.filter(m=>m.text).at(-1),buttons=()=>last().reply_markup.inline_keyboard.flat();
const cb=(data,id=1)=>c.api.handleUpdate({callback_query:{id:'cb',data,from:{first_name:'Admin',username:'admin_store'},message:{chat:{id},message_id:1}}},env);
const text=value=>c.api.handleUpdate({message:{chat:{id:1},from:{first_name:'Admin',username:'admin_store'},text:value}},env);
(async()=>{
 await c.api.ensureDbReady(DB);for(const id of [1,99])db.prepare('INSERT INTO users(user_id,balance_usd) VALUES(?,10)').run(id);
 const add=status=>db.prepare("INSERT INTO orders(user_id,product_id,product_name,payment_method,amount_usd,status,trx_id) VALUES(99,1,'Product','BKASH',5,?,?)").run(status,'PAYMENT'+status).lastInsertRowid;
 const completed=add('completed'),pending=add('pending'),paid=add('paid_pending_delivery'),processing=add('delivering');
 const row=id=>db.prepare('SELECT * FROM orders WHERE id=?').get(id),confirm=()=>buttons().find(b=>b.callback_data?.startsWith('adm_order_delete_ok_')).callback_data;
 await cb('adm_orders_item_'+completed+'_completed_0');assert(!buttons().some(b=>b.callback_data==='adm_order_delete_'+completed));
 await cb('adm_order_delete_'+completed);assert(last().text.includes('Only pending'));assert.equal(row(completed).admin_deleted,0);
 assert.throws(()=>db.prepare('UPDATE orders SET admin_deleted=1 WHERE id=?').run(completed),/Completed orders cannot be deleted/);
 await cb('adm_order_delete_'+pending,99);assert.equal(row(pending).admin_deleted,0);
 await cb('adm_order_delete_'+pending);const cancelled=confirm();await cb('adm_orders_view_'+pending+'_0');await cb(cancelled);assert.equal(row(pending).admin_deleted,0);
 await cb('adm_order_delete_'+pending);const ok=confirm();await Promise.all([cb(ok),cb(ok)]);assert.equal(row(pending).admin_deleted,1);assert.equal(row(pending).status,'cancelled');assert.equal(row(pending).admin_deleted_by,'1');
 for(const id of [paid,processing]){const status=row(id).status;await cb('adm_order_delete_'+id);await cb(confirm());assert.equal(row(id).admin_deleted,1);assert.equal(row(id).status,status);}
 await cb('adm_orders_list_pending_0');assert(!buttons().some(b=>b.callback_data?.startsWith('adm_orders_item_')));
 await cb('adm_orders_list_completed_0');assert(buttons().some(b=>b.callback_data==='adm_orders_item_'+completed+'_completed_0'));
 // An order completing after the confirmation was opened cannot be hidden.
 const race=add('pending');await cb('adm_order_delete_'+race);const stale=confirm();db.prepare("UPDATE orders SET status='completed' WHERE id=?").run(race);await cb(stale);assert.equal(row(race).admin_deleted,0);
 // A paid archived order that later finishes is restored automatically.
 db.prepare("UPDATE orders SET status='completed' WHERE id=?").run(paid);assert.equal(row(paid).admin_deleted,0);
 // Existing hidden completed records are restored during upgrade.
 db.exec('DROP TRIGGER orders_no_completed_delete');db.prepare('UPDATE orders SET admin_deleted=1 WHERE id=?').run(completed);await c.api.ensureDbReady(DB,true);assert.equal(row(completed).admin_deleted,0);
 const expiry=add('pending');await cb('adm_order_delete_'+expiry);const expired=confirm();let d=JSON.parse(db.prepare('SELECT data FROM admin_states WHERE user_id=1').get().data);d.expires=1;db.prepare('UPDATE admin_states SET data=? WHERE user_id=1').run(JSON.stringify(d));await cb(expired);assert.equal(row(expiry).admin_deleted,0);
 assert.equal(db.prepare('SELECT balance_usd FROM users WHERE user_id=99').get().balance_usd,10);
 console.log('PASS: pending-only deletion, protected completed UI/callback/SQL, completion race, restored historical/late completed orders, authorization/cancel/expiry/replay and preserved funds');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
