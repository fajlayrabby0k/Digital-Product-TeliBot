const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');const {performance}=require('node:perf_hooks');
const sqlite=new DatabaseSync(':memory:');
let networkCalls=0,inflight=0,maxInflight=0,queries=[],clock=Date.now(),tgCalls=[],member=true,notModified=false,providerCalls=0,providerStock=4;
const reset=()=>{networkCalls=0;maxInflight=0;queries=[];};
async function roundtrip(sql){networkCalls++;queries.push(sql);inflight++;maxInflight=Math.max(maxInflight,inflight);await new Promise(r=>setTimeout(r,5));inflight--;}
const DB={prepare(sql){let args=[];const statement={bind(...a){args=a;return statement;},exec(){const r=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async run(){await roundtrip(sql);return statement.exec();},async first(){await roundtrip(sql);return sqlite.prepare(sql).get(...args)||null;},async all(){await roundtrip(sql);return {results:sqlite.prepare(sql).all(...args)};}};return statement;},async batch(statements){await roundtrip('D1 batch');sqlite.exec('BEGIN');try{const r=statements.map(s=>s.exec());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const source=fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={');
function load(){const context=vm.createContext({console,Intl,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,Date:class extends Date{static now(){return clock;}},
 capture:async(_env,method,payload)=>{tgCalls.push(method);if(method==='getChatMember'){await new Promise(r=>setTimeout(r,5));return {ok:true,result:{status:member?'member':'left'}};}if(method==='editMessageText'&&notModified)return {ok:false,description:'Bad Request: message is not modified'};return {ok:true,result:{message_id:9}};},
 fetch:async()=>{providerCalls++;return {ok:true,json:async()=>({products:[{id:'provider-a',name:'A',price:2,stock:providerStock,available:true}]})};}});
 vm.runInContext(source+'\ncallTg=capture;globalThis.api={schemaVersion:DB_SCHEMA_VERSION,ensureDbReady,getSetting,sendAdminDashboard,sendHomeDashboard,checkForceJoin,syncExternalProducts};',context);return context.api;}
(async()=>{
 let api=load();let start=performance.now();await Promise.all([api.ensureDbReady(DB),api.ensureDbReady(DB),api.ensureDbReady(DB)]);const installationCalls=networkCalls;
 assert(installationCalls<20,'initial migrations must batch database work and share one initialization');
 assert.equal(sqlite.prepare("SELECT value FROM settings WHERE key='__schema_version'").get().value,api.schemaVersion);
 const plan=sqlite.prepare('EXPLAIN QUERY PLAN SELECT COUNT(*) FROM inventory WHERE product_id=2 AND is_sold=0').all();assert(plan.some(row=>row.detail.includes('inventory_available')));
 reset();api=load();start=performance.now();await api.ensureDbReady(DB);const coldMs=performance.now()-start;assert.equal(networkCalls,1,'a new isolate must reuse the persisted schema version');
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM products').get().n,3);
 reset();const requestEnv={DB,__requestSettings:new Map()};await Promise.all(Array.from({length:15},()=>api.getSetting(requestEnv,'usd_to_bdt_rate','125')));assert.equal(networkCalls,1,'same-update settings reads share the pending query');
 sqlite.prepare("UPDATE settings SET value='126' WHERE key='usd_to_bdt_rate'").run();assert.equal(await api.getSetting({DB,__requestSettings:new Map()},'usd_to_bdt_rate','125'),'126','fresh updates must see changed settings');
 reset();await api.sendAdminDashboard({DB,ADMIN_ID:1},1);assert(maxInflight>=8,'dashboard reads must overlap instead of serializing ten round trips');
 sqlite.prepare("UPDATE settings SET value='@channel' WHERE key='force_channel_username'").run();sqlite.prepare("UPDATE settings SET value='@group' WHERE key='force_group_username'").run();
 tgCalls=[];assert.equal((await api.checkForceJoin({DB},99)).passed,true);assert.equal(tgCalls.length,2);
 assert.equal((await api.checkForceJoin({DB},99)).passed,true);assert.equal(tgCalls.length,2,'browsing should reuse a recent successful membership check');
 member=false;assert.equal((await api.checkForceJoin({DB},99,true)).passed,false);assert.equal(tgCalls.length,4,'payment/explicit Verify must bypass the success cache');
 assert.equal((await api.checkForceJoin({DB},99)).passed,false);assert.equal(tgCalls.length,6,'failed membership checks must not be cached');
 member=true;await api.checkForceJoin({DB},99);clock+=15001;member=false;assert.equal((await api.checkForceJoin({DB},99)).passed,false);
 sqlite.prepare("UPDATE settings SET value='fixture-key' WHERE key='external_api_key'").run();
 assert.equal((await api.syncExternalProducts({DB},null,null,false,null,false)).success,true);assert.equal(providerCalls,1);
 reset();assert.equal((await api.syncExternalProducts({DB},null,null,false,null,false)).success,true);assert.equal(providerCalls,1);assert(!queries.some(q=>q.includes('FROM products')||q.includes('last_external_sync_time')),'cached full snapshots must not reread/rewrite the catalog');
 providerStock=0;await api.syncExternalProducts({DB},null,null,false,null,true);assert.equal(providerCalls,2);assert.equal(sqlite.prepare("SELECT api_stock FROM products WHERE external_id='provider-a'").get().api_stock,0,'forced stock checks must see the current provider quantity');
 reset();await api.syncExternalProducts({DB},null,null,false,'provider-a',true);assert(queries.some(q=>q.includes('AND external_id = ?')),'single-product checks must query only that product');
 tgCalls=[];notModified=true;await api.sendHomeDashboard({DB},99,{balance_usd:0},'Buyer',9);assert.equal(tgCalls.filter(m=>m==='editMessageText').length,1);assert(!tgCalls.includes('sendMessage'),'an identical edit must not produce a duplicate message');
 console.log(`PASS: first installation ${installationCalls} D1 round trips; subsequent cold runtime 1 query (${coldMs.toFixed(1)}ms with simulated 5ms database latency)`);
 console.log('PASS: initialization deduplication, inventory index, per-update settings reuse/freshness, parallel dashboard, bounded membership cache/fresh payment checks, provider snapshot fast path and duplicate-edit prevention');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>sqlite.close());
