// ====================================================================
// Professional Digital Store Telegram Bot (Standard English)
// Features:
// - Direct Category Names on Home Menu (No extra clicks)
// - Telegram Native "Menu" Button with Instant Command Shortcuts
// - 5 Payment Methods (bKash, Nagad, Rocket, Binance Pay, BEP-20 USDT)
// - Refer & Earn System with Unique Invite Links
// - User Profile & In-Bot Wallet Balance
// - Automated Instant Product Delivery upon Admin Approval
// - Interactive Admin Control Panel
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

        // Register Telegram Native Menu Commands
        await sendTelegram(env, "setMyCommands", {
          commands: [
            { command: "start", description: "🏠 Store Home & Categories" },
            { command: "profile", description: "👤 My Profile & Balance" },
            { command: "orders", description: "📦 My Purchase History" },
            { command: "refer", description: "👥 Refer & Earn Bonus" },
            { command: "deposit", description: "💳 Deposit / Add Funds" },
            { command: "support", description: "📞 Customer Support" }
          ]
        });

        return new Response(
          JSON.stringify({
            success: true,
            message: "Setup successful! Direct category menu and Telegram Menu Commands have been registered."
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

    // 3. Fallback Status Page
    return new Response("🤖 Digital Store Telegram Bot Backend is Active and Running!", { status: 200 });
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

    // Demo Categories in Standard English
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
  // 1. Text Message and Direct Commands
  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat.id;
    const text = (msg.text || "").trim();
    const from = msg.from;
    const username = from.username ? `@${from.username}` : (from.first_name || "Customer");

    // Fetch or register user
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
      ).bind(chatId, username, from.first_name || "", referrerId).run();

      user = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(chatId).first();

      if (referrerId > 0) {
        const refBonusRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'referral_bonus_bdt'").first();
        const bonusAmount = refBonusRow ? parseFloat(refBonusRow.value) : 5;

        await env.DB.prepare(
          "UPDATE users SET balance_bdt = balance_bdt + ?, total_referrals = total_referrals + 1 WHERE user_id = ?"
        ).bind(bonusAmount, referrerId).run();

        await sendTelegram(env, "sendMessage", {
          chat_id: referrerId,
          text: `🎉 **Referral Bonus Received!**\nA new member (${username}) joined using your link!\n💰 Added **৳${bonusAmount} BDT** bonus to your wallet.`,
          parse_mode: "Markdown"
        });
      }
    }

    // Direct Commands from Telegram Menu Button
    if (text.startsWith("/start")) {
      await sendHomeDashboard(env, chatId, user, username);
      return;
    }

    if (text === "/profile") {
      await sendProfile(env, chatId, user);
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

    if (text === "/deposit") {
      await sendDeposit(env, chatId);
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

    // Admin Stock Command (/addstock <id> <data>)
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
          text: "⚠️ Usage: `/addstock <product_id> <license_or_data>`\nExample: `/addstock 1 ABCDE-12345-XYZ`",
          parse_mode: "Markdown"
        });
      }
      return;
    }

    // Admin Broadcast Command (/broadcast <msg>)
    if (text.startsWith("/broadcast") && String(chatId) === String(env.ADMIN_ID)) {
      const bMsg = text.replace("/broadcast", "").trim();
      if (!bMsg) {
        await sendTelegram(env, "sendMessage", { chat_id: chatId, text: "⚠️ Usage: `/broadcast Your message here`", parse_mode: "Markdown" });
        return;
      }
      const { results: allUsers } = await env.DB.prepare("SELECT user_id FROM users").all();
      let sentCount = 0;
      for (const u of allUsers) {
        try {
          await sendTelegram(env, "sendMessage", { chat_id: u.user_id, text: `📢 **Announcement:**\n\n${bMsg}`, parse_mode: "Markdown" });
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
          text: `✅ **Payment Details Submitted!**\n\nOrder ID: #${orderId}\nTrxID/Hash: \`${trxId}\`\n\nOur team is verifying your payment. Your product will be delivered automatically upon confirmation. Please wait a moment.`,
          parse_mode: "Markdown"
        });

        const order = await env.DB.prepare(
          "SELECT o.*, p.name as product_name FROM orders o JOIN products p ON o.product_id = p.id WHERE o.id = ?"
        ).bind(orderId).first();

        if (order) {
          const adminNotice = `🚨 **New Payment Verification Request!**\n\nOrder ID: #${order.id}\nProduct: **${order.product_name}**\nMethod: **${order.payment_method}**\nAmount: **${order.amount} ${order.currency}**\nTrxID / Hash: \`${trxId}\`\nCustomer: ${order.username} (ID: \`${order.user_id}\`)`;
          
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
            parse_mode: "Markdown",
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
    const username = cb.from.username ? `@${cb.from.username}` : (cb.from.first_name || "Customer");

    if (data === "home") {
      await sendHomeDashboard(env, chatId, user, username, messageId);
      return;
    }

    if (data === "profile") {
      await sendProfile(env, chatId, user, messageId);
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

    if (data === "deposit") {
      await sendDeposit(env, chatId, messageId);
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

    // Direct Category Clicked -> Show Products
    if (data.startsWith("cat_")) {
      const catId = data.split("_")[1];
      const cat = await env.DB.prepare("SELECT * FROM categories WHERE id = ?").bind(catId).first();
      const { results } = await env.DB.prepare("SELECT * FROM products WHERE category_id = ? AND is_active = 1").all();

      const buttons = results.map(p => [{ text: `🔹 ${p.name} - ৳${p.price_bdt}`, callback_data: `prod_${p.id}` }]);
      buttons.push([{ text: "🔙 Main Menu", callback_data: "home" }]);

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `📂 **Category: ${cat ? cat.name : "Products"}**\n\nSelect an item below to view details and purchase:`,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: buttons }
      });
      return;
    }

    // Product Details
    if (data.startsWith("prod_")) {
      const prodId = data.split("_")[1];
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      const stock = await env.DB.prepare("SELECT COUNT(*) as count FROM inventory WHERE product_id = ? AND is_sold = 0").bind(prodId).first();

      const stockCount = stock ? stock.count : 0;
      const details = `📦 **${prod.name}**\n\n📝 **Description:**\n${prod.description}\n\n💵 **Price:** ৳${prod.price_bdt} BDT / $${prod.price_usd} USD\n📊 **Availability:** ${stockCount > 0 ? `✅ In Stock (${stockCount} available)` : '❌ Out of Stock'}`;
      
      const buttons = [];
      if (stockCount > 0) {
        buttons.push([{ text: "🛒 Buy Now (Direct Payment)", callback_data: `buy_${prod.id}` }]);
        buttons.push([{ text: "💳 Pay with Wallet Balance", callback_data: `pay_wallet_${prod.id}` }]);
      } else {
        buttons.push([{ text: "❌ Out of Stock", callback_data: "none" }]);
      }
      buttons.push([{ text: "🔙 Back", callback_data: `cat_${prod.category_id}` }]);

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: details,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: buttons }
      });
      return;
    }

    // Wallet Payment
    if (data.startsWith("pay_wallet_")) {
      const prodId = data.replace("pay_wallet_", "");
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();

      if (!user || user.balance_bdt < prod.price_bdt) {
        const notEnough = `❌ **Insufficient Wallet Balance!**\n\nProduct Price: ৳${prod.price_bdt} BDT\nYour Balance: ৳${user ? user.balance_bdt.toFixed(2) : "0.00"} BDT\n\nPlease add funds via Deposit or proceed with Direct Checkout.`;
        const buttons = [
          [{ text: "➕ Deposit / Add Funds", callback_data: "deposit" }],
          [{ text: "🛒 Direct Checkout", callback_data: `buy_${prod.id}` }],
          [{ text: "🔙 Back", callback_data: `prod_${prod.id}` }]
        ];
        await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: notEnough, parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } });
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

      const successMsg = `🎉 **Order Successful!**\n\nProduct: **${prod.name}**\nDeducted: ৳${prod.price_bdt} BDT\n\n🔑 **Your License Key / Account Credentials:**\n\`${item.item_data}\`\n\nThank you for choosing our store! ❤️`;
      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: successMsg,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "🏠 Main Menu", callback_data: "home" }]] }
      });
      return;
    }

    // Direct Payment Selection
    if (data.startsWith("buy_")) {
      const prodId = data.split("_")[1];
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();

      const choosePay = `💳 **Select Your Preferred Payment Method:**\n\nProduct: **${prod.name}**\nTotal Amount: **৳${prod.price_bdt} BDT** or **$${prod.price_usd} USD**\n\nTap on a payment method below to proceed:`;
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
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: buttons }
      });
      return;
    }

    // Payment Prompt
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
      if (method === "bKash") instruction = `📱 **bKash Number (Send Money):**\n\`${env.BKASH_NUM || "017XXXXXXXX"}\`\nAmount: **৳${amount} BDT**`;
      else if (method === "Nagad") instruction = `📱 **Nagad Number (Send Money):**\n\`${env.NAGAD_NUM || "017XXXXXXXX"}\`\nAmount: **৳${amount} BDT**`;
      else if (method === "Rocket") instruction = `📱 **Rocket Number:**\n\`${env.ROCKET_NUM || "017XXXXXXXX"}\`\nAmount: **৳${amount} BDT**`;
      else if (method === "BinancePay") instruction = `🟡 **Binance Pay ID:**\n\`${env.BINANCE_PAY_ID || "12345678"}\`\nAmount: **$${amount} USDT**`;
      else if (method === "BEP20") instruction = `🌐 **USDT BEP-20 Wallet Address:**\n\`${env.BEP20_ADDRESS || "0x1234..."}\`\nAmount: **$${amount} USDT**`;

      const promptMsg = `📌 **Order ID: #${orderId}**\nProduct: **${prod.name}**\n\n${instruction}\n\n⚠️ **Instructions:**\nAfter completing your payment, please **Reply** to this message with your Transaction ID (TrxID) or Transaction Hash.`;

      await sendTelegram(env, "sendMessage", {
        chat_id: chatId,
        text: promptMsg,
        parse_mode: "Markdown"
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
            text: `🎉 **Order Approved & Delivered!**\n\nOrder ID: #${orderId}\n\n🔑 **Your Digital Product / License Key:**\n\`${item.item_data}\`\n\nThank you for choosing our store! ❤️`,
            parse_mode: "Markdown"
          });

          await sendTelegram(env, "editMessageText", {
            chat_id: chatId,
            message_id: messageId,
            text: `✅ **Order #${orderId} approved and product delivered successfully!**`,
            parse_mode: "Markdown"
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
          text: `❌ **Payment Verification Failed**\n\nYour Order #${orderId} has been cancelled because the transaction details could not be verified.`
        });
      }

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `❌ **Order #${orderId} was rejected.**`
      });
      return;
    }
  }
}

