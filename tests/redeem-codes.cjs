const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');const {webcrypto}=require('node:crypto');
const sqlite=new DatabaseSync(':memory:');let failLedger=false,race=null,forcedToken=null;const messages=[];
const DB={prepare(sql){let args=[];const statement={bind(...values){args=values;return statement;},exec(){
 if(failLedger&&sql.startsWith('INSERT INTO deposits')){failLedger=false;throw Error('simulated ledger failure');}
 const r=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};
},async run(){return statement.exec();},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};return statement;},async batch(statements){
 if(race){const gate=race;gate.arrivals++;if(gate.arrivals===2){race=null;gate.release();}await gate.promise;}
 sqlite.exec('BEGIN');try{const results=statements.map(s=>s.exec());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}
}};
const context=vm.createContext({console,Intl,URL,URLSearchParams,TextEncoder,crypto:{subtle:webcrypto.subtle,getRandomValues:bytes=>webcrypto.getRandomValues(bytes),randomUUID:()=>forcedToken||webcrypto.randomUUID()},AbortController,setTimeout,clearTimeout,
 capture:async(_env,method,payload)=>{messages.push({method,...payload});return method==='getMe'?{ok:true,result:{username:'VoucherTestBot'}}:{ok:true,result:{message_id:9}};}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\ncallTg=capture;globalThis.api={ensureDbReady,handleUpdate,createRedeemCode,redeemWalletCode,redeemCodeHash,normalizeRedeemCode};',context);
const {api}=context,env={DB,ADMIN_ID:1};
const balance=id=>sqlite.prepare('SELECT balance_usd FROM users WHERE user_id=?').get(id).balance_usd;
const count=table=>sqlite.prepare('SELECT COUNT(*) AS n FROM '+table).get().n;
const state=id=>sqlite.prepare('SELECT * FROM user_states WHERE user_id=?').get(id);
const last=()=>messages.filter(m=>m.text).at(-1);
const cb=(data,id=1)=>api.handleUpdate({callback_query:{id:'cb',data,from:{first_name:'Tester'},message:{chat:{id},message_id:9}}},env);
const text=(message,id=1)=>api.handleUpdate({message:{chat:{id},from:{first_name:'Tester'},text:message}},env);
const gate=()=>{let release;const promise=new Promise(r=>release=r);race={arrivals:0,promise,release};};
(async()=>{
 await api.ensureDbReady(DB);for(const id of [1,99,100,101])sqlite.prepare('INSERT INTO users(user_id,username) VALUES(?,?)').run(id,'user'+id);
 await text('/deposit',99);assert(last().reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='redeem_open'));
 await text('/admin');assert(last().reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='adm_redeem_menu'));
 await cb('adm_redeem_generate',99);assert.equal(count('redeem_codes'),0);assert.equal(sqlite.prepare('SELECT * FROM admin_states WHERE user_id=99').get(),undefined);
 await assert.rejects(api.createRedeemCode(env,99,500),/Admin access/);
 await cb('adm_redeem_menu');await cb('adm_redeem_generate');
 for(const amount of ['0','-5','1.001','1e3']){await text(amount);assert.equal(count('redeem_codes'),0);}
 await text('10.50');assert.equal(count('redeem_codes'),1);
 const code=last().text.match(/<code>(RDM-[A-F0-9]{32})<\/code>/)[1];
 const link=last().reply_markup.inline_keyboard.flat().find(b=>b.text.includes('Redeem Link')).copy_text.text;
 assert.equal(api.normalizeRedeemCode(link),code);assert.equal(api.normalizeRedeemCode('https://evil.test/?start=redeem_'+code),null);
 const row=sqlite.prepare('SELECT * FROM redeem_codes').get();assert.equal(row.amount_cents,1050);assert.equal(row.redeemed_by,null);assert(!JSON.stringify(row).includes(code),'only the hash should be stored');
 await cb('redeem_open',99);assert.equal(state(99).state,'awaiting_redeem_code');await text('invalid',99);assert.equal(balance(99),0);assert(state(99));
 await text(code.toLowerCase(),99);assert.equal(balance(99),10.5);assert.equal(state(99),undefined);
 assert.equal(sqlite.prepare('SELECT balance_bdt FROM users WHERE user_id=99').get().balance_bdt,1313);
 assert.equal(count('deposits'),1);assert.equal(sqlite.prepare('SELECT method FROM deposits').get().method,'REDEEM');
 assert.equal((await api.redeemWalletCode(env,100,code)).success,false);assert.equal(balance(100),0);assert.equal(count('deposits'),1);
 // Race both users after the precheck but before either transaction commits.
 const shared=await api.createRedeemCode(env,1,500);gate();const raced=await Promise.all([api.redeemWalletCode(env,100,shared),api.redeemWalletCode(env,101,shared)]);
 assert.equal(raced.filter(r=>r.success).length,1);assert.equal(balance(100)+balance(101),5);assert.equal(count('deposits'),2);
 const same=await api.createRedeemCode(env,1,200);forcedToken='fixture-repeated-token';gate();const twice=await Promise.all([api.redeemWalletCode(env,99,same),api.redeemWalletCode(env,99,same)]);assert.equal(twice.filter(r=>r.success).length,1);assert.equal(balance(99),12.5);assert.equal(count('deposits'),3);forcedToken=null;
 // Failure after the code claim and balance update must roll back all three operations.
 const retry=await api.createRedeemCode(env,1,300);failLedger=true;assert.equal((await api.redeemWalletCode(env,99,retry)).success,false);assert.equal(balance(99),12.5);
 assert.equal(sqlite.prepare('SELECT redeemed_by FROM redeem_codes WHERE code_hash=?').get(await api.redeemCodeHash(retry)).redeemed_by,null);
 assert.equal((await api.redeemWalletCode(env,99,retry)).success,true);assert.equal(balance(99),15.5);assert.equal(count('deposits'),4);
 // Deep links create/register a new customer, then redeem without requiring a prior state.
 const deep=await api.createRedeemCode(env,1,123);await text('/start redeem_'+deep,102);assert.equal(balance(102),1.23);assert.equal(count('deposits'),5);
 await cb('redeem_open',100);await cb('redeem_cancel',100);assert.equal(state(100),undefined);
 await cb('redeem_open',100);await text('/start',100);assert.equal(state(100),undefined);
 await cb('adm_redeem_generate');await cb('adm_redeem_menu');assert.equal(sqlite.prepare('SELECT * FROM admin_states WHERE user_id=1').get(),undefined);
 await cb('adm_redeem_generate');await text('/deposit');assert.equal(sqlite.prepare('SELECT * FROM admin_states WHERE user_id=1').get(),undefined);assert(last().text.includes('Deposit Funds'));
 console.log('PASS: admin generation, code/link output, hashed storage, amount validation, deposit menu/input, new-user deep links, single-use races across/same users, atomic rollback, audit ledger and cancellation');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>sqlite.close());
