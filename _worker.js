// ====================================================================
// VEXORIX Store Clone - Fully Interactive Digital Product Telegram Bot
// - Direct Products on [🛒 Shop] (No Categories)
// - 100% Button-Driven Admin Panel (Zero Commands to Type)
// - Step-by-Step Guided Adding of Products, Stock, Broadcast & Settings
// - 5 Payment Methods (bKash, Nagad, Rocket, Binance Pay, BEP-20 USDT)
// - Standard English Interface
// ====================================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. One-Click Setup & Telegram Commands Registration (/api/setup)
    if (url.pathname === "/api/setup") {
      try {
        if (!env.DB) {
          return new Response(JSON.stringify({ error: "D1 database binding 'DB' not found in Pages Settings." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }
        await setupDatabase(env.DB);

        await sendTelegram(env, "setMyCommands", {
          commands: [
            { command: "start", description: "Open the shop" },
            { command: "home", description: "Main menu" },
            { command: "shop", description: "Browse products" },
            { command: "deposit", description: "Add balance" },
            { command: "profile", description: "My profile" },
            { command: "orders", description: "Order history" },
            { command: "refer", description: "Refer & earn" },
            { command: "support", description: "Get help" }
          ]
        });

        return new Response(
          JSON.stringify({
            success: true,
            message: "Setup complete! Direct products list and button-driven Admin Panel are ready."
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // 2. Telegram Webhook Handler (POST Request)
    if (request.method === "POST") {
      try {
        const update = await request.json();
        await handleUpdate(update, env);
      } catch (err) {
        console.error("Webhook Update Error:", err);
      }
      return new Response("OK", { status: 200 });
    }

    // 3. Fallback Landing Status Page
    return new Response("🤖 VEXORIX Digital Store Telegram Bot is Active!", { status: 200 });
  }
};

// ====================================================================
// Database Schema Initialization
// ====================================================================
async function setupDatabase(db) {
  const schema = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      username TEXT,
      first_name TEXT,
      balance_bdt REAL DEFAULT 0,
      balance_usd REAL DEFAULT 0,
      referred_by INTEGER DEFAULT 0,
      total_referrals INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price_bdt REAL NOT NULL,
      price_usd REAL NOT NULL,
      is_active INTEGER DEFAULT 1
    );`,

    `CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
      item_data TEXT NOT NULL,
      is_sold INTEGER DEFAULT 0,
      order_id INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );`,

    `CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      username TEXT,
      product_id INTEGER NOT NULL,
      payment_method TEXT NOT NULL,
      trx_id TEXT DEFAULT '',
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );`,

    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );`,

    `CREATE TABLE IF NOT EXISTS admin_states (
      user_id INTEGER PRIMARY KEY,
      state TEXT,
      data TEXT
    );`,

    // Demo Products
    `INSERT OR IGNORE INTO products (id, name, description, price_bdt, price_usd) VALUES 
      (1, 'Windows 11 Pro Retail Key', 'Lifetime Retail Online Activation License Key (1 PC)', 500, 4.5),
      (2, 'Internet Download Manager (IDM)', '1-Year Official Registration License Key', 750, 7.0),
      (3, 'Telegram Premium 1 Month', 'Direct Gift link activation (No login required)', 450, 4.0),
      (4, 'NordVPN 1 Year Account', 'Premium Shared Account with warranty', 600, 5.5);`,

    // Demo Stock
    `INSERT OR IGNORE INTO inventory (id, product_id, item_data) VALUES 
      (1, 1, 'W269N-WFGWX-YVC9B-4J6C9-T83GX'),
      (2, 1, 'VK7JG-NPHTM-C97JM-9MPGT-3V66T'),
      (3, 2, 'IDM-KEY-9821-3948-2831-9238'),
      (4, 3, 'https://t.me/giftcode/demo-telegram-premium-link-1234'),
      (5, 4, 'Email: norduser@gmail.com | Password: NordPass#2026');`,

    `INSERT OR IGNORE INTO settings (key, value) VALUES ('referral_bonus_bdt', '5');`
  ];

  for (const q of schema) {
    await db.prepare(q).run();
  }
}

// ====================================================================
// Bot Update Processor
// ====================================================================
async function handleUpdate(update, env) {
  // 1. Text Message Processing
  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat.id;
    const text = (msg.text || "").trim();
    const from = msg.from;
    const username = from.username ? `@${from.username}` : (from.first_name || "Customer");
    const firstName = from.first_name || "Customer";

    // User Registration / Loading
    let user = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(chatId).first();
    if (!user) {
      let referrerId = 0;
      if (text.startsWith("/start ref_")) {
        const refParts = text.split("ref_");
        if (refParts.length > 1) {
          referrerId = parseInt(refParts[1]) || 0;
          if (referrerId === chatId) referrerId = 0;
        }
      }

      await env.DB.prepare(
        "INSERT INTO users (user_id, username, first_name, referred_by) VALUES (?, ?, ?, ?)"
      ).bind(chatId, username, firstName, referrerId).run();

      user = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(chatId).first();

      if (referrerId > 0) {
        const refBonusRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'referral_bonus_bdt'").first();
        const bonusAmount = refBonusRow ? parseFloat(refBonusRow.value) : 5;

        await env.DB.prepare(
          "UPDATE users SET balance_bdt = balance_bdt + ?, total_referrals = total_referrals + 1 WHERE user_id = ?"
        ).bind(bonusAmount, referrerId).run();

        await sendTelegram(env, "sendMessage", {
          chat_id: referrerId,
          text: `🎉 <b>Referral Bonus Received!</b>\nA new member (${username}) joined using your link!\n💰 Added <b>৳${bonusAmount} BDT</b> bonus to your wallet balance.`,
          parse_mode: "HTML"
        });
      }
    }

    // CHECK IF ADMIN IS IN A CONVERSATION STATE (Button-guided workflow)
    if (String(chatId) === String(env.ADMIN_ID)) {
      const adminState = await env.DB.prepare("SELECT * FROM admin_states WHERE user_id = ?").bind(chatId).first();
      if (adminState && adminState.state) {
        const handled = await handleAdminTextState(env, chatId, text, adminState);
        if (handled) return;
      }
    }

    // Menu Commands
    if (text.startsWith("/start") || text === "/home") {
      await sendHomeDashboard(env, chatId, user, firstName);
      return;
    }

    if (text === "/shop") {
      await sendProductsDirectly(env, chatId);
      return;
    }

    if (text === "/profile") {
      await sendProfile(env, chatId, user);
      return;
    }

    if (text === "/deposit") {
      await sendDeposit(env, chatId);
      return;
    }

    if (text === "/orders") {
      await sendOrders(env, chatId);
      return;
    }

    if (text === "/refer") {
      await sendRefer(env, chatId, user);
      return;
    }

    if (text === "/support") {
      await sendSupport(env, chatId);
      return;
    }

    if (text === "/admin") {
      if (String(chatId) === String(env.ADMIN_ID)) {
        await sendAdminDashboard(env, chatId);
      }
      return;
    }

    // Customer TrxID Submission Handler
    if (msg.reply_to_message && msg.reply_to_message.text && msg.reply_to_message.text.includes("Order ID:")) {
      const replyText = msg.reply_to_message.text;
      const match = replyText.match(/Order ID:\s*#(\d+)/);
      if (match) {
        const orderId = match[1];
        const trxId = text;

        await env.DB.prepare("UPDATE orders SET trx_id = ? WHERE id = ?").bind(trxId, orderId).run();

        await sendTelegram(env, "sendMessage", {
          chat_id: chatId,
          text: `✅ <b>Thank You! Payment Information Received.</b>\n\nOrder ID: #${orderId}\nTransaction ID/Hash: <code>${trxId}</code>\n\nOur team is verifying your payment. Your product will be delivered automatically upon confirmation. Please wait a moment.`,
          parse_mode: "HTML"
        });

        const order = await env.DB.prepare(
          "SELECT o.*, p.name as product_name FROM orders o JOIN products p ON o.product_id = p.id WHERE o.id = ?"
        ).bind(orderId).first();

        if (order) {
          const adminNotice = `🚨 <b>New Payment Verification Request!</b>\n\nOrder ID: #${order.id}\nProduct: <b>${order.product_name}</b>\nMethod: <b>${order.payment_method}</b>\nAmount: <b>${order.amount} ${order.currency}</b>\nTrxID / Hash: <code>${trxId}</code>\nCustomer: ${order.username} (ID: <code>${order.user_id}</code>)`;
          
          const adminKeyboard = {
            inline_keyboard: [
              [
                { text: "✅ Approve Order", callback_data: `admin_approve_${orderId}` },
                { text: "❌ Reject Order", callback_data: `admin_reject_${orderId}` }
              ]
            ]
          };

          await sendTelegram(env, "sendMessage", {
            chat_id: env.ADMIN_ID,
            text: adminNotice,
            parse_mode: "HTML",
            reply_markup: adminKeyboard
          });
        }
      }
      return;
    }
  }

  // 2. Inline Keyboard Button Callbacks
  if (update.callback_query) {
    const cb = update.callback_query;
    const data = cb.data;
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;

    let user = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(chatId).first();
    const firstName = cb.from.first_name || "Customer";
    const username = cb.from.username ? `@${cb.from.username}` : firstName;

    if (data === "home") {
      await clearAdminState(env, chatId);
      await sendHomeDashboard(env, chatId, user, firstName, messageId);
      return;
    }

    if (data === "shop") {
      await sendProductsDirectly(env, chatId, messageId);
      return;
    }

    if (data === "profile") {
      await sendProfile(env, chatId, user, messageId);
      return;
    }

    if (data === "deposit") {
      await sendDeposit(env, chatId, messageId);
      return;
    }

    if (data === "my_orders") {
      await sendOrders(env, chatId, messageId);
      return;
    }

    if (data === "refer") {
      await sendRefer(env, chatId, user, messageId);
      return;
    }

    if (data === "support") {
      await sendSupport(env, chatId, messageId);
      return;
    }

    // ----------------------------------------------------
    // ADMIN PANEL BUTTON-DRIVEN ACTIONS
    // ----------------------------------------------------
    if (data === "admin_panel") {
      if (String(chatId) === String(env.ADMIN_ID)) {
        await clearAdminState(env, chatId);
        await sendAdminDashboard(env, chatId, messageId);
      }
      return;
    }

    if (data === "adm_stock_menu") {
      const { results: prods } = await env.DB.prepare("SELECT * FROM products WHERE is_active = 1").all();
      const buttons = prods.map(p => [{ text: `📦 ${p.name}`, callback_data: `adm_addstock_${p.id}` }]);
      buttons.push([{ text: "🔙 Admin Panel", callback_data: "admin_panel" }]);

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `📦 <b>Select a product to add stock:</b>\n\nClick on the product you want to add license keys or accounts to:`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons }
      });
      return;
    }

    if (data.startsWith("adm_addstock_")) {
      const prodId = data.replace("adm_addstock_", "");
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();

      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_stock', ?)").bind(chatId, prodId).run();

      const cancelBtn = [[{ text: "❌ Cancel", callback_data: "admin_panel" }]];
      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `📥 <b>Add Stock for: ${prod ? prod.name : "Product"}</b>\n\nPlease <b>send / paste</b> the license key, account details, or download link below:`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: cancelBtn }
      });
      return;
    }

    if (data === "adm_add_product") {
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_prod_name', '{}')").bind(chatId).run();
      const cancelBtn = [[{ text: "❌ Cancel", callback_data: "admin_panel" }]];
      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `➕ <b>Add New Product — Step 1/3</b>\n\nPlease send the <b>Name</b> of the new product:\n<i>(Example: Canva Pro 1 Year)</i>`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: cancelBtn }
      });
      return;
    }

    if (data === "adm_manage_products") {
      const { results: prods } = await env.DB.prepare("SELECT p.*, (SELECT COUNT(*) FROM inventory i WHERE i.product_id = p.id AND i.is_sold = 0) as stock_count FROM products p WHERE p.is_active = 1").all();
      const buttons = prods.map(p => [
        { text: `${p.name} (${p.stock_count} in stock)`, callback_data: `adm_prod_details_${p.id}` }
      ]);
      buttons.push([{ text: "🔙 Admin Panel", callback_data: "admin_panel" }]);

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `📋 <b>All Store Products:</b>\nClick on any product to view details or remove it:`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons }
      });
      return;
    }

    if (data.startsWith("adm_prod_details_")) {
      const prodId = data.replace("adm_prod_details_", "");
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      const stock = await env.DB.prepare("SELECT COUNT(*) as count FROM inventory WHERE product_id = ? AND is_sold = 0").bind(prodId).first();

      const text = `📦 <b>${prod.name}</b>\n\nPrice: $${prod.price_usd} USD (৳${prod.price_bdt} BDT)\nRemaining Stock: ${stock ? stock.count : 0} items\nDescription: ${prod.description}`;
      const buttons = [
        [{ text: "➕ Add Stock to this Product", callback_data: `adm_addstock_${prod.id}` }],
        [{ text: "🗑️ Delete Product", callback_data: `adm_del_prod_${prod.id}` }],
        [{ text: "🔙 Back", callback_data: "adm_manage_products" }]
      ];
      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
      return;
    }

    if (data.startsWith("adm_del_prod_")) {
      const prodId = data.replace("adm_del_prod_", "");
      await env.DB.prepare("UPDATE products SET is_active = 0 WHERE id = ?").bind(prodId).run();
      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `✅ Product #${prodId} has been removed from store!`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "🔙 Products List", callback_data: "adm_manage_products" }]] }
      });
      return;
    }

    if (data === "adm_broadcast") {
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_broadcast', '')").bind(chatId).run();
      const cancelBtn = [[{ text: "❌ Cancel", callback_data: "admin_panel" }]];
      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `📢 <b>Broadcast Announcement to All Users:</b>\n\nPlease type and send the message you want to deliver to every registered user:`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: cancelBtn }
      });
      return;
    }

    if (data === "adm_payment_settings") {
      const bKash = await getSetting(env, "bkash_num", env.BKASH_NUM || "Not set");
      const nagad = await getSetting(env, "nagad_num", env.NAGAD_NUM || "Not set");
      const rocket = await getSetting(env, "rocket_num", env.ROCKET_NUM || "Not set");
      const binance = await getSetting(env, "binance_id", env.BINANCE_PAY_ID || "Not set");
      const bep20 = await getSetting(env, "bep20_addr", env.BEP20_ADDRESS || "Not set");

      const text = `⚙️ <b>Store Payment Accounts:</b>\n\n• <b>bKash:</b> <code>${bKash}</code>\n• <b>Nagad:</b> <code>${nagad}</code>\n• <b>Rocket:</b> <code>${rocket}</code>\n• <b>Binance Pay:</b> <code>${binance}</code>\n• <b>USDT BEP-20:</b> <code>${bep20}</code>\n\nClick any button below to update account number:`;

      const buttons = [
        [{ text: "📱 Edit bKash", callback_data: "adm_set_bkash" }, { text: "📱 Edit Nagad", callback_data: "adm_set_nagad" }],
        [{ text: "📱 Edit Rocket", callback_data: "adm_set_rocket" }],
        [{ text: "🟡 Edit Binance Pay ID", callback_data: "adm_set_binance" }],
        [{ text: "🌐 Edit USDT BEP-20", callback_data: "adm_set_bep20" }],
        [{ text: "🔙 Admin Panel", callback_data: "admin_panel" }]
      ];

      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
      return;
    }

    if (data.startsWith("adm_set_")) {
      const field = data.replace("adm_set_", "");
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, ?, '')").bind(chatId, `awaiting_setting_${field}`).run();
      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `✏️ <b>Enter new value for ${field}:</b>\n\nPlease send the new account number or wallet address:`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "adm_payment_settings" }]] }
      });
      return;
    }

    // ----------------------------------------------------
    // CUSTOMER SHOPPING & ORDERING
    // ----------------------------------------------------
    if (data.startsWith("prod_")) {
      const prodId = data.split("_")[1];
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      const stock = await env.DB.prepare("SELECT COUNT(*) as count FROM inventory WHERE product_id = ? AND is_sold = 0").bind(prodId).first();

      const stockCount = stock ? stock.count : 0;
      const details = `📦 <b>${prod.name}</b>\n\n📝 <b>Description:</b>\n${prod.description}\n\n💵 <b>Price:</b> $${prod.price_usd} USD / ৳${prod.price_bdt} BDT\n📊 <b>Availability:</b> ${stockCount > 0 ? `✅ In Stock (${stockCount} available)` : '❌ Out of Stock'}`;
      
      const buttons = [];
      if (stockCount > 0) {
        buttons.push([{ text: "🛒 Buy Now (Direct Payment)", callback_data: `buy_${prod.id}` }]);
        buttons.push([{ text: "💳 Pay with Wallet Balance", callback_data: `pay_wallet_${prod.id}` }]);
      } else {
        buttons.push([{ text: "❌ Out of Stock", callback_data: "none" }]);
      }
      buttons.push([{ text: "🔙 Back to Products", callback_data: "shop" }]);

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: details,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons }
      });
      return;
    }

    if (data.startsWith("pay_wallet_")) {
      const prodId = data.replace("pay_wallet_", "");
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();

      if (!user || user.balance_bdt < prod.price_bdt) {
        const notEnough = `❌ <b>Insufficient Wallet Balance!</b>\n\nProduct Price: ৳${prod.price_bdt} BDT ($${prod.price_usd} USD)\nYour Balance: ৳${user ? user.balance_bdt.toFixed(2) : "0.00"} BDT\n\nPlease add funds using the Deposit menu or proceed with direct payment.`;
        const buttons = [
          [{ text: "➕ Deposit Funds", callback_data: "deposit" }],
          [{ text: "🛒 Direct Payment", callback_data: `buy_${prod.id}` }],
          [{ text: "🔙 Back", callback_data: `prod_${prod.id}` }]
        ];
        await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: notEnough, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
        return;
      }

      const item = await env.DB.prepare("SELECT * FROM inventory WHERE product_id = ? AND is_sold = 0 LIMIT 1").bind(prodId).first();
      if (!item) {
        await sendTelegram(env, "sendMessage", { chat_id: chatId, text: "❌ Sorry, this item went out of stock just now!" });
        return;
      }

      await env.DB.prepare("UPDATE users SET balance_bdt = balance_bdt - ? WHERE user_id = ?").bind(prod.price_bdt, chatId).run();
      await env.DB.prepare("UPDATE inventory SET is_sold = 1, order_id = 9999 WHERE id = ?").bind(item.id).run();
      await env.DB.prepare(
        "INSERT INTO orders (user_id, username, product_id, payment_method, trx_id, amount, currency, status) VALUES (?, ?, ?, 'Wallet', 'WALLET-PURCHASE', ?, 'BDT', 'completed')"
      ).bind(chatId, username, prodId, prod.price_bdt).run();

      const successMsg = `🎉 <b>Order Successful!</b>\n\nProduct: <b>${prod.name}</b>\nDeducted: ৳${prod.price_bdt} BDT\n\n🔑 <b>Your Digital Product / License Key:</b>\n<code>${item.item_data}</code>\n\nThank you for choosing our store! ❤️`;
      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: successMsg,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "🏠 Main Menu", callback_data: "home" }]] }
      });
      return;
    }

    if (data.startsWith("buy_")) {
      const prodId = data.split("_")[1];
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();

      const choosePay = `💳 <b>Select Your Preferred Payment Method:</b>\n\nProduct: <b>${prod.name}</b>\nTotal Amount: <b>$${prod.price_usd} USD</b> or <b>৳${prod.price_bdt} BDT</b>\n\nTap on a payment method below to proceed:`;
      const buttons = [
        [{ text: "📱 bKash", callback_data: `pay_${prodId}_bKash` }, { text: "📱 Nagad", callback_data: `pay_${prodId}_Nagad` }],
        [{ text: "📱 Rocket", callback_data: `pay_${prodId}_Rocket` }],
        [{ text: "🟡 Binance Pay", callback_data: `pay_${prodId}_BinancePay` }, { text: "🌐 USDT (BEP-20)", callback_data: `pay_${prodId}_BEP20` }],
        [{ text: "🔙 Back", callback_data: `prod_${prodId}` }]
      ];

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: choosePay,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons }
      });
      return;
    }

    if (data.startsWith("pay_")) {
      const [, prodId, method] = data.split("_");
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      const isCrypto = method === "BinancePay" || method === "BEP20";
      const amount = isCrypto ? prod.price_usd : prod.price_bdt;
      const currency = isCrypto ? "USD" : "BDT";

      const res = await env.DB.prepare(
        "INSERT INTO orders (user_id, username, product_id, payment_method, trx_id, amount, currency, status) VALUES (?, ?, ?, ?, '', ?, ?, 'pending')"
      ).bind(chatId, username, prodId, method, amount, currency).run();

      const orderId = res.meta.last_row_id;

      const bkashNum = await getSetting(env, "bkash_num", env.BKASH_NUM || "017XXXXXXXX");
      const nagadNum = await getSetting(env, "nagad_num", env.NAGAD_NUM || "017XXXXXXXX");
      const rocketNum = await getSetting(env, "rocket_num", env.ROCKET_NUM || "017XXXXXXXX");
      const binanceId = await getSetting(env, "binance_id", env.BINANCE_PAY_ID || "12345678");
      const bep20Addr = await getSetting(env, "bep20_addr", env.BEP20_ADDRESS || "0x1234...");

      let instruction = "";
      if (method === "bKash") instruction = `📱 <b>bKash Number (Send Money):</b>\n<code>${bkashNum}</code>\nAmount: <b>৳${amount} BDT</b>`;
      else if (method === "Nagad") instruction = `📱 <b>Nagad Number (Send Money):</b>\n<code>${nagadNum}</code>\nAmount: <b>৳${amount} BDT</b>`;
      else if (method === "Rocket") instruction = `📱 <b>Rocket Number:</b>\n<code>${rocketNum}</code>\nAmount: <b>৳${amount} BDT</b>`;
      else if (method === "BinancePay") instruction = `🟡 <b>Binance Pay ID:</b>\n<code>${binanceId}</code>\nAmount: <b>$${amount} USDT</b>`;
      else if (method === "BEP20") instruction = `🌐 <b>USDT BEP-20 Address:</b>\n<code>${bep20Addr}</code>\nAmount: <b>$${amount} USDT</b>`;

      const promptMsg = `📌 <b>Order ID: #${orderId}</b>\nProduct: <b>${prod.name}</b>\n\n${instruction}\n\n⚠️ <b>Instructions:</b>\nAfter completing your payment, please <b>Reply</b> to this message with your Transaction ID (TrxID) or Transaction Hash.`;

      await sendTelegram(env, "sendMessage", {
        chat_id: chatId,
        text: promptMsg,
        parse_mode: "HTML"
      });
      return;
    }

    if (data.startsWith("admin_approve_")) {
      const orderId = data.replace("admin_approve_", "");
      const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first();

      if (order && order.status === "pending") {
        const item = await env.DB.prepare("SELECT * FROM inventory WHERE product_id = ? AND is_sold = 0 LIMIT 1").bind(order.product_id).first();

        if (item) {
          await env.DB.prepare("UPDATE inventory SET is_sold = 1, order_id = ? WHERE id = ?").bind(orderId, item.id).run();
          await env.DB.prepare("UPDATE orders SET status = 'completed' WHERE id = ?").bind(orderId).run();

          await sendTelegram(env, "sendMessage", {
            chat_id: order.user_id,
            text: `🎉 <b>Order Approved & Delivered!</b>\n\nOrder ID: #${orderId}\n\n🔑 <b>Your Digital Product / License Key:</b>\n<code>${item.item_data}</code>\n\nThank you for choosing our store! Please reach out to Support if you need any assistance. ❤️`,
            parse_mode: "HTML"
          });

          await sendTelegram(env, "editMessageText", {
            chat_id: chatId,
            message_id: messageId,
            text: `✅ <b>Order #${orderId} approved and product delivered successfully!</b>`,
            parse_mode: "HTML"
          });
        } else {
          await sendTelegram(env, "sendMessage", { chat_id: chatId, text: `⚠️ Unable to approve Order #${orderId}: No available stock found!` });
        }
      }
      return;
    }

    if (data.startsWith("admin_reject_")) {
      const orderId = data.replace("admin_reject_", "");
      await env.DB.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").bind(orderId).run();
      const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first();

      if (order) {
        await sendTelegram(env, "sendMessage", {
          chat_id: order.user_id,
          text: `❌ <b>Payment Verification Failed</b>\n\nYour Order #${orderId} has been cancelled because the transaction details could not be verified.`
        });
      }

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `❌ <b>Order #${orderId} was rejected.</b>`
      });
      return;
    }
  }
}