// ====================================================================
// Reusable UI Functions (Standard English with Direct Categories)
// ====================================================================

// 1. Home Dashboard (DIRECT CATEGORY BUTTONS AT THE TOP)
async function sendHomeDashboard(env, chatId, user, username, editMessageId = null) {
  const bdtBal = user ? (user.balance_bdt || 0).toFixed(2) : "0.00";
  const usdBal = user ? (user.balance_usd || 0).toFixed(2) : "0.00";
  const refs = user ? (user.total_referrals || 0) : 0;

  const welcome = `👋 Welcome **${username}** to our Official Digital Store!\n\n🆔 User ID: \`${chatId}\`\n💰 Wallet Balance: **৳${bdtBal} BDT** | **$${usdBal} USD**\n👥 Referrals: **${refs} members**\n\nSelect a product category below to browse items 👇`;

  // Fetch all active categories from Database
  const { results: categories } = await env.DB.prepare("SELECT * FROM categories WHERE is_active = 1").all();
  const keyboard = [];

  // DIRECT CATEGORY BUTTONS (One click to open products!)
  if (categories && categories.length > 0) {
    for (const c of categories) {
      keyboard.push([{ text: c.name, callback_data: `cat_${c.id}` }]);
    }
  }

  // Navigation Options
  keyboard.push([
    { text: "💳 Deposit Funds", callback_data: "deposit" },
    { text: "👤 Profile & Wallet", callback_data: "profile" }
  ]);
  keyboard.push([
    { text: "👥 Refer & Earn", callback_data: "refer" },
    { text: "📦 My Orders", callback_data: "my_orders" }
  ]);
  keyboard.push([
    { text: "📞 Customer Support", callback_data: "support" }
  ]);

  if (String(chatId) === String(env.ADMIN_ID)) {
    keyboard.push([{ text: "👑 Admin Dashboard", callback_data: "admin_panel" }]);
  }

  const payload = {
    chat_id: chatId,
    text: welcome,
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: keyboard }
  };

  if (editMessageId) {
    payload.message_id = editMessageId;
    await sendTelegram(env, "editMessageText", payload);
  } else {
    await sendTelegram(env, "sendMessage", payload);
  }
}

