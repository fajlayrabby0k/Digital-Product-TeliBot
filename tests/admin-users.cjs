const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto');const db=new DatabaseSync(':memory:'),messages=[];
const DB={prepare(sql){let args=[];const q={bind(...a){args=a;return q;},exec(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async run(){return q.exec();},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};}};return q;},async batch(stmts){db.exec('BEGIN');try{const r=stmts.map(s=>s.exec());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
const c=vm.createContext({console,Intl,URL,URLSearchParams,TextEncoder,crypto:webcrypto,AbortController,setTimeout,clearTimeout,capture:async(e,method,payload)=>{messages.push({method,...payload});return {ok:true,result:{message_id:1}};}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\ncallTg=capture;globalThis.api={ensureDbReady,handleUpdate,showAdminUserProfile,showAdminUserHistory,notifyAdminForUser};',c);
const env={DB,ADMIN_ID:1},last=()=>messages.filter(m=>m.text).at(-1),buttons=()=>last().reply_markup.inline_keyboard.flat();
const cb=(data,id=1)=>c.api.handleUpdate({callback_query:{id:'cb',data,from:{first_name:'Admin',username:'admin_store'},message:{chat:{id},message_id:1}}},env);
const text=value=>c.api.handleUpdate({message:{chat:{id:1},from:{first_name:'Admin',username:'admin_store'},text:value}},env);
(async()=>{
 db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,user_id INTEGER UNIQUE NOT NULL,username TEXT,balance_usd REAL DEFAULT 0,balance_bdt REAL DEFAULT 0,total_spent_usd REAL DEFAULT 0,referred_by INTEGER DEFAULT 0,total_referrals INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP);INSERT INTO users(user_id,username,balance_usd) VALUES(88,'@legacy_user',7)");
 await c.api.ensureDbReady(DB);assert.equal(db.prepare('SELECT balance_usd FROM users WHERE user_id=88').get().balance_usd,7);db.prepare("INSERT INTO users(user_id,username,first_name) VALUES(1,'@admin_store','Admin')").run();for(let id=100;id<125;id++)db.prepare('INSERT INTO users(user_id,username,first_name,balance_usd,balance_bdt) VALUES(?,?,?,?,?)').run(id,'@buyer'+id,id===120?'Alice <buyer>':'Buyer '+id,id, id*125);
 for(let i=0;i<13;i++)db.prepare("INSERT INTO deposits(user_id,username,method,amount_usd,amount_bdt,trx_id,status) VALUES(120,'@buyer120','BKASH',5,625,?,'completed')").run('DEP'+i);
 db.prepare("INSERT INTO deposits(user_id,method,amount_usd,status) VALUES(121,'NAGAD',9,'pending')").run();
 const order=db.prepare("INSERT INTO orders(user_id,product_id,payment_method,amount_usd,trx_id,status) VALUES(120,1,'WALLET',10,'ORDER-TX','completed')").run().lastInsertRowid;
 const balances=()=>JSON.stringify(db.prepare('SELECT user_id,balance_usd,balance_bdt FROM users ORDER BY user_id').all());const before=balances();
 await cb('admin_panel');assert(buttons().some(b=>b.callback_data==='adm_users'));
 await cb('adm_users');assert(last().text.includes('Find Customer'));
 await cb('adm_user_list_all_0');assert.equal(buttons().filter(b=>b.callback_data?.startsWith('adm_user_view_')).length,10);assert(buttons().some(b=>b.callback_data==='adm_user_list_all_1'));
 await cb('adm_user_list_all_1');assert(buttons().some(b=>b.callback_data==='adm_user_list_all_0'));
 await cb('adm_user_list_deposits_0');assert(buttons().some(b=>b.callback_data==='adm_user_view_120'));assert(!buttons().some(b=>b.callback_data==='adm_user_view_121'));
 for(const query of ['120','@buyer120','Alice','dep12','order-tx','order:'+order,'deposit:1']){
  await cb('adm_user_search');await text(query);assert(buttons().some(b=>b.callback_data==='adm_user_view_120'),query);
 }
 await cb('adm_user_search');await text('Buyer');assert(buttons().some(b=>b.callback_data==='adm_user_search_page_1'));await cb('adm_user_search_page_1');assert(last().text.includes('Page 2'));assert(last().text.includes('Buyer'));
 await cb('adm_user_search');await text("%' OR 1=1 --");assert(last().text.includes('No matching'));
 await cb('adm_user_view_120');assert(last().text.includes('Alice &lt;buyer&gt;'));assert(last().text.includes('65.00'));assert(last().text.includes('10.00'));assert(buttons().some(b=>b.url==='https://t.me/buyer120'));
 await cb('adm_user_history_deposits_120_0');assert(last().text.includes('DEP12'));assert(buttons().some(b=>b.callback_data==='adm_user_history_deposits_120_1'));await cb('adm_user_history_deposits_120_1');assert(last().text.includes('DEP0'));assert(!buttons().some(b=>b.callback_data==='adm_user_history_deposits_120_2'));
 db.prepare("UPDATE deposits SET trx_id=? WHERE user_id=120").run('<&'.repeat(500));await cb('adm_user_history_deposits_120_0');assert(last().text.length<4096);assert(last().text.includes('&lt;'));
 await cb('adm_user_history_orders_120_0');assert(last().text.includes('ORDER-TX'));
 await cb('adm_user_view_999');assert(last().text.includes('not found'));
 await cb('adm_user_search');await text('/cancel');assert.equal(db.prepare('SELECT * FROM admin_states WHERE user_id=1').get(),undefined);
 const count=messages.length;for(const data of ['adm_users','adm_user_view_120','adm_user_history_deposits_120_0','adm_user_search'])await cb(data,100);assert.equal(messages.length,count);await c.api.showAdminUserProfile(env,100,120);assert.equal(messages.length,count);
 await c.api.notifyAdminForUser(env,120,'Payment received',[[{text:'Existing action',callback_data:'adm_existing'}]]);assert.equal(last().chat_id,1);assert(buttons().some(b=>b.callback_data==='adm_existing'));assert(buttons().some(b=>b.callback_data==='adm_user_view_120'));
 db.prepare("UPDATE users SET username='Alice' WHERE user_id=120").run();await cb('adm_user_view_120');assert(buttons().some(b=>b.url==='tg://user?id=120'));
 const queued=[];let finish;const delayed=new Promise(resolve=>{finish=resolve;});c.delayed=delayed;vm.runInContext('globalThis.savedSendMsg=sendMsg;sendMsg=()=>delayed;',c);const notification=c.api.notifyAdminForUser({...env,__executionContext:{waitUntil:p=>queued.push(p)}},120,'Queued payment notification');assert.equal(queued.length,1);finish({ok:true});assert.equal((await notification).queued,true);await Promise.all(queued);vm.runInContext('sendMsg=savedSendMsg;',c);
 assert.equal(balances(),before);assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n,1);
 console.log('PASS: admin-only user list/search by identity/TrxID/invoice, pagination, profile totals/escaping, histories, safe Telegram identity links, notification shortcut, cancellation, SQL literal search and unchanged finances');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
