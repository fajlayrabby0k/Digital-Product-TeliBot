const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const sqlite=new DatabaseSync(':memory:');
const DB={prepare(sql){let args=[];const statement={bind(...a){args=a;return statement;},exec(){const result=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:result.changes,last_row_id:result.lastInsertRowid}};},async run(){return statement.exec();},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};return statement;},async batch(statements){sqlite.exec('BEGIN');try{const results=statements.map(s=>s.exec());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const wallet='0x'+'12'.repeat(20),newWallet='0x'+'34'.repeat(20),hash='0x'+'ab'.repeat(32),blockHash='0x'+'cd'.repeat(32);
const token='0x55d398326f99059ff775485246999027b3197955',topic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
let clock=Math.floor(Date.now()/1000)*1000,head=110,receipt,block;const messages=[];
function payment(tx,amount,address,number=101){const data='0x'+(BigInt(amount)*10n**18n).toString(16).padStart(64,'0');receipt={transactionHash:tx,status:'0x1',blockNumber:'0x'+number.toString(16),blockHash,logs:[{address:token,topics:[topic,'0x'+'56'.repeat(32),'0x'+address.slice(2).padStart(64,'0')],data}]};block={number:receipt.blockNumber,hash:blockHash,timestamp:'0x'+Math.floor((clock-1000)/1000).toString(16)};}
const context=vm.createContext({console,Intl,URL,URLSearchParams,AbortController,TextEncoder,setTimeout,clearTimeout,
 Date:class extends Date{static now(){return clock;}},capture:async(_env,method,payload)=>{messages.push({method,...payload});return {ok:true};},
 fetch:async(_url,options)=>{const {method}=JSON.parse(options.body);const result=({eth_chainId:'0x38',eth_blockNumber:'0x'+head.toString(16),eth_getTransactionReceipt:receipt,eth_getBlockByNumber:block})[method];return {ok:true,json:async()=>({jsonrpc:'2.0',id:1,result})};}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\ncallTg=capture;globalThis.api={ensureDbReady,handleUpdate};',context);
const env={DB,ADMIN_ID:1};
const callback=(data,id=99)=>context.api.handleUpdate({callback_query:{id:'cb',data,from:{first_name:'Buyer'},message:{chat:{id},message_id:1}}},env);
const text=(message,id=99)=>context.api.handleUpdate({message:{chat:{id},from:{first_name:'Buyer'},text:message}},env);
const state=id=>sqlite.prepare('SELECT * FROM user_states WHERE user_id=?').get(id);
const balance=id=>sqlite.prepare('SELECT balance_usd FROM users WHERE user_id=?').get(id).balance_usd;
const last=()=>messages.filter(m=>m.text).at(-1);
(async()=>{
 await context.api.ensureDbReady(DB);
 sqlite.prepare("UPDATE settings SET value=? WHERE key='bep20_addr'").run(wallet);
 for(const id of [1,99,100])sqlite.prepare('INSERT INTO users(user_id) VALUES(?)').run(id);
 await callback('dep_method_bep20');assert.equal(state(99).state,'awaiting_bep20_amount');
 await text('0');assert.equal(sqlite.prepare('SELECT COUNT(*) AS c FROM deposits').get().c,0);
 await text('50.123');assert.equal(sqlite.prepare('SELECT COUNT(*) AS c FROM deposits').get().c,0);
 await text('50');assert.equal(state(99),undefined);
 let invoice=sqlite.prepare('SELECT * FROM deposits ORDER BY id DESC LIMIT 1').get();assert.equal(invoice.amount_usd,50);assert.equal(invoice.bep20_wallet,wallet);
 let buttons=last().reply_markup.inline_keyboard.flat();assert.equal(buttons.find(b=>b.copy_text).copy_text.text,wallet);assert(buttons.some(b=>b.callback_data==='bep20_enter_deposit_'+invoice.id));
 await callback('bep20_enter_deposit_'+invoice.id,100);assert.equal(state(100),undefined);
 await callback('bep20_enter_deposit_'+invoice.id);assert.equal(state(99).state,'awaiting_bep20_hash');
 // Changing admin's receive address must not invalidate an already displayed invoice.
 await callback('adm_set_bep20',1);await text('invalid',1);assert.equal(sqlite.prepare("SELECT value FROM settings WHERE key='bep20_addr'").get().value,wallet);
 await text(newWallet,1);assert.equal(sqlite.prepare("SELECT value FROM settings WHERE key='bep20_addr'").get().value,newWallet);
 clock+=2000;payment(hash,50,wallet);await text(hash);assert.equal(balance(99),0);assert.equal(state(99).state,'awaiting_bep20_hash');assert(last().text.includes('confirmations'));
 head=112;await text(hash);assert.equal(balance(99),50);assert.equal(state(99),undefined);assert.equal(sqlite.prepare('SELECT status FROM deposits WHERE id=?').get(invoice.id).status,'completed');
 await callback('dep_setmeth_bep20_50.00',100);const second=sqlite.prepare('SELECT * FROM deposits ORDER BY id DESC LIMIT 1').get();
 await callback('bep20_enter_deposit_'+second.id,100);await text(hash,100);assert.equal(balance(100),0);assert.equal(state(100).state,'awaiting_bep20_hash');assert(last().text.includes('already been submitted'));
 await callback('bep20_cancel',100);assert.equal(state(100),undefined);
 await callback('dep_method_bep20');await text('/start');assert.equal(state(99),undefined);
 // Direct product checkout uses the same TxHash entry and fulfills exactly once.
 await callback('pay_bep20_2_1');const order=sqlite.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 1').get();assert.equal(order.bep20_wallet,newWallet);
 assert(last().reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='bep20_enter_order_'+order.id));
 await callback('bep20_enter_order_'+order.id);clock+=2000;head=212;payment('0x'+'ef'.repeat(32),5,newWallet,201);await text('0x'+'ef'.repeat(32));
 assert.equal(sqlite.prepare('SELECT status FROM orders WHERE id=?').get(order.id).status,'completed');assert.equal(state(99),undefined);assert.equal(balance(99),50);
 assert(messages.some(m=>m.text?.includes('Your Order is Delivered')));assert.equal(sqlite.prepare('SELECT COUNT(*) AS c FROM bep20_payment_claims').get().c,2);
 console.log('PASS: real SQLite BEP20 amount -> copy address -> Enter TxHash -> confirmations/retry -> wallet credit/direct delivery; snapshot address, ownership, duplicate rejection, admin address settings and cancellation');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>sqlite.close());