// ====================================================================
// Admin Interactive State Processor (100% Zero-Command)
// ====================================================================
async function handleAdminTextState(env, chatId, text, adminState) {
  const state = adminState.state;

  // Adding Stock
  if (state === "awaiting_stock") {
    const prodId = adminState.data;
    await env.DB.prepare("INSERT INTO inventory (product_id, item_data) VALUES (?, ?)").bind(prodId, text).run();
    await clearAdminState(env, chatId);

    const prod = await env.DB.prepare("SELECT name FROM products WHERE id = ?").bind(prodId).first();
    const count = await env.DB.prepare("SELECT COUNT(*) as c FROM inventory WHERE product_id = ? AND is_sold = 0").bind(prodId).first();

    const buttons = [
      [{ text: "➕ Add More Stock to this Product", callback_data: `adm_addstock_${prodId}` }],
      [{ text: "👑 Admin Panel", callback_data: "admin_panel" }]
    ];

    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `✅ <b>Stock Added Successfully!</b>\n\nProduct: <b>${prod ? prod.name : "Product"}</b>\nCurrent Stock: <b>${count ? count.c : 1} items</b>`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: buttons }
    });
    return true;
  }

  // Adding Product - Step 1
  if (state === "awaiting_prod_name") {
    const data = { name: text };
    await env.DB.prepare("UPDATE admin_states SET state = 'awaiting_prod_desc', data = ? WHERE user_id = ?").bind(JSON.stringify(data), chatId).run();

    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `📝 <b>Add Product — Step 2/3</b>\n\nProduct Name: <b>${text}</b>\n\nNow please send a short <b>Description</b> for this product:`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_panel" }]] }
    });
    return true;
  }

  // Adding Product - Step 2
  if (state === "awaiting_prod_desc") {
    const data = JSON.parse(adminState.data || "{}");
    data.description = text;
    await env.DB.prepare("UPDATE admin_states SET state = 'awaiting_prod_price', data = ? WHERE user_id = ?").bind(JSON.stringify(data), chatId).run();

    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `💰 <b>Add Product — Step 3/3</b>\n\nPlease enter the price in <b>BDT and USD</b> separated by a comma:\n<i>Example: <code>500, 4.5</code> (500 BDT and 4.5 USD)</i>`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_panel" }]] }
    });
    return true;
  }

  // Adding Product - Step 3
  if (state === "awaiting_prod_price") {
    const data = JSON.parse(adminState.data || "{}");
    let bdt = 500, usd = 4.5;
    if (text.includes(",")) {
      const parts = text.split(",");
      bdt = parseFloat(parts[0].trim()) || 500;
      usd = parseFloat(parts[1].trim()) || 4.5;
    } else {
      bdt = parseFloat(text.trim()) || 500;
      usd = parseFloat((bdt / 115).toFixed(2));
    }

    const res = await env.DB.prepare(
      "INSERT INTO products (name, description, price_bdt, price_usd, is_active) VALUES (?, ?, ?, ?, 1)"
    ).bind(data.name, data.description || "Digital Product", bdt, usd).run();

    const newProdId = res.meta.last_row_id;
    await clearAdminState(env, chatId);

    const buttons = [
      [{ text: "➕ Add Stock to this Product Now", callback_data: `adm_addstock_${newProdId}` }],
      [{ text: "👑 Admin Panel", callback_data: "admin_panel" }]
    ];

    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `🎉 <b>New Product Successfully Created!</b>\n\n• Name: <b>${data.name}</b>\n• Price: <b>$${usd} USD / ৳${bdt} BDT</b>\n• Status: Active in Shop!`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: buttons }
    });
    return true;
  }

  // Broadcasting message
  if (state === "awaiting_broadcast") {
    await clearAdminState(env, chatId);
    const { results: allUsers } = await env.DB.prepare("SELECT user_id FROM users").all();
    let sentCount = 0;
    for (const u of allUsers) {
      try {
        await sendTelegram(env, "sendMessage", {
          chat_id: u.user_id,
          text: `📢 <b>Store Announcement:</b>\n\n${text}`,
          parse_mode: "HTML"
        });
        sentCount++;
      } catch (e) {}
    }

    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `✅ <b>Broadcast Completed!</b>\nMessage delivered to ${sentCount} users successfully.`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "👑 Admin Panel", callback_data: "admin_panel" }]] }
    });
    return true;
  }

  // Updating Payment Settings
  if (state.startsWith("awaiting_setting_")) {
    const field = state.replace("awaiting_setting_", "");
    let key = "bkash_num";
    if (field === "bkash") key = "bkash_num";
    else if (field === "nagad") key = "nagad_num";
    else if (field === "rocket") key = "rocket_num";
    else if (field === "binance") key = "binance_id";
    else if (field === "bep20") key = "bep20_addr";

    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(key, text).run();
    await clearAdminState(env, chatId);

    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `✅ <b>Payment Account Updated!</b>\n\n${field.toUpperCase()}: <code>${text}</code>`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "⚙️ Payment Settings", callback_data: "adm_payment_settings" }], [{ text: "👑 Admin Panel", callback_data: "admin_panel" }]] }
    });
    return true;
  }

  return false;
}

