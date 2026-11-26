const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto');const db=new DatabaseSync(':memory:'),messages=[];
const DB={prepare(sql){let args=[];const q={bind(...a){args=a;return q;},exec(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};},async run(){return q.exec();},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};}};return q;},async batch(stmts){db.exec('BEGIN');try{const r=stmts.map(s=>s.exec());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
const c=vm.createContext({console,Intl,URL,URLSearchParams,TextEncoder,crypto:webcrypto,AbortController,setTimeout,clearTimeout,capture:async(e,method,payload)=>{messages.push({method,...payload});return {ok:true,result:{message_id:1}};}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../_worker.js'),'utf8').replace('export default {','const worker={')+'\ncallTg=capture;globalThis.api={ensureDbReady,handleUpdate,showAdminUserProfile,showAdminUserHistory,notifyAdminForUser,showWalletHistory,walletChangeSql,handleOrderSearchText,sendOrders,processReferralCommission,showAdminSalesReport,referralCommissionEarned,sendHomeDashboard,sendProfile,sendRefer};',c);
const env={DB,ADMIN_ID:1},last=()=>messages.filter(m=>m.text).at(-1),buttons=()=>last().reply_markup.inline_keyboard.flat();
const cb=(data,id=1)=>c.api.handleUpdate({callback_query:{id:'cb',data,from:{first_name:'Admin',username:'admin_store'},message:{chat:{id},message_id:1}}},env);
const text=value=>c.api.handleUpdate({message:{chat:{id:1},from:{first_name:'Admin',username:'admin_store'},text:value}},env);
(async()=>{
 await c.api.ensureDbReady(DB);db.prepare('INSERT INTO users(user_id,balance_usd) VALUES(1,0),(99,10),(100,0)').run();
 const product=db.prepare("INSERT INTO products(name,price_usd,price_bdt,purchase_cost_usd) VALUES('Legacy product',5,625,4)").run().lastInsertRowid;
 const order=db.prepare("INSERT INTO orders(user_id,product_id,payment_method,amount_usd,status) VALUES(99,?,'WALLET',5,'completed')").run(product).lastInsertRowid;
 db.prepare('UPDATE orders SET referral_referrer_id=NULL,referral_percent=NULL,referral_commission_cents=NULL WHERE id=?').run(order);
 await DB.prepare(c.api.walletChangeSql('UPDATE users SET balance_usd=balance_usd+0.32 WHERE user_id=?','referral','buyer:99')).bind(100).run();
 await c.api.showAdminSalesReport(env,1,'all');assert(last().text.includes('Combined gross profit: $1.00'));assert(last().text.includes('Previous paid: <b>$0.32</b>'));assert(last().text.includes('Net profit: $0.68'));
 // A new linked commission is deducted once, not again as a historical payout.
 db.prepare('UPDATE users SET referred_by=100 WHERE user_id=99').run();
 const next=db.prepare("INSERT INTO orders(user_id,product_id,payment_method,amount_usd,status) VALUES(99,?,'WALLET',5,'completed')").run(product).lastInsertRowid;await c.api.processReferralCommission(env,99,5,'Product',next);
 await c.api.showAdminSalesReport(env,1,'all');assert(last().text.includes('Combined gross profit: $2.00'));assert(last().text.includes('Total referral expense: <b>$0.57</b>'));assert(last().text.includes('Net profit: $1.43'));
 db.prepare('UPDATE users SET balance_usd=0 WHERE user_id=100').run();await c.api.showAdminSalesReport(env,1,'all');assert(last().text.includes('Net profit: $1.43'));
 db.prepare("UPDATE wallet_history SET created_at='2000-01-01 00:00:00' WHERE reason='referral' AND reference='buyer:99'").run();
 await c.api.showAdminSalesReport(env,1,'today');assert(last().text.includes('Previous paid: <b>$0.00</b>'));assert(last().text.includes('Net profit: $1.75'));
 await c.api.showAdminSalesReport(env,1,'all');assert(last().text.includes('Net profit: $1.43'));
 assert.equal(db.prepare('SELECT COUNT(*) n FROM order_referral_credits').get().n,1);
 console.log('PASS: legacy $0.32 paid commission reduces $1 gross to $0.68, new commissions not double-counted, wallet spending independent and period-correct payouts');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
