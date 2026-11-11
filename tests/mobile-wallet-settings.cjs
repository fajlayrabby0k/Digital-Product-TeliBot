const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto');const sqlite=new DatabaseSync(':memory:'),messages=[];
const DB={prepare(sql){let args=[];const q={bind(...a){args=a;return q;},exec(){const r=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async run(){return q.exec();},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};return q;},async batch(statements){sqlite.exec('BEGIN');try{const r=statements.map(s=>s.exec());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const context=vm.createContext({console,Intl,URL,URLSearchParams,TextEncoder,crypto:webcrypto,AbortController,setTimeout,clearTimeout,capture:async(_env,method,payload)=>{messages.push({method,...payload});return {ok:true,result:{message_id:9}};}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\ncallTg=capture;globalThis.api={ensureDbReady,handleUpdate};',context);
const {api}=context,env={DB,ADMIN_ID:1},last=()=>messages.filter(m=>m.text).at(-1);
const cb=(data,id=1)=>api.handleUpdate({callback_query:{id:'cb',data,from:{first_name:'Tester'},message:{chat:{id},message_id:9}}},env);
const text=value=>api.handleUpdate({message:{chat:{id:1},from:{first_name:'Admin'},text:value}},env);
const saved=method=>sqlite.prepare('SELECT value FROM settings WHERE key=?').get(method+'_num').value;
(async()=>{
 await api.ensureDbReady(DB);for(const id of [1,99])sqlite.prepare('INSERT INTO users(user_id) VALUES(?)').run(id);
 for(const [method,input,expected]of [['bkash','+8801712345678','01712345678'],['nagad','০১৮১২৩৪৫৬৭৮','01812345678'],['rocket','019123456789','019123456789']]){
  const before=saved(method);await cb('adm_set_'+method);
  for(const invalid of ['1234','not-a-number','01212345678']){await text(invalid);assert.equal(saved(method),before);assert.equal(sqlite.prepare('SELECT state FROM admin_states WHERE user_id=1').get().state,'awaiting_setting_'+method);}
  await text(input);assert.equal(saved(method),expected);assert.equal(sqlite.prepare('SELECT * FROM admin_states WHERE user_id=1').get(),undefined);
  await cb('dep_setmeth_'+method+'_5.00',99);assert(last().text.includes(expected));assert.equal(sqlite.prepare('SELECT status FROM deposits ORDER BY id DESC LIMIT 1').get().status,'pending');
 }
 await cb('adm_set_bkash',99);assert.equal(sqlite.prepare('SELECT * FROM admin_states WHERE user_id=99').get(),undefined);
 await cb('adm_set_rocket');await text('/cancel');assert.equal(sqlite.prepare('SELECT * FROM admin_states WHERE user_id=1').get(),undefined);
 assert.equal(sqlite.prepare('SELECT balance_usd FROM users WHERE user_id=99').get().balance_usd,0);
 console.log('PASS: admin bKash/Nagad/Rocket numbers save, normalize and validate; customer instructions use saved accounts; unauthorized edits blocked; unverified payments stay pending');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>sqlite.close());