async function clearAdminState(env, userId) {
  await env.DB.prepare("DELETE FROM admin_states WHERE user_id = ?").bind(userId).run();
}

async function getSetting(env, key, defaultVal) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first();
  return (row && row.value) ? row.value : defaultVal;
}

// ====================================================================
// Reusable UI Functions (Direct Products on Shop & Guided Admin)
// ====================================================================

// 1. Main Home Dashboard
async function sendHomeDashboard(env, chatId, user, firstName, editMessageId = null) {
  const usdBal = user ? (user.balance_usd || 0).toFixed(2) : "0.00";

  const welcome = `🛒 <b>Welcome to VEXORIX Store!</b>\n\nHey ${firstName}! 👋\n\nWe offer premium digital products at the best prices. Fast, secure, and fully automated delivery.\n\n<blockquote>🛒 <b>Shop</b> — Browse & buy products\n💰 <b>Deposit</b> — Add funds to your wallet\n👤 <b>Profile</b> — Balance, orders & settings\n🕒 <b>Support</b> — Get help</blockquote>\n\n📢 <b>Channel:</b> <a href="https://t.me/">Join Channel</a>\n👥 <b>Group:</b> <a href="https://t.me/">Join Group Chat</a>\n\n💰 <b>Balance:</b> $${usdBal} USDT\n\nChoose an option below to continue!`;

  const keyboard = [
    [{ text: "🛒 Shop", callback_data: "shop" }],
    [{ text: "👤 Profile", callback_data: "profile" }, { text: "💰 Deposit", callback_data: "deposit" }],
    [{ text: "🕒 Support", callback_data: "support" }, { text: "📦 Orders", callback_data: "my_orders" }],
    [{ text: "👥 Refer & Earn", callback_data: "refer" }]
  ];

  if (String(chatId) === String(env.ADMIN_ID)) {
    keyboard.push([{ text: "👑 Admin Panel", callback_data: "admin_panel" }]);
  }

  const payload = {
    chat_id: chatId,
    text: welcome,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: keyboard }
  };

  if (editMessageId) {
    payload.message_id = editMessageId;
    await sendTelegram(env, "editMessageText", payload);
  } else {
    await sendTelegram(env, "sendMessage", payload);
  }
}

