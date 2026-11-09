const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
let webhookUrl='https://bot.pages.dev/api/webhook',handled=0;const calls=[];
const context=vm.createContext({console,URL,Request,Response,TextEncoder,crypto:webcrypto,setTimeout,clearTimeout,
 capture:async(_env,method,payload)=>{calls.push({method,payload});return method==='getWebhookInfo'?{ok:true,result:{url:webhookUrl,max_connections:40}}:{ok:true};},
 process:async()=>{handled++;}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\ncallTg=capture;handleUpdate=process;globalThis.api={worker,telegramWebhookSecret};',context);
const {api}=context;
const request=(secret,url='https://bot.pages.dev/api/webhook')=>new Request(url,{method:'POST',headers:secret?{'X-Telegram-Bot-Api-Secret-Token':secret}:{},body:JSON.stringify({message:{chat:{id:1},text:'10'}})});
(async()=>{
 const env={DB:{},BOT_TOKEN:'fixture-bot-token',ADMIN_ID:1};
 const secret=await api.telegramWebhookSecret(env.BOT_TOKEN);assert.match(secret,/^[a-f0-9]{64}$/);
 assert.equal((await api.worker.fetch(request(),env)).status,403);assert.equal(handled,0,'spoofed admin updates must not be processed');
 assert.deepEqual(calls.map(c=>c.method),['getWebhookInfo','setWebhook']);assert.equal(calls[1].payload.url,webhookUrl);assert.equal(calls[1].payload.secret_token,secret);assert.equal(calls[1].payload.drop_pending_updates,false);
 assert.equal((await api.worker.fetch(request('wrong'),env)).status,403);assert.equal(calls.length,2,'invalid-header requests must not repeatedly reconfigure the webhook');
 assert.equal((await api.worker.fetch(request(secret),env)).status,200);assert.equal(handled,1);
 const fixed={DB:{},BOT_TOKEN:'fixture-bot-token',TELEGRAM_WEBHOOK_SECRET:'configured-fixture-secret'};
 assert.equal((await api.worker.fetch(request(),fixed)).status,403);assert.equal(calls.length,2);
 assert.equal((await api.worker.fetch(request(fixed.TELEGRAM_WEBHOOK_SECRET),fixed)).status,200);assert.equal(handled,2);
 webhookUrl='https://another.pages.dev/api/webhook';const before=calls.length;
 assert.equal((await api.worker.fetch(request(),{DB:{},BOT_TOKEN:'fixture-bot-token'})).status,403);assert.equal(calls.length,before+1,'never redirect an existing webhook to the incoming request host');
 console.log('PASS: forged-admin rejection, secret authentication, existing-secret compatibility, bounded auto-bootstrap, URL preservation and pending-update retention');
})().catch(e=>{console.error(e);process.exitCode=1;});
