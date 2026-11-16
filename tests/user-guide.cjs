const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto');const db=new DatabaseSync(':memory:'),messages=[];
const DB={prepare(sql){let args=[];const q={bind(...a){args=a;return q;},exec(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async run(){return q.exec();},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};}};return q;},async batch(stmts){db.exec('BEGIN');try{const r=stmts.map(s=>s.exec());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
const c=vm.createContext({console,Intl,URL,URLSearchParams,TextEncoder,crypto:webcrypto,AbortController,setTimeout,clearTimeout,capture:async(e,method,payload)=>{messages.push({method,...payload});return {ok:true,result:{message_id:1}};}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\ncallTg=capture;globalThis.api={ensureDbReady,handleUpdate,showAdminUserProfile,showAdminUserHistory,notifyAdminForUser,handleGuideText,GUIDE_BENGALI_DEFAULTS};',c);
const env={DB,ADMIN_ID:1},last=()=>messages.filter(m=>m.text).at(-1),buttons=()=>last().reply_markup.inline_keyboard.flat();
const cb=(data,id=1)=>c.api.handleUpdate({callback_query:{id:'cb',data,from:{first_name:'Admin',username:'admin_store'},message:{chat:{id},message_id:1}}},env);
const text=value=>c.api.handleUpdate({message:{chat:{id:1},from:{first_name:'Admin',username:'admin_store'},text:value}},env);
(async()=>{
 await c.api.ensureDbReady(DB);for(const id of [1,99])db.prepare('INSERT INTO users(user_id,balance_usd) VALUES(?,20)').run(id);
 const userText=value=>c.api.handleUpdate({message:{chat:{id:99},from:{first_name:'Buyer'},text:value}},env);
 await userText('/help@MyBot');assert(last().text.includes('User Guide'));assert(buttons().some(b=>b.callback_data==='guide_payment'));
 await cb('guide_payment',99);assert(last().text.includes('60 minutes'));assert(last().text.includes('10 minutes'));assert(last().text.includes('12 confirmations'));assert(last().text.includes('$10'));assert(last().text.includes('Rocket'));
 for(const section of ['payment','delivery','warranty','refund','faq']){await cb('guide_'+section,99);assert(!/[\u0980-\u09FA]/.test(last().text),section+' is English');assert(buttons().every(b=>!/[\u0980-\u09FA]/.test(b.text)));}
 db.prepare('UPDATE settings SET value=? WHERE key=?').run(c.api.GUIDE_BENGALI_DEFAULTS.guide_delivery,'guide_delivery');await c.api.ensureDbReady(DB,true);await cb('guide_delivery',99);assert(last().text.includes('Place an order'));assert(!/[\u0980-\u09FA]/.test(last().text));
 await cb('adm_edit_guide_warranty');await text('Warranty applies <only> as described.');assert(last().text.includes('saved'));await cb('guide_warranty',99);assert(last().text.includes('&lt;only&gt;'));
 await cb('adm_edit_guide_refund');await text('');assert.equal(db.prepare('SELECT state FROM admin_states WHERE user_id=1').get().state,'awaiting_guide_text');await cb('adm_guide');assert.equal(db.prepare('SELECT * FROM admin_states WHERE user_id=1').get(),undefined);
 await cb('adm_edit_guide_delivery');await text('/help');assert(last().text.includes('User Guide'));assert.equal(db.prepare('SELECT * FROM admin_states WHERE user_id=1').get(),undefined);
 await cb('adm_edit_guide_faq',99);assert.equal(db.prepare('SELECT * FROM admin_states WHERE user_id=99').get(),undefined);assert.equal(await c.api.handleGuideText(env,99,'Change',{state:'awaiting_guide_text',data:'guide_faq'}),false);
 await cb('guide_faq',99);assert(last().text.includes('FAQ'));assert.equal(db.prepare('SELECT balance_usd FROM users WHERE user_id=99').get().balance_usd,20);
 await cb('adm_guide');for(const key of ['title','intro','payment','delivery','warranty','refund','faq'])assert(buttons().some(b=>b.callback_data==='adm_edit_guide_'+key));
 await cb('adm_edit_guide_title');await text('My Store Guide');await cb('adm_edit_guide_intro');await text('Welcome <everyone>');await cb('user_guide',99);assert(last().text.includes('My Store Guide'));assert(last().text.includes('&lt;everyone&gt;'));
 await cb('adm_edit_guide_payment');await text('নিজস্ব পেমেন্ট নির্দেশনা। 1 USD = {rate} BDT');db.prepare("UPDATE settings SET value='130' WHERE key='usd_to_bdt_rate'").run();await cb('guide_payment',99);assert(last().text.includes('নিজস্ব পেমেন্ট নির্দেশনা'));assert(last().text.includes('130 BDT'));assert(!last().text.includes('{rate}'));
 await cb('adm_edit_guide_title');await text('x'.repeat(81));assert.equal(db.prepare("SELECT value FROM settings WHERE key='guide_title'").get().value,'My Store Guide');await cb('adm_guide');
 await cb('adm_reset_guide_payment',99);assert(db.prepare("SELECT value FROM settings WHERE key='guide_payment'").get().value.includes('নিজস্ব'));await cb('adm_reset_guide_payment');await cb('guide_payment',99);assert(last().text.includes('60 minutes'));assert(last().text.includes('$10'));
 await c.api.ensureDbReady(DB,true);await cb('user_guide',99);assert(last().text.includes('My Store Guide'));assert(last().text.includes('&lt;everyone&gt;'));
 console.log('PASS: user guide/payment rules, editable policies, HTML escaping, cancellation/navigation, admin-only editing and unchanged finances');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
