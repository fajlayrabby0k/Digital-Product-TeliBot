// ====================================================================
// VEXORIX Store Clone - Professional Digital Product Telegram Bot
// Standard English | Exact 1:1 VEXORIX Store UI & Menu Layout
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

        // Register Exact Telegram Menu Commands (as seen in VEXORIX Store)
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
            message: "Setup complete! VEXORIX Store layout and Menu Commands are active."
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
    return new Response("🤖 VEXORIX Style Digital Store Telegram Bot is Active!", { status: 200 });
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

    `CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      is_active INTEGER DEFAULT 1
    );`,

    `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER,
      name TEXT NOT NULL,
      description TEXT,
      price_bdt REAL NOT NULL,
      price_usd REAL NOT NULL,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (category_id) REFERENCES categories(id)
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

    // Demo Categories
    `INSERT OR IGNORE INTO categories (id, name) VALUES 
      (1, '🔥 Software & License Keys'),
      (2, '⚡ Premium Subscriptions & VPN'),
      (3, '💎 Social Media & Gaming Accounts');`,

    // Demo Products
    `INSERT OR IGNORE INTO products (id, category_id, name, description, price_bdt, price_usd) VALUES 
      (1, 1, 'Windows 11 Pro Retail Key', 'Lifetime Retail Online Activation License Key (1 PC)', 500, 4.5),
      (2, 1, 'Internet Download Manager (IDM)', '1-Year Official Registration License Key', 750, 7.0),
      (3, 2, 'Telegram Premium 1 Month', 'Direct Gift link activation (No login required)', 450, 4.0),
      (4, 2, 'NordVPN 1 Year Account', 'Premium Shared Account with warranty', 600, 5.5);`,

    // Demo Inventory Items
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
  // 1. Text Message and Command Handler
  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat.id;
    const text = (msg.text || "").trim();
    const from = msg.from;
    const username = from.username ? `@${from.username}` : (from.first_name || "Customer");
    const firstName = from.first_name || "Customer";

    // Register or load user
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

    // Menu Shortcuts & Commands
    if (text.startsWith("/start") || text === "/home") {
      await sendHomeDashboard(env, chatId, user, firstName);
      return;
    }

    if (text === "/shop") {
      await sendCategories(env, chatId);
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
      if (String(chatId) !== String(env.ADMIN_ID)) {
        await sendTelegram(env, "sendMessage", { chat_id: chatId, text: "⛔ Access Denied: You are not an administrator." });
        return;
      }
      await sendAdminDashboard(env, chatId);
      return;
    }

    // Admin Stock Addition (/addstock <id> <data>)
    if (text.startsWith("/addstock") && String(chatId) === String(env.ADMIN_ID)) {
      const parts = text.split(" ");
      if (parts.length >= 3) {
        const prodId = parts[1];
        const itemData = parts.slice(2).join(" ");
        await env.DB.prepare("INSERT INTO inventory (product_id, item_data) VALUES (?, ?)").bind(prodId, itemData).run();
        await sendTelegram(env, "sendMessage", { chat_id: chatId, text: `✅ Stock item successfully added to Product #${prodId}!` });
      } else {
        await sendTelegram(env, "sendMessage", {
          chat_id: chatId,
          text: "⚠️ Usage: <code>/addstock &lt;product_id&gt; &lt;license_or_data&gt;</code>\nExample: <code>/addstock 1 ABCDE-12345-XYZ</code>",
          parse_mode: "HTML"
        });
      }
      return;
    }

    // Admin Broadcast Announcement (/broadcast <msg>)
    if (text.startsWith("/broadcast") && String(chatId) === String(env.ADMIN_ID)) {
      const bMsg = text.replace("/broadcast", "").trim();
      if (!bMsg) {
        await sendTelegram(env, "sendMessage", { chat_id: chatId, text: "⚠️ Usage: <code>/broadcast Your message here</code>", parse_mode: "HTML" });
        return;
      }
      const { results: allUsers } = await env.DB.prepare("SELECT user_id FROM users").all();
      let sentCount = 0;
      for (const u of allUsers) {
        try {
          await sendTelegram(env, "sendMessage", { chat_id: u.user_id, text: `📢 <b>Announcement:</b>\n\n${bMsg}`, parse_mode: "HTML" });
          sentCount++;
        } catch (e) {}
      }
      await sendTelegram(env, "sendMessage", { chat_id: chatId, text: `✅ Broadcasted to ${sentCount} users successfully!` });
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

  // 2. Inline Keyboard Callbacks
  if (update.callback_query) {
    const cb = update.callback_query;
    const data = cb.data;
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;

    let user = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(chatId).first();
    const firstName = cb.from.first_name || "Customer";
    const username = cb.from.username ? `@${cb.from.username}` : firstName;

    if (data === "home") {
      await sendHomeDashboard(env, chatId, user, firstName, messageId);
      return;
    }

    if (data === "shop") {
      await sendCategories(env, chatId, messageId);
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

    if (data === "admin_panel") {
      if (String(chatId) === String(env.ADMIN_ID)) {
        await sendAdminDashboard(env, chatId, messageId);
      }
      return;
    }

    // Category Selected -> Show Products
    if (data.startsWith("cat_")) {
      const catId = data.split("_")[1];
      const cat = await env.DB.prepare("SELECT * FROM categories WHERE id = ?").bind(catId).first();
      const { results } = await env.DB.prepare("SELECT * FROM products WHERE category_id = ? AND is_active = 1").all();

      const buttons = results.map(p => [{ text: `🔹 ${p.name} — $${p.price_usd} (৳${p.price_bdt})`, callback_data: `prod_${p.id}` }]);
      buttons.push([{ text: "🔙 Back to Categories", callback_data: "shop" }]);

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `📂 <b>Category: ${cat ? cat.name : "Products"}</b>\n\nChoose an item below to view details and purchase:`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons }
      });
      return;
    }

    // Product Details View
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
      buttons.push([{ text: "🔙 Back to Products", callback_data: `cat_${prod.category_id}` }]);

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: details,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons }
      });
      return;
    }

    // Wallet Instant Purchase
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

    // Direct Payment Selection
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

    // Payment Instructions & TrxID Request
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

      let instruction = "";
      if (method === "bKash") instruction = `📱 <b>bKash Number (Send Money):</b>\n<code>${env.BKASH_NUM || "017XXXXXXXX"}</code>\nAmount: <b>৳${amount} BDT</b>`;
      else if (method === "Nagad") instruction = `📱 <b>Nagad Number (Send Money):</b>\n<code>${env.NAGAD_NUM || "017XXXXXXXX"}</code>\nAmount: <b>৳${amount} BDT</b>`;
      else if (method === "Rocket") instruction = `📱 <b>Rocket Number:</b>\n<code>${env.ROCKET_NUM || "017XXXXXXXX"}</code>\nAmount: <b>৳${amount} BDT</b>`;
      else if (method === "BinancePay") instruction = `🟡 <b>Binance Pay ID:</b>\n<code>${env.BINANCE_PAY_ID || "12345678"}</code>\nAmount: <b>$${amount} USDT</b>`;
      else if (method === "BEP20") instruction = `🌐 <b>USDT BEP-20 Address:</b>\n<code>${env.BEP20_ADDRESS || "0x1234..."}</code>\nAmount: <b>$${amount} USDT</b>`;

      const promptMsg = `📌 <b>Order ID: #${orderId}</b>\nProduct: <b>${prod.name}</b>\n\n${instruction}\n\n⚠️ <b>Instructions:</b>\nAfter completing your payment, please <b>Reply</b> to this message with your Transaction ID (TrxID) or Transaction Hash.`;

      await sendTelegram(env, "sendMessage", {
        chat_id: chatId,
        text: promptMsg,
        parse_mode: "HTML"
      });
      return;
    }

    // Admin Approval
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

    // Admin Rejection
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
// Reusable UI Functions (Exact 1:1 VEXORIX Store Layout)
// ====================================================================