// 2. Profile View
async function sendProfile(env, chatId, user, editMessageId = null) {
  const profileText = `👤 **User Profile & Wallet**\n\n🆔 User ID: \`${chatId}\`\n👤 Name: ${user ? user.first_name : "Customer"}\n\n💰 **Current Balance:**\n• BDT: **৳${user ? user.balance_bdt.toFixed(2) : "0.00"}**\n• USD: **$${user ? user.balance_usd.toFixed(2) : "0.00"}**\n\n👥 Total Referrals: **${user ? user.total_referrals : 0} members**`;
  const buttons = [
    [{ text: "➕ Deposit Funds", callback_data: "deposit" }],
    [{ text: "📦 Order History", callback_data: "my_orders" }],
    [{ text: "🔙 Main Menu", callback_data: "home" }]
  ];
  const payload = { chat_id: chatId, text: profileText, parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

// 3. Orders View
async function sendOrders(env, chatId, editMessageId = null) {
  const { results } = await env.DB.prepare(
    "SELECT o.*, p.name as product_name, i.item_data FROM orders o JOIN products p ON o.product_id = p.id LEFT JOIN inventory i ON o.id = i.order_id WHERE o.user_id = ? AND o.status = 'completed' ORDER BY o.id DESC LIMIT 5"
  ).bind(chatId).all();

  let orderText = "📦 **Your Completed Orders:**\n\n";
  if (!results || results.length === 0) {
    orderText += "You have not completed any purchases yet.";
  } else {
    results.forEach(o => {
      orderText += `🔹 **${o.product_name}**\nOrder: #${o.id} | Amount: ${o.amount} ${o.currency}\nItem/Code: \`${o.item_data || "Delivered"}\`\n\n`;
    });
  }

  const buttons = [[{ text: "🔙 Main Menu", callback_data: "home" }]];
  const payload = { chat_id: chatId, text: orderText, parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

// 4. Refer View
async function sendRefer(env, chatId, user, editMessageId = null) {
  const botInfo = await sendTelegram(env, "getMe", {});
  const botData = await botInfo.json();
  const botUsername = botData.result ? botData.result.username : "bot";

  const refLink = `https://t.me/${botUsername}?start=ref_${chatId}`;
  const refBonusRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'referral_bonus_bdt'").first();
  const bonus = refBonusRow ? refBonusRow.value : "5";

  const refText = `👥 **Refer & Earn Program**\n\nInvite friends and earn **৳${bonus} BDT** instant wallet bonus for every new member who joins using your link!\n\n🔗 **Your Unique Referral Link:**\n\`${refLink}\`\n\n📊 **Your Referral Statistics:**\n• Total Referrals: **${user ? user.total_referrals : 0} members**\n• Total Bonus Earned: **৳${(user ? user.total_referrals : 0) * parseFloat(bonus)} BDT**\n\n*(Share this link on social media, channels, and with friends)*`;

  const buttons = [
    [{ text: "📤 Share Invite Link", url: `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent("Check out this amazing Digital Products Store on Telegram!")}` }],
    [{ text: "🔙 Main Menu", callback_data: "home" }]
  ];

  const payload = { chat_id: chatId, text: refText, parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

// 5. Deposit View
async function sendDeposit(env, chatId, editMessageId = null) {
  const depText = `💳 **Deposit Instructions:**\n\nSend funds to any of the following accounts, then share your TrxID with Support:\n\n• **bKash:** \`${env.BKASH_NUM || "017XXXXXXXX"}\`\n• **Nagad:** \`${env.NAGAD_NUM || "017XXXXXXXX"}\`\n• **Rocket:** \`${env.ROCKET_NUM || "017XXXXXXXX"}\`\n• **Binance Pay ID:** \`${env.BINANCE_PAY_ID || "12345678"}\`\n• **BEP-20 (USDT):** \`${env.BEP20_ADDRESS || "0x..."}\`\n\nOnce confirmed, your wallet balance will be credited promptly.`;
  const buttons = [
    [{ text: "📞 Contact Support", callback_data: "support" }],
    [{ text: "🔙 Main Menu", callback_data: "home" }]
  ];
  const payload = { chat_id: chatId, text: depText, parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

// 6. Support View
async function sendSupport(env, chatId, editMessageId = null) {
  const supText = `📞 **Customer Support & Helpdesk**\n\nNeed assistance or have questions regarding your order? Feel free to reach out to our team.\n\nAdministrator: ${env.ADMIN_ID ? `@admin` : "Available via chat"}`;
  const buttons = [[{ text: "🔙 Main Menu", callback_data: "home" }]];
  const payload = { chat_id: chatId, text: supText, reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

// 7. Admin Dashboard
async function sendAdminDashboard(env, chatId, editMessageId = null) {
  const totalUsers = await env.DB.prepare("SELECT COUNT(*) as count FROM users").first();
  const totalOrders = await env.DB.prepare("SELECT COUNT(*) as count FROM orders").first();
  const completed = await env.DB.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'completed'").first();
  const pending = await env.DB.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'").first();
  const stock = await env.DB.prepare("SELECT COUNT(*) as count FROM inventory WHERE is_sold = 0").first();

  const report = `👑 **Store Administration Panel**\n\n📊 **Store Analytics:**\n• Total Users: ${totalUsers ? totalUsers.count : 0}\n• Total Orders: ${totalOrders ? totalOrders.count : 0}\n• Completed Deliveries: ${completed ? completed.count : 0}\n• Pending Verifications: ${pending ? pending.count : 0}\n• In-Stock Items: ${stock ? stock.count : 0}\n\n🛠️ **Management Commands:**\n• Add Stock: \`/addstock <id> <item_key>\`\n• Broadcast Announcement: \`/broadcast <message>\``;

  const buttons = [[{ text: "🔙 Main Menu", callback_data: "home" }]];
  const payload = { chat_id: chatId, text: report, parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } };
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
