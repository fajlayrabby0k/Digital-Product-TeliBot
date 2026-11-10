const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto');
const sqlite=new DatabaseSync(':memory:'),messages=[];
const DB={prepare(sql){let args=[];const q={bind(...a){args=a;return q;},exec(){const r=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async run(){return q.exec();},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};return q;},async batch(statements){sqlite.exec('BEGIN');try{const r=statements.map(s=>s.exec());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const source=fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={');
function load(){const context=vm.createContext({console,Intl,URL,URLSearchParams,TextEncoder,crypto:webcrypto,AbortController,setTimeout,clearTimeout,capture:async(_env,method,payload)=>{messages.push({method,...payload});return method==='getMe'?{ok:true,result:{username:'TestBot'}}:{ok:true,result:{message_id:9}};}});vm.runInContext(source+'\ncallTg=capture;globalThis.api={ensureDbReady,handleUpdate,createRedeemCode,MAINTENANCE_MESSAGE};',context);return context.api;}
let api=load();const env={DB,ADMIN_ID:1};
const text=(value,id=99)=>api.handleUpdate({message:{chat:{id},from:{first_name:'Tester'},text:value}},env);
const cb=(data,id=99)=>api.handleUpdate({callback_query:{id:'cb',data,from:{first_name:'Tester'},message:{chat:{id},message_id:9}}},env);
const last=()=>messages.filter(m=>m.text).at(-1);
const mode=()=>sqlite.prepare("SELECT value FROM settings WHERE key='maintenance_mode'").get().value;
const count=table=>sqlite.prepare('SELECT COUNT(*) AS n FROM '+table).get().n;
(async()=>{
 await api.ensureDbReady(DB);for(const id of [1,99])sqlite.prepare('INSERT INTO users(user_id) VALUES(?)').run(id);
 assert.equal(mode(),'0');await text('/start');assert(last().text.includes('Welcome to SMART SUBS STORE'));
 await text('/admin',1);assert(last().reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='adm_maintenance_on'));
 await cb('adm_maintenance_on',1);assert.equal(mode(),'1');assert(last().text.includes('ON — users paused'));assert(last().reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='adm_maintenance_off'));
 await cb('adm_maintenance_on',1);assert.equal(mode(),'1','repeating Turn ON must be idempotent');
 const voucher=await api.createRedeemCode(env,1,500);
 sqlite.prepare("INSERT INTO user_states(user_id,state,data) VALUES(99,'awaiting_redeem_code','{}')").run();
 await text('/start');assert.equal(last().text,api.MAINTENANCE_MESSAGE);
 await text(voucher);assert.equal(last().text,api.MAINTENANCE_MESSAGE);assert.equal(sqlite.prepare('SELECT redeemed_by FROM redeem_codes').get().redeemed_by,null);
 assert.equal(sqlite.prepare('SELECT balance_usd FROM users WHERE user_id=99').get().balance_usd,0);assert.equal(count('deposits'),0);
 for(const action of ['shop','redeem_open','pay_bep20_2_1','wallet_pay_check_2_1','adm_maintenance_off']){
  messages.length=0;await cb(action);assert.equal(last().text,api.MAINTENANCE_MESSAGE);assert.equal(last().method,'editMessageText');assert.equal(last().reply_markup.inline_keyboard.length,0);assert.equal(messages.filter(m=>m.method==='answerCallbackQuery').length,1);
 }
 assert.equal(mode(),'1');assert.equal(count('orders'),0);await text('/start',100);assert.equal(count('users'),2,'maintenance must block before registration/state mutations');
 // Admin can still browse and generate redeem codes while users are paused.
 await text('/start',1);assert(last().text.includes('Welcome to SMART SUBS STORE'));await cb('adm_redeem_generate',1);await text('3',1);assert(last().text.includes('Redeem Code Created'));assert.equal(count('redeem_codes'),2);
 // Maintenance survives new isolates and an explicit migration/setup refresh.
 api=load();await text('/start');assert.equal(last().text,api.MAINTENANCE_MESSAGE);await api.ensureDbReady(DB,true);assert.equal(mode(),'1');
 await cb('adm_maintenance_off',1);assert.equal(mode(),'0');assert(last().text.includes('OFF — bot online'));
 await cb('adm_maintenance_on',99);assert.equal(mode(),'0','users cannot change maintenance mode');
 await text('/start');assert(last().text.includes('Welcome to SMART SUBS STORE'));
 await cb('redeem_open');await text(voucher);assert(last().text.includes('Redeem Successful'));assert.equal(sqlite.prepare('SELECT balance_usd FROM users WHERE user_id=99').get().balance_usd,5);
 console.log('PASS: persistent/idempotent ON/OFF, exact maintenance text, cleared user buttons, blocked registration/payments/redeem, admin bypass/generation, authorization and immediate restoration');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>sqlite.close());