// 1. Exact VEXORIX Store Main Dashboard
async function sendHomeDashboard(env, chatId, user, firstName, editMessageId = null) {
  const usdBal = user ? (user.balance_usd || 0).toFixed(2) : "0.00";

  const welcome = `🛒 <b>Welcome to VEXORIX Store!</b>\n\nHey ${firstName}! 👋\n\nWe offer premium digital products at the best prices. Fast, secure, and fully automated delivery.\n\n<blockquote>🛒 <b>Shop</b> — Browse & buy products\n💰 <b>Deposit</b> — Add funds to your wallet\n👤 <b>Profile</b> — Balance, orders & settings\n🕒 <b>Support</b> — Get help</blockquote>\n\n📢 <b>Channel:</b> <a href="https://t.me/">Join Channel</a>\n👥 <b>Group:</b> <a href="https://t.me/">Join Group Chat</a>\n\n💰 <b>Balance:</b> $${usdBal} USDT\n\nChoose an option below to continue!`;

  // Exact VEXORIX Store Inline Button Grid
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

// 2. Categories Selection
async function sendCategories(env, chatId, editMessageId = null) {
  const { results: categories } = await env.DB.prepare("SELECT * FROM categories WHERE is_active = 1").all();
  const buttons = [];

  if (categories && categories.length > 0) {
    for (const c of categories) {
      buttons.push([{ text: c.name, callback_data: `cat_${c.id}` }]);
    }
  }
  buttons.push([{ text: "🔙 Main Menu", callback_data: "home" }]);

  const text = `🛒 <b>Product Categories</b>\n\nPlease select a category below to browse items:`;
  const payload = { chat_id: chatId, text, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };

  if (editMessageId) {
    payload.message_id = editMessageId;
    await sendTelegram(env, "editMessageText", payload);
  } else {
    await sendTelegram(env, "sendMessage", payload);
  }
}

// 3. Profile & Wallet
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

// 4. Deposit Funds
async function sendDeposit(env, chatId, editMessageId = null) {
  const depText = `💰 <b>Deposit / Add Funds</b>\n\nSend funds to any of the following accounts, then share your TrxID with Support:\n\n• <b>bKash:</b> <code>${env.BKASH_NUM || "017XXXXXXXX"}</code>\n• <b>Nagad:</b> <code>${env.NAGAD_NUM || "017XXXXXXXX"}</code>\n• <b>Rocket:</b> <code>${env.ROCKET_NUM || "017XXXXXXXX"}</code>\n• <b>Binance Pay ID:</b> <code>${env.BINANCE_PAY_ID || "12345678"}</code>\n• <b>USDT (BEP-20):</b> <code>${env.BEP20_ADDRESS || "0x..."}</code>\n\nOnce submitted, your wallet balance will be credited promptly.`;
  const buttons = [
    [{ text: "🕒 Contact Support", callback_data: "support" }],
    [{ text: "🔙 Main Menu", callback_data: "home" }]
  ];
  const payload = { chat_id: chatId, text: depText, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

// 5. Order History
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

// 6. Refer & Earn
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

// 7. Support
async function sendSupport(env, chatId, editMessageId = null) {
  const supText = `🕒 <b>Customer Support & Helpdesk</b>\n\nNeed assistance or have questions regarding your order? Feel free to reach out to our team.\n\nAdministrator: ${env.ADMIN_ID ? `Available via chat` : "Support Agent"}`;
  const buttons = [[{ text: "🔙 Main Menu", callback_data: "home" }]];
  const payload = { chat_id: chatId, text: supText, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

// 8. Admin Panel
async function sendAdminDashboard(env, chatId, editMessageId = null) {
  const totalUsers = await env.DB.prepare("SELECT COUNT(*) as count FROM users").first();
  const totalOrders = await env.DB.prepare("SELECT COUNT(*) as count FROM orders").first();
  const completed = await env.DB.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'completed'").first();
  const pending = await env.DB.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'").first();
  const stock = await env.DB.prepare("SELECT COUNT(*) as count FROM inventory WHERE is_sold = 0").first();

  const report = `👑 <b>Store Administration Panel</b>\n\n📊 <b>Store Analytics:</b>\n• Total Users: ${totalUsers ? totalUsers.count : 0}\n• Total Orders: ${totalOrders ? totalOrders.count : 0}\n• Completed Deliveries: ${completed ? completed.count : 0}\n• Pending Verifications: ${pending ? pending.count : 0}\n• In-Stock Items: ${stock ? stock.count : 0}\n\n🛠️ <b>Management Commands:</b>\n• Add Stock: <code>/addstock &lt;id&gt; &lt;item_key&gt;</code>\n• Broadcast Announcement: <code>/broadcast &lt;message&gt;</code>`;

  const buttons = [
    [{ text: "🛒 View Catalog & Stocks", callback_data: "shop" }],
    [{ text: "🔙 Main Menu", callback_data: "home" }]
  ];

  const payload = { chat_id: chatId, text: report, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
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