// 2. Direct Products List on [🛒 Shop] (NO CATEGORY STEP!)
async function sendProductsDirectly(env, chatId, editMessageId = null) {
  const { results: prods } = await env.DB.prepare("SELECT * FROM products WHERE is_active = 1").all();
  const buttons = [];

  if (prods && prods.length > 0) {
    for (const p of prods) {
      buttons.push([{ text: `🔹 ${p.name} — $${p.price_usd} (৳${p.price_bdt})`, callback_data: `prod_${p.id}` }]);
    }
  } else {
    buttons.push([{ text: "❌ No products currently in store", callback_data: "none" }]);
  }

  buttons.push([{ text: "🔙 Main Menu", callback_data: "home" }]);

  const text = `🛒 <b>Available Products</b>\n\nSelect any product below to view description and instant buy options:`;
  const payload = { chat_id: chatId, text, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };

  if (editMessageId) {
    payload.message_id = editMessageId;
    await sendTelegram(env, "editMessageText", payload);
  } else {
    await sendTelegram(env, "sendMessage", payload);
  }
}

// 3. Button-Driven Admin Dashboard (100% Zero-Command)
async function sendAdminDashboard(env, chatId, editMessageId = null) {
  const totalUsers = await env.DB.prepare("SELECT COUNT(*) as count FROM users").first();
  const totalOrders = await env.DB.prepare("SELECT COUNT(*) as count FROM orders").first();
  const completed = await env.DB.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'completed'").first();
  const pending = await env.DB.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'").first();
  const stock = await env.DB.prepare("SELECT COUNT(*) as count FROM inventory WHERE is_sold = 0").first();

  const report = `👑 <b>Store Administration Panel</b>\n\n📊 <b>Store Analytics:</b>\n• Total Users: <b>${totalUsers ? totalUsers.count : 0} members</b>\n• Total Orders: <b>${totalOrders ? totalOrders.count : 0}</b>\n• Completed Deliveries: <b>${completed ? completed.count : 0}</b>\n• Pending Verifications: <b>${pending ? pending.count : 0}</b>\n• Total In-Stock Items: <b>${stock ? stock.count : 0} items</b>\n\nSelect an action below to manage your store easily:`;

  const buttons = [
    [{ text: "➕ Add Stock", callback_data: "adm_stock_menu" }, { text: "➕ Add New Product", callback_data: "adm_add_product" }],
    [{ text: "📋 Manage Products & Stock", callback_data: "adm_manage_products" }],
    [{ text: "📢 Send Broadcast Message", callback_data: "adm_broadcast" }],
    [{ text: "⚙️ Update Payment Numbers", callback_data: "adm_payment_settings" }],
    [{ text: "🔙 Back to Store Home", callback_data: "home" }]
  ];

  const payload = { chat_id: chatId, text: report, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) {
    payload.message_id = editMessageId;
    await sendTelegram(env, "editMessageText", payload);
  } else {
    await sendTelegram(env, "sendMessage", payload);
  }
}

