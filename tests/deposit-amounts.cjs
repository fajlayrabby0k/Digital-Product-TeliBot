const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto');const sqlite=new DatabaseSync(':memory:'),messages=[];
const DB={prepare(sql){let args=[];const q={bind(...a){args=a;return q;},exec(){const r=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async run(){return q.exec();},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};return q;},async batch(statements){sqlite.exec('BEGIN');try{const r=statements.map(s=>s.exec());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const context=vm.createContext({console,Intl,URL,URLSearchParams,TextEncoder,crypto:webcrypto,AbortController,setTimeout,clearTimeout,capture:async(_env,method,payload)=>{messages.push({method,...payload});return {ok:true,result:{message_id:9}};}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\ncallTg=capture;globalThis.api={ensureDbReady,handleUpdate};',context);
const {api}=context,env={DB,ADMIN_ID:1},presets=[5,10,15,20,30,50],methods=['binance','bep20','bkash','nagad','rocket'];
const cb=data=>api.handleUpdate({callback_query:{id:'cb',data,from:{first_name:'Buyer'},message:{chat:{id:99},message_id:9}}},env);
const text=value=>api.handleUpdate({message:{chat:{id:99},from:{first_name:'Buyer'},text:value}},env);
const last=()=>messages.filter(m=>m.text).at(-1),buttons=()=>last().reply_markup.inline_keyboard.flat(),count=()=>sqlite.prepare('SELECT COUNT(*) AS n FROM deposits').get().n;
(async()=>{
 await api.ensureDbReady(DB);sqlite.prepare('INSERT INTO users(user_id) VALUES(99)').run();sqlite.prepare("UPDATE settings SET value=? WHERE key='bep20_addr'").run('0x'+'12'.repeat(20));
 for(const method of methods){
  let before=count();await cb('dep_method_'+method);assert.equal(count(),before);
  const choices=buttons().filter(b=>b.callback_data.startsWith('dep_amount_'));assert.deepEqual(Array.from(choices,b=>b.text),presets.map(a=>'$'+a));assert(buttons().some(b=>b.callback_data==='dep_custom_'+method));
  for(const amount of presets){
   before=count();await cb('dep_amount_'+method+'_'+amount);
   if(method==='binance'&&amount>10){assert.equal(count(),before);assert(last().text.includes('$10.00'));assert(buttons().some(b=>b.callback_data===`dep_setmeth_bep20_${amount.toFixed(2)}`));}
   else{assert.equal(count(),before+1);const row=sqlite.prepare('SELECT * FROM deposits ORDER BY id DESC LIMIT 1').get();assert.equal(row.method,method.toUpperCase());assert.equal(row.amount_usd,amount);assert.equal(row.status,'pending');}
  }
  before=count();await cb('dep_custom_'+method);
  for(const invalid of ['0','-1','NaN','1.234']){await text(invalid);assert.equal(count(),before);}
  await text('12.50');assert.equal(count(),before+(method==='binance'?0:1));
  if(method!=='binance')assert.equal(sqlite.prepare('SELECT amount_usd FROM deposits ORDER BY id DESC LIMIT 1').get().amount_usd,12.5);
  await cb('dep_custom_'+method);await cb('dep_method_'+method);assert(buttons().some(b=>b.callback_data===`dep_amount_${method}_5`));
  await text('/start');assert.equal(sqlite.prepare('SELECT * FROM user_states WHERE user_id=99').get(),undefined);
 }
 const before=count();await cb('dep_amount_bkash_999');assert.equal(count(),before);for(const forged of ['dep_setmeth_bkash_-1.00','dep_setmeth_bkash_5.123','dep_setmeth_fake_5.00']){await cb(forged);assert.equal(count(),before);}
 await cb('dep_setmeth_bkash_7.50');assert.equal(sqlite.prepare('SELECT amount_usd FROM deposits ORDER BY id DESC LIMIT 1').get().amount_usd,7.5);
 await cb('redeem_open');assert(last().text.includes('Redeem Code'));assert(!buttons().some(b=>b.callback_data.startsWith('dep_amount_')));
 sqlite.prepare("UPDATE settings SET value='1' WHERE key='maintenance_mode'").run();const paused=count();await cb('dep_amount_bep20_5');assert.equal(count(),paused);assert(last().text.includes('Bot Under Maintenance'));
 console.log('PASS: six presets and custom input across five methods, invoice timing/amounts, Binance cap/BEP20 alternative, validation/back/cancel, prefilled top-ups, redeem separation and maintenance gating');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>sqlite.close());
