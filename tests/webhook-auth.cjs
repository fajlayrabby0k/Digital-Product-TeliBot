const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
let webhookUrl='https://bot.pages.dev/api/webhook',handled=0,clock=Date.now(),setWorks=true;const calls=[];
const context=vm.createContext({console,URL,Request,Response,TextEncoder,crypto:webcrypto,setTimeout,clearTimeout,Date:class extends Date {static now(){return clock;}},
 capture:async(_env,method,payload)=>{calls.push({method,payload});return method==='getWebhookInfo'?{ok:true,result:{url:webhookUrl,max_connections:40}}:{ok:setWorks};},
 process:async()=>{handled++;}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\ncallTg=capture;handleUpdate=process;globalThis.api={worker,telegramWebhookSecret,repairTelegramWebhook};',context);
const {api}=context;
const request=(secret,url='https://bot.pages.dev/api/webhook')=>new Request(url,{method:'POST',headers:secret?{'X-Telegram-Bot-Api-Secret-Token':secret}:{},body:JSON.stringify({message:{chat:{id:1},text:'/start'}})});
(async()=>{
 const env={DB:{},BOT_TOKEN:'fixture-bot-token',ADMIN_ID:1};
 const secret=await api.telegramWebhookSecret(env.BOT_TOKEN);assert.match(secret,/^[a-f0-9]{64}$/);
 const pending=[];
 const first=await api.worker.fetch(request(),env,{waitUntil:p=>pending.push(p)});
 assert.equal(first.status,503);assert.equal(first.headers.get('Retry-After'),'1');assert.equal(handled,0,'unauthenticated admin updates must not be processed');assert.equal(pending.length,1,'repair must survive the early HTTP response');
 await Promise.all(pending);
 assert.deepEqual(calls.map(c=>c.method),['getWebhookInfo','setWebhook']);assert.equal(calls[1].payload.url,webhookUrl);assert.equal(calls[1].payload.secret_token,secret);assert.equal(calls[1].payload.drop_pending_updates,false);
 assert.equal((await api.worker.fetch(request('wrong'),env)).status,503);assert.equal(calls.length,2,'invalid requests must not repeatedly reconfigure the webhook');
 assert.equal((await api.worker.fetch(request(secret),env)).status,200);assert.equal(handled,1);
 const fixed={DB:{},BOT_TOKEN:'fixture-bot-token',TELEGRAM_WEBHOOK_SECRET:'configured-fixture-secret'};
 assert.equal((await api.worker.fetch(request(),fixed)).status,503);assert.equal(calls.at(-1).payload.secret_token,fixed.TELEGRAM_WEBHOOK_SECRET);
 assert.equal((await api.worker.fetch(request(fixed.TELEGRAM_WEBHOOK_SECRET),fixed)).status,200);assert.equal(handled,2);
 webhookUrl='https://custom-domain.example/telegram?existing=1';
 assert.equal((await api.worker.fetch(request(),{DB:{},BOT_TOKEN:'fixture-bot-token'})).status,503);
 assert.equal(calls.at(-1).payload.url,webhookUrl,'custom/proxied URLs must be preserved rather than blocking repair');
 const failed={DB:{},BOT_TOKEN:'fixture-bot-token'};setWorks=false;
 await api.worker.fetch(request(),failed);const count=calls.length;clock+=3001;setWorks=true;
 await api.worker.fetch(request(),failed);assert.equal(calls.length,count+2,'failed registration must retry after three seconds, not remain blocked for a minute');
 webhookUrl='';assert.equal(await api.repairTelegramWebhook(env,'https://bot.pages.dev/api/webhook'),true);assert.equal(calls.at(-1).payload.url,'https://bot.pages.dev/api/webhook');
 vm.runInContext('setupDatabase=async()=>{};',context);
 const recoveryEnv={...env,BOT_PUBLIC_URL:'https://bot.pages.dev'};
 const recovery=await api.worker.fetch(new Request('https://bot.pages.dev/api/setup?repair_webhook=1'),recoveryEnv);
 assert.equal(recovery.status,200);assert.equal((await recovery.json()).webhook_repaired,true);assert.equal(calls.at(-1).payload.url,'https://bot.pages.dev/api/webhook');
 assert.equal((await api.worker.fetch(new Request('https://attacker.example/api/setup?repair_webhook=1'),recoveryEnv)).status,400);
 setWorks=false;const failure=await api.worker.fetch(new Request('https://bot.pages.dev/api/setup?repair_webhook=1'),recoveryEnv);assert.equal(failure.status,502);assert.equal((await failure.json()).webhook_repaired,false);
 console.log('PASS: legacy /start returns retryable response, background webhook repair, authenticated retry, custom URL preservation, explicit-secret repair, retry after failure and forged-admin rejection');
})().catch(e=>{console.error(e);process.exitCode=1;});
