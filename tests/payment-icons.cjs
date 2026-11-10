const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto');const sqlite=new DatabaseSync(':memory:'),messages=[];let validIcon=true;
const DB={prepare(sql){let args=[];const q={bind(...a){args=a;return q;},exec(){const r=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async run(){return q.exec();},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};return q;},async batch(statements){sqlite.exec('BEGIN');try{const r=statements.map(s=>s.exec());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const context=vm.createContext({console,Intl,URL,URLSearchParams,TextEncoder,crypto:webcrypto,AbortController,setTimeout,clearTimeout,capture:async(_env,method,payload)=>{messages.push({method,...payload});return method==='getCustomEmojiStickers'?{ok:true,result:validIcon?payload.custom_emoji_ids.map(custom_emoji_id=>({custom_emoji_id})):[]}:{ok:true,result:{message_id:9}};}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\ncallTg=capture;globalThis.api={ensureDbReady,handleUpdate};',context);
const {api}=context,env={DB,ADMIN_ID:1};
const cb=(data,id=1)=>api.handleUpdate({callback_query:{id:'cb',data,from:{first_name:'Tester'},message:{chat:{id},message_id:9}}},env);
const text=(value,id=1,entities)=>api.handleUpdate({message:{chat:{id},from:{first_name:'Tester'},text:value,entities}},env);
const last=()=>messages.filter(m=>m.text).at(-1),buttons=()=>last().reply_markup.inline_keyboard.flat();
const methods=['binance','bep20','bkash','nagad','rocket','redeem'];
(async()=>{
 await api.ensureDbReady(DB);for(const id of [1,99])sqlite.prepare('INSERT INTO users(user_id) VALUES(?)').run(id);
 await cb('deposit',99);const rows=last().reply_markup.inline_keyboard;
 assert(rows.every(row=>row.length===1));assert.deepEqual(Array.from(rows.slice(0,6),row=>row[0].callback_data),['dep_method_binance','dep_method_bep20','dep_method_bkash','dep_method_nagad','dep_method_rocket','redeem_open']);
 for(const row of rows.slice(0,6)){assert(!/\p{Extended_Pictographic}/u.test(row[0].text));assert.equal(row[0].icon_custom_emoji_id,undefined);}
 await cb('adm_payment_settings');assert(buttons().some(b=>b.callback_data==='adm_payment_icons'));
 await cb('adm_payment_icons');assert.equal(buttons().filter(b=>b.callback_data.startsWith('adm_payicon_')).length,6);
 await cb('adm_payicon_binance');await text('🟡');assert.equal(sqlite.prepare("SELECT value FROM settings WHERE key='payment_icon_binance'").get(),undefined);
 await text('X',1,[{type:'custom_emoji',offset:0,length:1,custom_emoji_id:'5368324170671202286'}]);
 assert.equal(sqlite.prepare("SELECT value FROM settings WHERE key='payment_icon_binance'").get().value,'5368324170671202286');
 const expected=new Map();for(const [i,method]of methods.entries()){
  const id='53683241706712022'+i;await cb('adm_payicon_'+method);await text(id);expected.set(method,id);
 }
 validIcon=false;await cb('adm_payicon_binance');await text('9999999999999999999');assert.equal(sqlite.prepare("SELECT value FROM settings WHERE key='payment_icon_binance'").get().value,expected.get('binance'));validIcon=true;
 await cb('deposit',99);for(const [i,method]of methods.entries()){const button=buttons()[i];assert.equal(button.icon_custom_emoji_id,expected.get(method));assert(!/\p{Extended_Pictographic}/u.test(button.text));}
 await cb('direct_pay_2_1',99);for(const method of methods.slice(0,5))assert.equal(buttons().find(b=>b.callback_data.startsWith('pay_'+method+'_')).icon_custom_emoji_id,expected.get(method));
 await cb('dep_needed_5.00',99);for(const method of methods.slice(0,5))assert.equal(buttons().find(b=>b.callback_data.startsWith('dep_setmeth_'+method+'_')).icon_custom_emoji_id,expected.get(method));
 await cb('dep_setmeth_binance_12.00',99);assert.equal(buttons().find(b=>b.callback_data==='dep_setmeth_bep20_12.00').icon_custom_emoji_id,expected.get('bep20'));
 await cb('adm_payicon_binance',99);assert.equal(sqlite.prepare('SELECT * FROM admin_states WHERE user_id=99').get(),undefined);
 await cb('adm_payicon_binance');await text('/remove');await cb('deposit',99);assert.equal(buttons()[0].icon_custom_emoji_id,undefined);assert.equal(buttons()[0].text,'Binance Pay (Auto)');
 const sent=[];
 const fallbackContext=vm.createContext({console:{error(){}},URL,AbortController,setTimeout,clearTimeout,fetch:async(_url,options)=>{
  sent.push(JSON.parse(options.body));return {json:async()=>sent.length===1?{ok:false,error_code:400,description:'Custom emoji is not allowed for this bot'}:{ok:true}};
 }});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\nglobalThis.call=callTg;',fallbackContext);
 const result=await fallbackContext.call({BOT_TOKEN:'fixture-token'},'sendMessage',{chat_id:99,text:'Methods',reply_markup:{inline_keyboard:[[{text:'Binance Pay',callback_data:'dep_method_binance',icon_custom_emoji_id:expected.get('binance')}]]}});
 assert.equal(result.ok,true);assert.equal(sent.length,2);assert.equal(sent[1].reply_markup.inline_keyboard[0][0].icon_custom_emoji_id,undefined);assert.equal(sent[1].reply_markup.inline_keyboard[0][0].callback_data,'dep_method_binance');
 console.log('PASS: invalid IDs cannot overwrite saved icons; rejected icons fall back to plain labels with actions intact');
 console.log('PASS: single-column order, no default method emoji, six admin custom icons, entity/numeric input, invalid ordinary emoji rejection, checkout/top-up consistency, removal and authorization');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>sqlite.close());
