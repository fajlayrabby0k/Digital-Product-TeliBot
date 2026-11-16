const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto');const db=new DatabaseSync(':memory:'),messages=[];
const DB={prepare(sql){let args=[];const q={bind(...a){args=a;return q;},exec(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async run(){return q.exec();},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};}};return q;},async batch(stmts){db.exec('BEGIN');try{const r=stmts.map(s=>s.exec());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
const c=vm.createContext({console,Intl,URL,URLSearchParams,TextEncoder,crypto:webcrypto,AbortController,setTimeout,clearTimeout,capture:async(e,method,payload)=>{messages.push({method,...payload});return {ok:true,result:{message_id:1}};}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\ncallTg=capture;globalThis.api={ensureDbReady,handleUpdate,showAdminUserProfile,showAdminUserHistory,notifyAdminForUser,drainProductNotices,parseStockItems,handleProductFollowCallback,sendProductDetailView};',c);
const env={DB,ADMIN_ID:1},last=()=>messages.filter(m=>m.text).at(-1),buttons=()=>last().reply_markup.inline_keyboard.flat();
const cb=(data,id=1)=>c.api.handleUpdate({callback_query:{id:'cb',data,from:{first_name:'Admin',username:'admin_store'},message:{chat:{id},message_id:1}}},env);
const text=value=>c.api.handleUpdate({message:{chat:{id:1},from:{first_name:'Admin',username:'admin_store'},text:value}},env);
(async()=>{
 await c.api.ensureDbReady(DB);for(const id of [1,99,100,101])db.prepare('INSERT INTO users(user_id,balance_usd) VALUES(?,10)').run(id);
 const p=db.prepare("INSERT INTO products(name,description,price_usd,price_bdt) VALUES('Followed Local','test',5,625)").run().lastInsertRowid;
 const q=db.prepare("INSERT INTO products(name,description,price_usd,price_bdt,is_external,external_id,api_stock) VALUES('Followed API','test',2,250,1,'api-follow',4)").run().lastInsertRowid;
 await c.api.drainProductNotices(env);messages.length=0;
 const follow=(data,id=99)=>c.api.handleProductFollowCallback(env,id,data,1);
 await follow('product_follow_'+p);assert.equal(db.prepare('SELECT product_alert_scope s FROM users WHERE user_id=99').get().s,'following');assert(buttons().some(b=>b.callback_data==='product_unfollow_'+p));
 await follow('product_follow_'+p);assert.equal(db.prepare('SELECT COUNT(*) n FROM product_follows WHERE user_id=99').get().n,1);
 await follow('product_follow_'+q,100);messages.length=0;
 db.prepare('INSERT INTO inventory(product_id,item_data) VALUES(?,?)').run(p,'SECRET-CREDENTIAL');await c.api.drainProductNotices(env);
 const alerts=()=>messages.filter(m=>m.text?.includes('Stock Added')||m.text?.includes('Price Dropped')||m.text?.includes('Price Increased')||m.text?.includes('Stock Finished'));
 assert.deepEqual(alerts().map(m=>m.chat_id),[99,101]);assert(!alerts().some(m=>m.text.includes('SECRET-CREDENTIAL')));messages.length=0;
 db.prepare('UPDATE products SET price_usd=4 WHERE id=?').run(p);db.prepare('UPDATE products SET price_usd=3 WHERE id=?').run(p);db.prepare('UPDATE products SET price_usd=6 WHERE id=?').run(p);db.prepare('UPDATE products SET price_usd=6 WHERE id=?').run(p);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM product_notice_events WHERE product_id=? AND kind IN ('price_drop','price_increase')").get(p).n,3);
 await c.api.drainProductNotices(env);assert.equal(alerts().length,3);assert(alerts().every(m=>m.chat_id===99));assert(alerts().some(m=>m.text.includes('$5.00 → $4.00')));assert(alerts().some(m=>m.text.includes('$4.00 → $3.00')));messages.length=0;
 db.prepare('UPDATE products SET api_stock=7,price_usd=1 WHERE id=?').run(q);await c.api.drainProductNotices(env);assert(alerts().some(m=>m.chat_id===100&&m.text.includes('Price Dropped')));assert(!alerts().some(m=>m.chat_id===99));messages.length=0;
 await follow('product_alert_mode_off',100);db.prepare('UPDATE products SET price_usd=3,api_stock=0 WHERE id=?').run(q);await c.api.drainProductNotices(env);assert(!alerts().some(m=>m.chat_id===100));assert.equal(db.prepare('SELECT COUNT(*) n FROM product_follows WHERE user_id=100').get().n,1);messages.length=0;
 await follow('product_alert_mode_following',100);db.prepare('UPDATE products SET price_usd=4 WHERE id=?').run(q);await follow('product_unfollow_list_'+q+'_0',100);assert(last().text.includes('No followed products'));await c.api.drainProductNotices(env);assert(!alerts().some(m=>m.chat_id===100));
 await follow('product_follows_0');assert(buttons().some(b=>b.callback_data==='prod_'+p));assert(!buttons().some(b=>b.callback_data==='prod_'+q));await follow('product_alert_settings');assert(last().text.includes('Followed Only'));
 await follow('product_unfollow_'+p);messages.length=0;db.prepare('UPDATE inventory SET is_sold=1 WHERE product_id=?').run(p);await c.api.drainProductNotices(env);assert.deepEqual(alerts().map(m=>m.chat_id),[101]);
 await follow('product_follow_999999');assert.equal(db.prepare('SELECT COUNT(*) n FROM product_follows WHERE product_id=999999').get().n,0);
 await follow('product_unfollow_list_'+p+'_0',100);assert.equal(db.prepare('SELECT COUNT(*) n FROM product_follows WHERE user_id=99').get().n,0);
 await follow('product_follow_'+p);await follow('product_unfollow_list_'+p+'_0',100);assert.equal(db.prepare('SELECT COUNT(*) n FROM product_follows WHERE user_id=99').get().n,1);
 for(let i=0;i<12;i++){const product=db.prepare("INSERT INTO products(name,price_usd,price_bdt) VALUES(?,1,125)").run('Favorite '+i).lastInsertRowid;db.prepare('INSERT INTO product_follows(user_id,product_id) VALUES(99,?)').run(product);}
 await follow('product_follows_0');assert.equal(buttons().filter(b=>b.callback_data.startsWith('product_unfollow_list_')).length,10);assert(buttons().some(b=>b.callback_data==='product_follows_1'));await follow('product_follows_1');assert(buttons().some(b=>b.callback_data==='product_follows_0'));
 db.prepare('DELETE FROM product_follows WHERE user_id=99 AND product_id<>?').run(p);
 // Stored preferences survive migrations; channel price alerts are independently tested.
 await follow('product_follow_'+p);await c.api.ensureDbReady(DB,true);assert.equal(db.prepare('SELECT COUNT(*) n FROM product_follows WHERE user_id=99').get().n,1);db.prepare('UPDATE products SET price_usd=7 WHERE id=?').run(p);await c.api.drainProductNotices(env);assert.equal(db.prepare('SELECT balance_usd FROM users WHERE user_id=99').get().balance_usd,10);
 console.log('PASS: per-user follows, idempotent follow, automatic following-only mode, local/API stock and exact price snapshots, no repeated unchanged alerts, mute/unfollow filtering, saved preferences, private credentials and unchanged wallet');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
