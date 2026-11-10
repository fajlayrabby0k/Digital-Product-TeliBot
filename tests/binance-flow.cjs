const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const messages=[],deposits=new Map(),orders=new Map();let state=null,nextId=1,verificationCalls=0,allowPayment=false;
const user={user_id:99,balance_usd:0,balance_bdt:0};
const DB={prepare(sql){let args=[];const statement={bind(...a){args=a;return statement;},async first(){
 if(sql.includes('FROM users'))return {...user};
 if(sql.includes('FROM user_states'))return state?{...state}:null;
 if(sql.includes('FROM settings'))return {value:({binance_id:'512576463',usd_to_bdt_rate:'125',force_channel_username:'',force_group_username:''})[args[0]]??''};
 if(sql.includes('FROM orders'))return orders.get(Number(args[0]))??null;
 if(sql.includes('FROM products'))return {id:7,name:'Local Product',price_usd:5,is_external:0};
 if(sql.includes('FROM deposits'))return deposits.get(Number(args[0]))??null;
 return null;
},async all(){return {results:[]};},async run(){
 if(sql.startsWith('INSERT OR REPLACE INTO user_states')) state=sql.includes('VALUES (?, ?, ?)')?{state:args[1],data:args[2]}:{state:sql.includes('awaiting_binance_amount')?'awaiting_binance_amount':'awaiting_binance_receipt',data:args[1]??'{}'};
 if(sql.startsWith('DELETE FROM user_states')){
  if(!sql.includes('AND data = ?')||state?.data===args[1]) state=null;
 }
 if(sql.startsWith('INSERT INTO orders')){orders.set(8,{id:8,user_id:args[0],payment_method:args[4],amount_usd:args[5],product_id:7,status:'pending',created_at:new Date().toISOString()});return {meta:{last_row_id:8}};}
 if(sql.startsWith('INSERT INTO deposits')){
  const id=nextId++;deposits.set(id,{id,user_id:args[0],username:args[1],amount_usd:args[2],method:'BINANCE',status:'pending',created_at:new Date().toISOString()});return {meta:{last_row_id:id}};
 }
 if(sql.startsWith('UPDATE deposits'))Object.assign(deposits.get(Number(args[3])),{amount_usd:args[0],amount_bdt:args[1],trx_id:args[2],status:'completed'});
 if(sql.startsWith('UPDATE users')){user.balance_usd+=args[0];user.balance_bdt+=args[1];}
 return {success:true};
}};return statement;},async batch(statements){return await Promise.all(statements.map(s=>s.run()));}};
const context=vm.createContext({console,Intl,URL,TextEncoder,AbortController,setTimeout,clearTimeout,
 capture:async(_env,method,payload)=>{messages.push({method,...payload});return {ok:true};},
 verify:async(_env,id,amount,invoice)=>{verificationCalls++;assert.equal(id,'1234567890123');assert.equal(amount,5);assert.equal(invoice.type,'deposit');return allowPayment?{success:true,paidAmount:5,orderId:id}:{success:false,message:'Not found. Try again.'};}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\nisDbInitialized=true;callTg=capture;verifyBinancePayOrder=verify;globalThis.handle=handleUpdate;',context);
const env={DB,ADMIN_ID:1};
const cb=(data,id=99)=>context.handle({callback_query:{id:'callback',data,from:{first_name:'Buyer'},message:{chat:{id},message_id:12}}},env);
const text=message=>context.handle({message:{chat:{id:99},from:{first_name:'Buyer'},text:message}},env);
const lastMessage=()=>messages.filter(m=>m.text).at(-1);
(async()=>{
 await cb('dep_method_binance');assert.equal(state.state,'awaiting_binance_amount');assert(lastMessage().text.includes('How much USDT'));
 await text('0');assert.equal(deposits.size,0);assert.equal(state.state,'awaiting_binance_amount');
 await text('5.123');assert.equal(deposits.size,0);
 await text('11');assert.equal(deposits.size,0);assert(lastMessage().text.includes('$10.00'));assert(lastMessage().reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='dep_setmeth_bep20_11.00'));
 await cb('dep_method_binance');await text('5');assert.equal(deposits.size,1);assert.equal(state,null);
 let buttons=lastMessage().reply_markup.inline_keyboard.flat();
 assert.equal(buttons.find(b=>b.copy_text).copy_text.text,'512576463');assert(buttons.some(b=>b.callback_data==='binance_enter_deposit_1'));
 await cb('binance_enter_deposit_1',100);assert.equal(state,null); // Other account cannot capture the invoice.
 await cb('binance_enter_deposit_1');assert.equal(state.state,'awaiting_binance_receipt');assert(lastMessage().text.includes('Paste the Order ID'));
 await text('1234567890123');assert.equal(verificationCalls,1);assert.equal(user.balance_usd,0);assert.equal(state.state,'awaiting_binance_receipt');
 allowPayment=true;await text('1234567890123');assert.equal(user.balance_usd,5);assert.equal(deposits.get(1).status,'completed');assert.equal(state,null);
 await cb('binance_enter_deposit_1');assert.equal(state,null);
 await cb('dep_method_binance');await cb('binance_cancel');assert.equal(state,null);
 await cb('dep_method_binance');await text('/start');assert.equal(state,null);
 await cb('dep_method_binance');await cb('deposit');assert.equal(state,null);
 await cb('dep_setmeth_binance_12.00');assert.equal(deposits.size,1);assert(lastMessage().text.includes('$10.00'));
 await cb('pay_binance_7_1');
 assert.equal(orders.size,1);
 assert(lastMessage().reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='binance_enter_order_8'));
 await cb('binance_enter_order_8');assert.equal(JSON.parse(state.data).type,'order');
 await cb('binance_cancel');assert.equal(state,null);
 console.log('PASS: direct checkout uses Copy Pay ID and Enter Order ID without requiring Reply');
 console.log('PASS: typed amount, $10 cap, BEP20 alternative, copy Pay ID, receipt-entry button, ownership, retry, wallet credit, cancel and navigation');
})().catch(e=>{console.error(e);process.exitCode=1;});
