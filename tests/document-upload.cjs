const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let request;
const c=vm.createContext({console,FormData,Blob,AbortController,setTimeout,clearTimeout,fetch:async(url,options)=>{request={url,...options};return {json:async()=>({ok:true})};}});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\nglobalThis.api={callTg};',c);
(async()=>{
 const content='Order ID: 58241\nবাংলা\nuser@example.com\n<&> secret\n'+'LONG-CODE\n'.repeat(1500);
 const sent=await c.api.callTg({BOT_TOKEN:'test-token'},'sendDocument',{chat_id:99,document:{filename:'Order-58241.txt',content},caption:'Your product',reply_markup:{inline_keyboard:[[{text:'Orders',callback_data:'my_orders'}]]}});
 assert(sent.ok);assert(request.url.endsWith('/sendDocument'));assert(request.body instanceof FormData);assert.equal(request.headers['Content-Type'],undefined);const file=request.body.get('document');assert.equal(file.name,'Order-58241.txt');assert.equal(await file.text(),content);assert.equal(request.body.get('chat_id'),'99');assert.equal(JSON.parse(request.body.get('reply_markup')).inline_keyboard[0][0].callback_data,'my_orders');
 await c.api.callTg({BOT_TOKEN:'test-token'},'sendMessage',{chat_id:99,text:'hello'});assert.equal(request.headers['Content-Type'],'application/json');assert.equal(JSON.parse(request.body).text,'hello');
 console.log('PASS: multipart UTF-8 document upload preserves raw credentials and long content, filename and keyboard; ordinary messages retain JSON transport');
})().catch(e=>{console.error(e);process.exitCode=1;});
