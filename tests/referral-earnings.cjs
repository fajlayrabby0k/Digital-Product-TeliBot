const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto');const db=new DatabaseSync(':memory:'),messages=[];
const DB={prepare(sql){let args=[];const q={bind(...a){args=a;return q;},exec(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async run(){return q.exec();},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};}};return q;},async batch(stmts){db.exec('BEGIN');try{const r=stmts.map(s=>s.exec());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
const c=vm.createContext({console,Intl,URL,URLSearchParams,TextEncoder,crypto:webcrypto,AbortController,setTimeout,clearTimeout,capture:async(e,method,payload)=>{messages.push({method,...payload});return {ok:true,result:{message_id:1}};}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\ncallTg=capture;globalThis.api={ensureDbReady,handleUpdate,showAdminUserProfile,showAdminUserHistory,notifyAdminForUser,showWalletHistory,walletChangeSql,handleOrderSearchText,sendOrders,processReferralCommission,referralCommissionEarned,sendHomeDashboard,sendProfile,sendRefer};',c);
const env={DB,ADMIN_ID:1},last=()=>messages.filter(m=>m.text).at(-1),buttons=()=>last().reply_markup.inline_keyboard.flat();
const cb=(data,id=1)=>c.api.handleUpdate({callback_query:{id:'cb',data,from:{first_name:'Admin',username:'admin_store'},message:{chat:{id},message_id:1}}},env);
const text=value=>c.api.handleUpdate({message:{chat:{id:1},from:{first_name:'Admin',username:'admin_store'},text:value}},env);
(async()=>{
 await c.api.ensureDbReady(DB);
 db.prepare('INSERT INTO users(user_id,balance_usd,balance_bdt) VALUES(99,10,1250)').run();
 db.prepare('INSERT INTO users(user_id,referred_by) VALUES(100,99)').run();
 db.prepare('INSERT INTO users(user_id) VALUES(101)').run();
 assert.equal(await c.api.referralCommissionEarned(env,99),'0.00');
 await c.api.processReferralCommission(env,100,10,'Sample product');
 await c.api.processReferralCommission(env,100,5,'Sample product');
 assert.equal(await c.api.referralCommissionEarned(env,99),'0.75');
 assert.equal(await c.api.referralCommissionEarned(env,101),'0.00');
 assert.equal(db.prepare('SELECT balance_usd FROM users WHERE user_id=99').get().balance_usd,10.75);
 await DB.prepare(c.api.walletChangeSql('UPDATE users SET balance_usd=balance_usd-?,balance_bdt=balance_bdt-? WHERE user_id=?','purchase','test')).bind(3,375,99).run();
 assert.equal(await c.api.referralCommissionEarned(env,99),'0.75');
 const before=db.prepare('SELECT COUNT(*) n FROM wallet_history').get().n;
 const user=db.prepare('SELECT * FROM users WHERE user_id=99').get();
 for(const show of [()=>c.api.sendHomeDashboard(env,99,user,'Customer'),()=>c.api.sendProfile(env,99,user),()=>c.api.sendRefer(env,99,user)]){
  await show();assert(last().text.includes('Referral Earned: <b>$0.75 USD</b>'));
 }
 assert.equal(db.prepare('SELECT COUNT(*) n FROM wallet_history').get().n,before);
 assert.equal(db.prepare('SELECT balance_usd FROM users WHERE user_id=99').get().balance_usd,7.75);
 assert.equal((last().text.match(/Referral Earned/g)||[]).length,1);
 console.log('PASS: referral credits main wallet, lifetime cents total, spend-independent earnings, isolated users and read-only display');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
