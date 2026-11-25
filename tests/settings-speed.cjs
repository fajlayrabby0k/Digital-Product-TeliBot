const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto');const db=new DatabaseSync(':memory:'),messages=[];
let delayMs=0,reads=[];const record=async sql=>{reads.push(sql);if(delayMs)await new Promise(resolve=>setTimeout(resolve,delayMs));};
const DB={prepare(sql){let args=[];const q={bind(...a){args=a;return q;},exec(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async run(){return q.exec();},async first(){await record(sql);return db.prepare(sql).get(...args)||null;},async all(){await record(sql);return {results:db.prepare(sql).all(...args)};}};return q;},async batch(stmts){db.exec('BEGIN');try{const r=stmts.map(s=>s.exec());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
const c=vm.createContext({console,Intl,URL,URLSearchParams,TextEncoder,crypto:webcrypto,AbortController,setTimeout,clearTimeout,capture:async(e,method,payload)=>{messages.push({method,...payload});return {ok:true,result:{message_id:1}};}});
vm.runInContext(fs.readFileSync(process.env.WORKER_SOURCE||path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\ncallTg=capture;globalThis.api={ensureDbReady,handleUpdate,showAdminUserProfile,showAdminUserHistory,notifyAdminForUser,showWalletHistory,walletChangeSql,handleOrderSearchText,sendOrders,processReferralCommission,referralCommissionEarned,sendHomeDashboard,sendProfile,sendRefer};',c);
const env={DB,ADMIN_ID:1},last=()=>messages.filter(m=>m.text).at(-1),buttons=()=>last().reply_markup.inline_keyboard.flat();
const cb=(data,id=1)=>c.api.handleUpdate({callback_query:{id:'cb',data,from:{first_name:'Admin',username:'admin_store'},message:{chat:{id},message_id:1}}},env);
const text=value=>c.api.handleUpdate({message:{chat:{id:1},from:{first_name:'Admin',username:'admin_store'},text:value}},env);
(async()=>{
 await c.api.ensureDbReady(DB);db.prepare('INSERT INTO users(user_id,balance_usd) VALUES(99,10)').run();
 db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('force_channel_username','')").run();
 db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('force_group_username','')").run();
 delayMs=5;reads=[];const at=performance.now();
 await cb('home',99);const ms=performance.now()-at;
 const settingsReads=reads.filter(sql=>/FROM settings/i.test(sql)).length;
 assert(last().text.includes('Welcome to'));
 console.log(JSON.stringify({source:process.env.WORKER_SOURCE?'baseline':'updated',scenario:'home with simulated 5ms database read latency',elapsed_ms:Number(ms.toFixed(1)),database_reads:reads.length,settings_reads:settingsReads}));
 if(!process.env.WORKER_SOURCE){
  assert.equal(settingsReads,1);
  db.prepare("UPDATE settings SET value='1' WHERE key='maintenance_mode'").run();
  reads=[];await cb('home',99);assert(last().text.includes('Under Maintenance'));assert.equal(reads.filter(sql=>/FROM settings/i.test(sql)).length,1);
  db.prepare("UPDATE settings SET value='0' WHERE key='maintenance_mode'").run();
  await cb('home',99);assert(last().text.includes('Welcome to'));
 }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
