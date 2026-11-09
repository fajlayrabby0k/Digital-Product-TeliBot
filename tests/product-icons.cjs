const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const product = { id: 5, name: '🛡️ Provider VPN', is_external: 1, custom_icon: null };
const messages = [];
let state = null, writes = 0, listStock = 0;
const DB = { prepare(sql) {
  let args;
  return {
    bind(...values) { args = values; return this; },
    async first() {
      if (sql.includes('FROM products')) return Number(args[0]) === product.id ? {...product} : null;
      return null;
    },
    async all() { return {results:[{...product,stock_qty:listStock,price_usd:5}]}; },
    async run() {
      if (sql.startsWith('UPDATE products SET custom_icon')) { product.custom_icon = args[0]; writes++; }
      if (sql.startsWith('INSERT OR REPLACE INTO admin_states')) state = { state: 'awaiting_product_icon', data: args[1] };
      if (sql.startsWith('DELETE FROM admin_states')) state = null;
      return { success: true };
    }
  };
} };
const context = vm.createContext({ console, Intl, setTimeout, clearTimeout, capture: async (env, method, payload) => {
  messages.push({method, ...payload}); return {ok:true};
}});
const source = fs.readFileSync(path.join(__dirname, '../_worker.js'), 'utf8').replace('export default {', 'const worker = {');
vm.runInContext(source + '\nisDbInitialized = true; callTg = capture; globalThis.api = {renderProductDescription,productDisplayName,validProductIcon,saveProductIcon,handleProductIconText,handleUpdate};', context);
const {api} = context;
const env = {DB, ADMIN_ID:'1'};
const callback = (data, id=1) => api.handleUpdate({callback_query:{id:'cb',data,from:{first_name:'Admin'},message:{chat:{id},message_id:10}}},env);
(async()=>{
  assert.equal(api.productDisplayName(product), '🛡️ Provider VPN');
  assert.equal(api.renderProductDescription('[5282843764451195532] Lovable <Pro> & More'),
    '<tg-emoji emoji-id="5282843764451195532">▫️</tg-emoji> Lovable &lt;Pro&gt; &amp; More');
  assert.equal(api.renderProductDescription('[123] days [support]'), '[123] days [support]');
  assert.equal(api.renderProductDescription('[5282843764451195532] One\n[523442290708985472] Two'),
    '<tg-emoji emoji-id="5282843764451195532">▫️</tg-emoji> One\n<tg-emoji emoji-id="523442290708985472">▫️</tg-emoji> Two');
  assert.equal(api.renderProductDescription(null), 'Digital License');
  for (const icon of ['🎬','🛡️','👨‍💻','🇧🇩','1️⃣']) assert.equal(api.validProductIcon(icon),true);
  for (const icon of ['hello','🎬🤖','<b>','https://test.test/a.png']) assert.equal(api.validProductIcon(icon),false);
  const originalName=product.name;
  for (const stock of [0,26]) {
    listStock=stock;
    for (const name of [originalName, `🔴 🟢 ${originalName}`, '❤️ Lovable Lite']) {
      product.name=name;
      const expectedName=name==='❤️ Lovable Lite' ? name : originalName;
      for (const [menu, destination] of [['adm_manage_products','adm_prod_details_5'],['adm_price_menu','adm_setprice_5'],['adm_stock_menu','adm_addstock_5']]) {
        await callback(menu);
        const button=messages.at(-1).reply_markup.inline_keyboard[0][0];
        assert.equal(button.text,`${expectedName} - $5 (${stock})`);
        assert.equal(button.style,stock ? 'success' : 'danger');
        assert.equal(button.callback_data,destination);
        assert(!/[🔴🟢]/u.test(button.text));
      }
    }
  }
  product.name=originalName;
  console.log('PASS: all three admin menus send red/green buttons without status dots, including dots saved in product names');
  await callback('adm_icon_5');
  assert(messages.at(-1).reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='adm_iconcustom_5'));
  await callback('adm_iconpick_5_🎬');
  assert.equal(product.custom_icon,'🎬');
  assert.equal(api.productDisplayName(product),'🎬 Provider VPN');
  product.name = '🔥 Updated Provider VPN';
  assert.equal(api.productDisplayName(product),'🎬 Updated Provider VPN');
  await callback('adm_iconcustom_5');
  assert.equal(state.state,'awaiting_product_icon');
  await api.handleProductIconText(env,1,'not an emoji',state);
  assert.equal(product.custom_icon,'🎬'); assert(state);
  await api.handleProductIconText(env,1,'🤖',state);
  assert.equal(product.custom_icon,'🤖');assert.equal(state,null);
  await callback('adm_iconpick_5_NONE');
  assert.equal(api.productDisplayName(product),'Updated Provider VPN');
  await callback('adm_iconpick_5_DEFAULT');
  assert.equal(api.productDisplayName(product),'🔥 Updated Provider VPN');
  const before = writes;
  await callback('adm_iconpick_5_💎',99);
  assert.equal(await api.saveProductIcon(env,99,5,'💎'),false);
  assert.equal(writes,before);
  await callback('adm_iconcustom_5');
  await api.handleProductIconText(env,1,'/cancel',state);
  assert.equal(state,null);
  assert.equal(writes,before);
  console.log('PASS: icon picker, custom input, validation, cancellation, remove/reset, provider name updates and admin authorization');
})().catch(error=>{console.error(error);process.exitCode=1;});
