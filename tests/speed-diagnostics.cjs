const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto');const db=new DatabaseSync(':memory:'),messages=[];
const DB={prepare(sql){let args=[];const q={bind(...a){args=a;return q;},exec(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async run(){return q.exec();},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};}};return q;},async batch(stmts){db.exec('BEGIN');try{const r=stmts.map(s=>s.exec());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
const c=vm.createContext({console,Intl,URL,URLSearchParams,TextEncoder,crypto:webcrypto,AbortController,setTimeout,clearTimeout,capture:async(e,method,payload)=>{messages.push({method,...payload});return {ok:true,result:{message_id:1}};}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\ncallTg=capture;globalThis.api={ensureDbReady,handleUpdate,showAdminUserProfile,showAdminUserHistory,notifyAdminForUser,showWalletHistory,walletChangeSql,handleOrderSearchText,sendOrders,processReferralCommission,referralCommissionEarned,sendHomeDashboard,sendProfile,sendRefer,processBotUpdate};',c);
const env={DB,ADMIN_ID:1},last=()=>messages.filter(m=>m.text).at(-1),buttons=()=>last().reply_markup.inline_keyboard.flat();
const cb=(data,id=1)=>c.api.handleUpdate({callback_query:{id:'cb',data,from:{first_name:'Admin',username:'admin_store'},message:{chat:{id},message_id:1}}},env);
const text=value=>c.api.handleUpdate({message:{chat:{id:1},from:{first_name:'Admin',username:'admin_store'},text:value}},env);
(async()=>{
 await c.api.ensureDbReady(DB);
 c.capture=async(e,method,payload)=>{
  messages.push({method,...payload});
  if(method==='getWebhookInfo')return {ok:true,result:{url:'https://digital-product-telibot.pages.dev/api/webhook',pending_update_count:7}};
  return {ok:true,result:{message_id:1}};
 };
 vm.runInContext('callTg=capture;',c);
 await c.api.processBotUpdate({message:{chat:{id:1},text:'/speed'}},env,'',null);
 assert(last().text.includes('Live Speed Test'));assert(last().text.includes('Database reads:'));assert(last().text.includes('Configured correctly'));assert(last().text.includes('Pending updates: 7'));
 let n=messages.length;await c.api.processBotUpdate({message:{chat:{id:99},text:'/speed'}},env,'',null);assert.equal(messages.length,n);
 await c.api.processBotUpdate({callback_query:{id:'speed',data:'adm_speed',message:{chat:{id:1},message_id:1}}},env,'',null);assert(last().text.includes('Live Speed Test'));
 assert(!messages.some(m=>['setWebhook','deleteWebhook'].includes(m.method)));
 console.log('PASS: read-only live speed diagnostics, webhook status, queue depth and admin-only command/button');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