// 4. Profile & Wallet
async function sendProfile(env, chatId, user, editMessageId = null) {
  const profileText = `👤 <b>User Profile & Wallet</b>\n\n🆔 <b>User ID:</b> <code>${chatId}</code>\n👤 <b>Name:</b> ${user ? user.first_name : "Customer"}\n\n💰 <b>Wallet Balance:</b>\n• USD: <b>$${user ? user.balance_usd.toFixed(2) : "0.00"} USDT</b>\n• BDT: <b>৳${user ? user.balance_bdt.toFixed(2) : "0.00"} BDT</b>\n\n👥 <b>Total Referrals:</b> ${user ? user.total_referrals : 0} members`;
  const buttons = [
    [{ text: "💰 Deposit Funds", callback_data: "deposit" }],
    [{ text: "📦 Order History", callback_data: "my_orders" }],
    [{ text: "🔙 Main Menu", callback_data: "home" }]
  ];
  const payload = { chat_id: chatId, text: profileText, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

// 5. Deposit Funds
async function sendDeposit(env, chatId, editMessageId = null) {
  const bkashNum = await getSetting(env, "bkash_num", env.BKASH_NUM || "017XXXXXXXX");
  const nagadNum = await getSetting(env, "nagad_num", env.NAGAD_NUM || "017XXXXXXXX");
  const rocketNum = await getSetting(env, "rocket_num", env.ROCKET_NUM || "017XXXXXXXX");
  const binanceId = await getSetting(env, "binance_id", env.BINANCE_PAY_ID || "12345678");
  const bep20Addr = await getSetting(env, "bep20_addr", env.BEP20_ADDRESS || "0x...");

  const depText = `💰 <b>Deposit / Add Funds</b>\n\nSend funds to any of the following accounts, then share your TrxID with Support:\n\n• <b>bKash:</b> <code>${bkashNum}</code>\n• <b>Nagad:</b> <code>${nagadNum}</code>\n• <b>Rocket:</b> <code>${rocketNum}</code>\n• <b>Binance Pay ID:</b> <code>${binanceId}</code>\n• <b>USDT (BEP-20):</b> <code>${bep20Addr}</code>\n\nOnce submitted, your wallet balance will be credited promptly.`;
  const buttons = [
    [{ text: "🕒 Contact Support", callback_data: "support" }],
    [{ text: "🔙 Main Menu", callback_data: "home" }]
  ];
  const payload = { chat_id: chatId, text: depText, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

// 6. Order History
async function sendOrders(env, chatId, editMessageId = null) {
  const { results } = await env.DB.prepare(
    "SELECT o.*, p.name as product_name, i.item_data FROM orders o JOIN products p ON o.product_id = p.id LEFT JOIN inventory i ON o.id = i.order_id WHERE o.user_id = ? AND o.status = 'completed' ORDER BY o.id DESC LIMIT 5"
  ).bind(chatId).all();

  let orderText = `📦 <b>Your Completed Orders:</b>\n\n`;
  if (!results || results.length === 0) {
    orderText += `You have not completed any purchases yet.`;
  } else {
    results.forEach(o => {
      orderText += `🔹 <b>${o.product_name}</b>\nOrder: #${o.id} | Amount: ${o.amount} ${o.currency}\nItem/Code: <code>${o.item_data || "Delivered"}</code>\n\n`;
    });
  }

  const buttons = [[{ text: "🔙 Main Menu", callback_data: "home" }]];
  const payload = { chat_id: chatId, text: orderText, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

// 7. Refer & Earn
async function sendRefer(env, chatId, user, editMessageId = null) {
  const botInfo = await sendTelegram(env, "getMe", {});
  const botData = await botInfo.json();
  const botUsername = botData.result ? botData.result.username : "bot";

  const refLink = `https://t.me/${botUsername}?start=ref_${chatId}`;
  const refBonusRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'referral_bonus_bdt'").first();
  const bonus = refBonusRow ? refBonusRow.value : "5";

  const refText = `👥 <b>Refer & Earn Program</b>\n\nInvite friends and earn <b>৳${bonus} BDT</b> instant wallet bonus for every new member who joins using your link!\n\n🔗 <b>Your Unique Referral Link:</b>\n<code>${refLink}</code>\n\n📊 <b>Your Referral Statistics:</b>\n• Total Referrals: <b>${user ? user.total_referrals : 0} members</b>\n• Total Bonus Earned: <b>৳${(user ? user.total_referrals : 0) * parseFloat(bonus)} BDT</b>`;

  const buttons = [
    [{ text: "📤 Share Invite Link", url: `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent("Check out this amazing Digital Products Store on Telegram!")}` }],
    [{ text: "🔙 Main Menu", callback_data: "home" }]
  ];

  const payload = { chat_id: chatId, text: refText, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

// 8. Support
async function sendSupport(env, chatId, editMessageId = null) {
  const supText = `🕒 <b>Customer Support & Helpdesk</b>\n\nNeed assistance or have questions regarding your order? Feel free to reach out to our team.\n\nAdministrator: Available via chat`;
  const buttons = [[{ text: "🔙 Main Menu", callback_data: "home" }]];
  const payload = { chat_id: chatId, text: supText, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

// Telegram API Helper
async function sendTelegram(env, method, payload) {
  if (!env.BOT_TOKEN) return;
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`;
  return await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}
