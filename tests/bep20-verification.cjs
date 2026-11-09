const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const hash='0x'+'ab'.repeat(32),wallet='0x'+'12'.repeat(20),blockHash='0x'+'cd'.repeat(32);
const token='0x55d398326f99059ff775485246999027b3197955';
const topic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const now=Date.now(),invoice={type:'order',id:1,user_id:99,status:'pending',created_at:new Date(now-120000).toISOString()};
const transfer=(amount,to=wallet,address=token)=>({address,topics:[topic,'0x'+'34'.repeat(32),'0x'+to.slice(2).padStart(64,'0')],data:'0x'+amount.toString(16).padStart(64,'0')});
let claims=[],used=false,address=wallet,chain='0x38',head='0x6f',timestamp='0x'+Math.floor((now-60000)/1000).toString(16),outage=false;
let receipt;
function reset(){claims=[];used=false;address=wallet;chain='0x38';head='0x6f';timestamp='0x'+Math.floor((now-60000)/1000).toString(16);outage=false;receipt={transactionHash:hash,status:'0x1',blockNumber:'0x64',blockHash,logs:[transfer(5n*10n**18n)]};}
const DB={prepare(sql){let args;return {bind(...a){args=a;return this;},async first(){
 if(sql.includes('FROM settings'))return {value:address};
 if(sql.includes('FROM bep20_payment_claims'))return claims.find(c=>c.hash===args[0]||(c.type===args[1]&&c.invoice===args[2]))||null;
 return used?{id:9}:null;
},async run(){if(sql.startsWith('INSERT INTO bep20_payment_claims')){
 if(claims.some(c=>c.hash===args[0]||(c.type===args[1]&&c.invoice===args[2])))throw Error('UNIQUE');
 claims.push({hash:args[0],type:args[1],invoice:args[2],amount:args[4]});
}return {success:true};}}}};
const context=vm.createContext({console,URL,AbortController,setTimeout,clearTimeout,fetch:async(_url,options)=>{
 if(outage)throw Error('offline');
 const {method}=JSON.parse(options.body);
 const result=({eth_chainId:chain,eth_getTransactionReceipt:receipt,eth_blockNumber:head,eth_getBlockByNumber:{number:'0x64',hash:blockHash,timestamp}})[method];
 return {ok:true,json:async()=>({jsonrpc:'2.0',id:1,result})};
}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\nglobalThis.verify=verifyBscUsdtTx;',context);
const verify=(inv=invoice,expected=5,tx=hash)=>context.verify({DB},tx,expected,inv);
(async()=>{
 reset();const good=await verify();assert.equal(good.success,true);assert.equal(good.paidAmount,5);assert.equal(claims[0].amount,'5000000000000000000');
 assert.equal((await verify(invoice,5,hash.toUpperCase().replace('0X','0x'))).reason,'already_used');
 reset();head='0x65';assert.equal((await verify()).reason,'confirmations');assert.equal(claims.length,0);
 reset();receipt.status='0x0';assert.equal((await verify()).reason,'tx_failed');
 reset();receipt.logs=[transfer(5n*10n**18n,'0x'+'99'.repeat(20))];assert.equal((await verify()).reason,'recipient_mismatch');
 reset();receipt.logs=[transfer(5n*10n**18n,wallet,'0x'+'99'.repeat(20))];assert.equal((await verify()).reason,'recipient_mismatch');
 reset();receipt.logs=[transfer(5n*10n**18n-1n)];assert.equal((await verify()).reason,'amount_low');assert.equal(claims.length,0);
 reset();receipt.logs=[transfer(2n*10n**18n),transfer(3n*10n**18n)];assert.equal((await verify()).paidAmount,5);
 reset();timestamp='0x'+Math.floor((now-180000)/1000).toString(16);assert.equal((await verify()).reason,'old_payment');
 reset();chain='0x1';assert.equal((await verify()).success,false);
 reset();receipt.blockHash='0x'+'ff'.repeat(32);assert.equal((await verify()).success,false);
 reset();receipt=null;assert.equal((await verify()).reason,'not_found');
 reset();outage=true;assert.equal((await verify()).reason,'rpc_unavailable');
 reset();address='0x123';assert.equal((await verify()).reason,'no_wallet');
 reset();used=true;assert.equal((await verify()).reason,'already_used');
 reset();assert.equal((await verify({...invoice,status:'completed'})).reason,'invalid_invoice');
 reset();const concurrent=await Promise.all([verify(),verify()]);assert.equal(concurrent.filter(r=>r.success).length,1);assert.equal(claims.length,1);
 reset();assert.equal((await verify({...invoice,type:'deposit'},0)).paidAmount,5);
 console.log('PASS: BSC chain, USDT token/recipient, 12 confirmations, canonical block, exact amounts, combined logs, old/failed/pending transactions, RPC failure and concurrent replay protection');
})().catch(e=>{console.error(e);process.exitCode=1;});
