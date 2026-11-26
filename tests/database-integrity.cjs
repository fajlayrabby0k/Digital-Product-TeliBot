const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto');const db=new DatabaseSync(':memory:'),messages=[];
const DB={prepare(sql){let args=[];const q={bind(...a){args=a;return q;},exec(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async run(){return q.exec();},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};}};return q;},async batch(stmts){db.exec('BEGIN');try{const r=stmts.map(s=>s.exec());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
const c=vm.createContext({console,Intl,URL,URLSearchParams,TextEncoder,crypto:webcrypto,AbortController,setTimeout,clearTimeout,capture:async(e,method,payload)=>{messages.push({method,...payload});return {ok:true,result:{message_id:1}};}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\ncallTg=capture;globalThis.api={ensureDbReady,handleUpdate,showAdminUserProfile,showAdminUserHistory,notifyAdminForUser,drainProductNotices,parseStockItems,executeWalletPurchase,handleCategoryText,ensureCategory};',c);
const env={DB,ADMIN_ID:1},last=()=>messages.filter(m=>m.text).at(-1),buttons=()=>last().reply_markup.inline_keyboard.flat();
const cb=(data,id=1)=>c.api.handleUpdate({callback_query:{id:'cb',data,from:{first_name:'Admin',username:'admin_store'},message:{chat:{id},message_id:1}}},env);
const text=value=>c.api.handleUpdate({message:{chat:{id:1},from:{first_name:'Admin',username:'admin_store'},text:value}},env);
(async()=>{
 await c.api.ensureDbReady(DB);
 db.prepare("INSERT INTO users(user_id,balance_usd,balance_bdt) VALUES(99,10,1250)").run();
 db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('support_admin','@custom_support')").run();
 db.prepare("UPDATE products SET name='Saved name',description='Saved description',name_override=1,description_override=1,custom_icon='5432109876543210' WHERE id=2").run();
 const order=Number(db.prepare("INSERT INTO orders(user_id,product_id,product_name,quantity,amount_usd,payment_method,status) VALUES(99,2,'Saved name',1,5,'WALLET','completed')").run().lastInsertRowid);
 const snapshot=()=>JSON.stringify({
  user:db.prepare('SELECT * FROM users WHERE user_id=99').get(),
  order:db.prepare('SELECT * FROM orders WHERE id=?').get(order),
  product:db.prepare('SELECT * FROM products WHERE id=2').get(),
  ledger:db.prepare('SELECT * FROM wallet_history WHERE user_id=99 ORDER BY id').all(),
  inventory:db.prepare('SELECT * FROM inventory ORDER BY id').all(),
  settings:db.prepare('SELECT * FROM settings ORDER BY key').all()
 });
 const original=snapshot();
 for(let i=0;i<3;i++)await c.api.ensureDbReady(DB,true);
 assert.equal(snapshot(),original,'repeated migrations must preserve balances, history, order IDs, stock and admin edits');
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 for(const name of ['wallet_user_history','inventory_available','orders_user_history','orders_status','orders_public_id_unique','orders_user_number_unique','admin_review_transaction','support_one_active_order','product_follows_recipients']){
  assert(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name=?").get(name),'missing index '+name);
 }
 assert.match(db.prepare('EXPLAIN QUERY PLAN SELECT id FROM inventory WHERE product_id=2 AND is_sold=0 ORDER BY id LIMIT 1').all().map(r=>r.detail).join(' '),/inventory_available/);
 assert.match(db.prepare('EXPLAIN QUERY PLAN SELECT * FROM orders WHERE user_id=99 ORDER BY id DESC LIMIT 10').all().map(r=>r.detail).join(' '),/orders_user_/);
 // A later failed statement must roll back both the wallet mutation and trigger ledger entry.
 await assert.rejects(DB.batch([
  DB.prepare('UPDATE users SET balance_usd=balance_usd+5,balance_bdt=balance_bdt+625 WHERE user_id=99'),
  DB.prepare("UPDATE orders SET admin_deleted=1 WHERE id=?").bind(order)
 ]),/Completed orders cannot be deleted/);
 assert.equal(snapshot(),original,'failed batch must roll back financial changes and their audit entries');
 for(const row of db.prepare('SELECT * FROM wallet_history').all()){
  assert.equal(row.usd_after_cents-row.usd_before_cents,row.usd_delta_cents);
  assert.equal(row.bdt_after_minor-row.bdt_before_minor,row.bdt_delta_minor);
 }
 // Simulate upgrading an actual database written before the product override columns existed.
 db.exec('ALTER TABLE products DROP COLUMN name_override;ALTER TABLE products DROP COLUMN description_override;');
 db.prepare("UPDATE settings SET value='previous-schema' WHERE key='__schema_version'").run();
 await c.api.ensureDbReady(DB,true);
 assert.equal(db.prepare('SELECT name_override FROM products WHERE id=2').get().name_override,0);
 assert.equal(db.prepare('SELECT name FROM products WHERE id=2').get().name,'Saved name');
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 console.log('PASS: SQLite integrity, migration preservation/replay and old-column upgrade, critical indexes/query plans, wallet audit arithmetic and financial rollback');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
