const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../_worker.js'),'utf8').replace('export default {','const worker = {');
let catalog, fail = false;
let catalogReads = 0, productLookups = 0, productWrites = 0;
const products = [{id:1,external_id:'a',api_stock:10,custom_price_usd:0,is_external:1},{id:2,external_id:'removed',api_stock:9,is_external:1}];
const settings = {external_api_url:'https://provider.example',external_api_key:'test',external_profit_margin:'20',usd_to_bdt_rate:'125'};
const DB = {prepare(sql){let args;return {bind(...a){args=a;return this},async first(){if(sql.includes("FROM products")) productLookups++;if(sql.includes('FROM settings'))return {value:settings[args[0]]};if(sql.includes('WHERE external_id'))return products.find(p=>p.external_id===args[0]);if(sql.includes('FROM products WHERE id'))return {...products.find(p=>p.id===args[0])};},async all(){if(sql.includes("FROM products")) catalogReads++;if(sql.includes('FROM preorders'))return {results:[]};return {results:products.map(p=>({...p}))}},async run(){if(sql.startsWith("UPDATE products")) productWrites++;if(sql.startsWith('UPDATE products SET name')){const p=products.find(p=>p.id===args[6]);Object.assign(p,{description:args[1],cost_price_usd:args[2],is_active:1,name:args[0],api_stock:args[5],price_usd:args[3],price_bdt:args[4]});}else if(sql.startsWith('UPDATE products SET api_stock = 0'))products.find(p=>p.id===args[0]).api_stock=0;return {success:true}}}}};
const context = vm.createContext({console,URL,Response,Request,AbortController,setTimeout,clearTimeout,fetch:async()=>{if(fail)throw Error('offline');return Response.json({products:catalog})}});
vm.runInContext(source+'\nglobalThis.api={providerProductName,providerStock,syncExternalProducts,fetchLiveProductStock,checkExternalStock,checkForceJoin};',context);
(async()=>{
const {api}=context;
for (const [item, expected] of [
  [{name:'NordVPN'}, 'NordVPN'],
  [{name:'🟢 Original Product'}, '🟢 Original Product'],
  [{name:'🍿 Prime', emoji:'🔥'}, '🍿 Prime'],
  [{name:'Prime', emoji:'🎬'}, '🎬 Prime'],
  [{name:'Product', icon:'https://example.com/icon.png'}, 'Product']
]) assert.equal(api.providerProductName(item), expected);

for(const [input,expected] of [[{stock:0,available:true},0],[{stock:7},7],[{stock:0,remains:8},0],[{remains:'4'},4],[{available:true},0],[{stock:9,available:false},0],[{stock:-1},0]])assert.equal(api.providerStock(input),expected);
catalog=[{id:'a',name:'A',price:2,stock:3,available:true}];
assert.equal((await api.syncExternalProducts({DB})).success,true);
assert.equal(products[0].name,'A');assert.equal(products[0].api_stock,3);assert.equal(products[1].api_stock,0);
products[0].custom_icon='💎';
catalog=[{id:'a',name:'Original',emoji:'🎬',price:2,stock:0,available:true}];
let fresh=await api.fetchLiveProductStock({DB},products[0]);assert.equal(fresh.custom_icon,'💎');assert.equal(fresh.name,'🎬 Original');assert.equal(fresh.api_stock,0);assert.equal(fresh.stock_verified,true);
assert.equal(await api.checkExternalStock({DB},1,fresh,1),false);
catalog=[];products[0].api_stock=12;assert.equal((await api.syncExternalProducts({DB})).success,true);assert.equal(products[0].api_stock,0);
fail=true;products[0].api_stock=8;fresh=await api.fetchLiveProductStock({DB},products[0]);assert.equal(fresh.stock_verified,false);assert.equal(products[0].api_stock,8);assert.equal(await api.checkExternalStock({DB},1,fresh,1),false);
// A detail refresh must not rewrite or reconcile unrelated products.
fail=false;products[1].api_stock=9;
catalog=[{id:'a',name:'A',price:2,stock:4,available:true}];
catalogReads=productLookups=productWrites=0;
fresh=await api.fetchLiveProductStock({DB},products[0]);
assert.equal(fresh.api_stock,4);assert.equal(products[1].api_stock,9);
assert.equal(catalogReads,1);assert.equal(productLookups,1);assert.equal(productWrites,1);
// Full sync uses one catalog read, regardless of the number of products.
for(let i=0;i<100;i++)products.push({id:i+10,external_id:'bulk'+i,api_stock:0,is_external:1});
catalog=products.map(p=>({id:p.external_id,name:'Product '+p.id,price:2,stock:3,available:true}));
catalogReads=productLookups=productWrites=0;
assert.equal((await api.syncExternalProducts({DB})).success,true);
assert.equal(catalogReads,1);assert.equal(productLookups,0);
assert.equal(products.at(-1).api_stock,3);
productWrites=0;
assert.equal((await api.syncExternalProducts({DB})).success,true);
assert.equal(productWrites,0, 'unchanged catalogs must not rewrite products');
settings.force_channel_username='@channel';settings.force_group_username='@group';
const membershipCalls=[];
context.membershipProbe=(_env,method,payload)=>new Promise(resolve=>membershipCalls.push({method,payload,resolve}));
vm.runInContext('callTg = membershipProbe;',context);
const membership=api.checkForceJoin({DB},123);
await new Promise(resolve=>setImmediate(resolve));
assert.equal(membershipCalls.length,2,'channel and group requests must start concurrently');
membershipCalls[0].resolve({ok:true,result:{status:'member'}});
membershipCalls[1].resolve({ok:true,result:{status:'left'}});
assert.equal((await membership).passed,false,'parallel checks must still block non-members');
console.log('PASS: membership requests run concurrently and retain access checks');
console.log('PASS: unchanged catalogs produce zero product writes');
console.log('PASS: targeted refresh changes only one product; 102-product sync uses one catalog read and no per-product lookups');
console.log('PASS: exact quantities, zero stock, removed products, empty catalog, provider failure and checkout guards');
})().catch(e=>{console.error(e);process.exitCode=1});
