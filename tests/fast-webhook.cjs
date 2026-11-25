const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto');const db=new DatabaseSync(':memory:'),messages=[];
const DB={prepare(sql){let args=[];const q={bind(...a){args=a;return q;},exec(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async run(){return q.exec();},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};}};return q;},async batch(stmts){db.exec('BEGIN');try{const r=stmts.map(s=>s.exec());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
const c=vm.createContext({console,Intl,URL,URLSearchParams,TextEncoder,crypto:webcrypto,AbortController,setTimeout,clearTimeout,capture:async(e,method,payload)=>{messages.push({method,...payload});return {ok:true,result:{message_id:1}};}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\ncallTg=capture;globalThis.api={ensureDbReady,handleUpdate,showAdminUserProfile,showAdminUserHistory,notifyAdminForUser,drainProductNotices,parseStockItems,showShopCategories,sendCategoryProducts,processBotUpdate};',c);
const env={DB,ADMIN_ID:1},last=()=>messages.filter(m=>m.text).at(-1),buttons=()=>last().reply_markup.inline_keyboard.flat();
const cb=(data,id=1)=>c.api.handleUpdate({callback_query:{id:'cb',data,from:{first_name:'Admin',username:'admin_store'},message:{chat:{id},message_id:1}}},env);
const text=value=>c.api.handleUpdate({message:{chat:{id:1},from:{first_name:'Admin',username:'admin_store'},text:value}},env);
(async()=>{
 await c.api.ensureDbReady(DB);db.prepare('INSERT INTO users(user_id) VALUES(1)').run();
 const pending=[],ctx={waitUntil(p){pending.push(p);}},scoped={...env,__executionContext:ctx};
 const id=db.prepare("INSERT INTO product_categories(name) VALUES('Fast Category')").run().lastInsertRowid;
 db.prepare("INSERT INTO products(name,price_usd,price_bdt,shop_category_id) VALUES('Fast Product',5,625,?)").run(id);
 vm.runInContext('globalThis.syncCalls=0;globalThis.releaseSync=null;syncExternalProducts=()=>{syncCalls++;return new Promise(resolve=>{releaseSync=resolve;});};',c);
 await c.api.showShopCategories(scoped,1);assert(last().text.includes('Shop Categories'));assert.equal(c.syncCalls,1);
 await c.api.sendCategoryProducts(scoped,1,id);assert(last().text.includes('Fast Category'));assert(last().text.includes('latest saved sync'));assert.equal(c.syncCalls,1,'concurrent browsing shares the pending sync');
 c.releaseSync({success:true});await Promise.all(pending);pending.length=0;
 let refreshed=false;const refresh=c.api.showShopCategories(scoped,1,null,true).then(()=>{refreshed=true;});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(refreshed,false,'explicit refresh waits for live sync');c.releaseSync({success:true});await refresh;
 let directDone=false;const direct=c.api.showShopCategories(env,1).then(()=>{directDone=true;});await new Promise(resolve=>setImmediate(resolve));assert.equal(directDone,false,'without a context the sync must finish');c.releaseSync({success:true});await direct;
 // A callback must be acknowledged before database initialization is released.
 vm.runInContext('globalThis.releaseDb=null;ensureDbReady=()=>new Promise(resolve=>{releaseDb=resolve;});',c);
 messages.length=0;
 const job=c.api.processBotUpdate({callback_query:{id:'fast-callback',data:'home',from:{first_name:'Admin'},message:{chat:{id:1},message_id:1}}},env,'https://example.test',ctx);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(messages.filter(m=>m.method==='answerCallbackQuery').length,1);assert(!messages.some(m=>m.text));
 c.releaseDb();await job;await Promise.all(pending);assert.equal(messages.filter(m=>m.method==='answerCallbackQuery').length,1,'no duplicate callback ack');assert(messages.some(m=>m.text?.includes('Welcome to')));
 console.log('PASS: slow supplier does not block browsing, shared background sync, awaited explicit refresh/fallback and callback ack before database initialization');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
