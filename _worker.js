// ====================================================================
// VEXORIX / SMART SUBS STORE - Serverless Telegram E-Commerce Bot
// Features:
// - Direct Products on [🛒 Shop] (No Categories)
// - Native Telegram Button Styling:
//     * In-Stock Products: Green (style: "success")
//     * Out-of-Stock Products: Red (style: "danger")
//     * Refresh & Back Navigation Buttons (style: "success")
// - Product Details with [🛍️ Buy Now], [🔄 Refresh] and [◀️ Back]
// - Interactive Order Preview & Quantity Selector (Keypad 1-9 & Custom Quantity)
// - Payment Methods with Dedicated Icons (NO "Bangladesh" text):
//     * 🟡 Binance
//     * 🌐 BEP20
//     * 🌸 Bkash
//     * 🔴 Nagad
//     * 🚀 Rocket
//     * 👛 Wallet
// - Pre-Order System for Out-of-Stock Products
// - External Bot / Provider API Integration:
//     * Sync products from any external Bot / SMM / REST API
//     * Auto-markup % or Individual Custom Selling Price per product
//     * Live API Stock synchronization
//     * Automated API Order Dispatch on customer purchase
//     * Built-in 1-Click Demo API for instant testing
// - 1 USD = X BDT Admin-Configurable Exchange Rate
// - Purchase-Based % Referral Commission System
// - Support Admin Username / ID Setting
// - 100% Button-Driven Admin Panel (Zero Chat Commands Needed)
// - Standard English Interface
// ====================================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. One-Click Setup & Migration Endpoint (/api/setup)
    if (url.pathname === "/api/setup") {
      try {
        if (!env.DB) {
          return new Response(JSON.stringify({ error: "D1 database binding 'DB' not found in Cloudflare Pages Settings." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }
        await setupDatabase(env.DB);

        // Register Telegram Bot Command Menu
        await sendTelegram(env, "setMyCommands", {
          commands: [
            { command: "start", description: "Open the store" },
            { command: "home", description: "Main menu" },
            { command: "shop", description: "Browse all products" },
            { command: "deposit", description: "Add funds to wallet" },
            { command: "profile", description: "My profile & wallet" },
            { command: "orders", description: "My order history" },
            { command: "preorder", description: "My pre-orders" },
            { command: "refer", description: "Refer & earn commission" },
            { command: "support", description: "Customer helpdesk" }
          ]
        });

        return new Response(
          JSON.stringify({
            success: true,
            message: "Setup and schema migration completed successfully! All tables, external API engine, and bot commands are ready."
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

    // 2. Built-in Mock External Provider API for instant testing (/api/mock-provider)
    if (url.pathname === "/api/mock-provider") {
      let action = url.searchParams.get("action") || "services";
      if (request.method === "POST") {
        try {
          const body = await request.clone().json().catch(() => ({}));
          if (body.action) action = body.action;
        } catch (_) {}
      }

      // Order placement action
      if (action === "add") {
        const fakeOrder = Math.floor(100000 + Math.random() * 900000);
        const randCode = Math.random().toString(36).substring(2, 10).toUpperCase();
        return new Response(
          JSON.stringify({
            order: fakeOrder,
            status: "Completed",
            credentials: `https://digital-redeem.net/gift/${randCode}`
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // Services / Products Catalog list
      const mockCatalog = [
        {
          service: "ext_canva_1y",
          name: "Canva Pro 1 Year (Private Team)",
          rate: "3.50",
          stock: 45,
          desc: "Official Canva Pro education/team upgrade invite. Private activation on your personal account. 1 Year replacement warranty."
        },
        {
          service: "ext_chatgpt_plus",
          name: "ChatGPT Plus Shared 1M",
          rate: "4.80",
          stock: 28,
          desc: "Shared ChatGPT Plus account with full GPT-4o, DALL-E 3 and Canvas access. High-speed private credentials."
        },
        {
          service: "ext_netflix_uhd",
          name: "Netflix UHD 4K 1 Profile 1M",
          rate: "2.40",
          stock: 85,
          desc: "Private 1 Profile with personal 4-digit PIN lock. Ultra HD 4K streaming. Direct login email and password."
        },
        {
          service: "ext_spotify_12m",
          name: "Spotify Premium 12M Family Invite",
          rate: "6.50",
          stock: 50,
          desc: "Upgrade your own existing Spotify account to Premium for 12 full months. No ads, high-quality audio & offline downloads."
        },
        {
          service: "ext_youtube_prem",
          name: "YouTube Premium 3M (No Ads)",
          rate: "1.90",
          stock: 35,
          desc: "Private family invite for your own Gmail. Ad-free YouTube videos, background play, and YouTube Music Premium included."
        },
        {
          service: "ext_coursera_plus",
          name: "Coursera Plus Annual Pass",
          rate: "16.00",
          stock: 0,
          desc: "Unlimited access to 7,000+ top courses and certificates from Google, IBM, and Meta. (Currently Sold Out - Pre-Order Available!)"
        }
      ];

      return new Response(JSON.stringify(mockCatalog), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 3. Telegram Webhook Handler (POST)
    if (request.method === "POST") {
      try {
        const update = await request.json();
        await handleUpdate(update, env, url.origin);
      } catch (err) {
        console.error("Webhook Update Error:", err);
      }
      return new Response("OK", { status: 200 });
    }

    // 4. Fallback Landing Status Page
    return new Response("🤖 SMART SUBS STORE Telegram Bot is Active & Running!", { status: 200 });
  }
};

// ====================================================================
// Database Schema Initialization & Safe Migration
// ====================================================================
async function setupDatabase(db) {
  const schema = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      username TEXT,
      first_name TEXT,
      balance_usd REAL DEFAULT 0,
      balance_bdt REAL DEFAULT 0,
      referred_by INTEGER DEFAULT 0,
      total_referrals INTEGER DEFAULT 0,
      total_spent_usd REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price_usd REAL NOT NULL,
      price_bdt REAL NOT NULL,
      is_active INTEGER DEFAULT 1,
      is_external INTEGER DEFAULT 0,
      external_id TEXT DEFAULT '',
      cost_price_usd REAL DEFAULT 0,
      custom_price_usd REAL DEFAULT 0,
      api_stock INTEGER DEFAULT 0
    );`,

    `CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
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
      quantity INTEGER DEFAULT 1,
      payment_method TEXT NOT NULL,
      trx_id TEXT DEFAULT '',
      amount_usd REAL NOT NULL DEFAULT 0,
      amount_bdt REAL NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );`,

    `CREATE TABLE IF NOT EXISTS preorders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      username TEXT,
      product_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );`,

    `CREATE TABLE IF NOT EXISTS deposits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      username TEXT,
      method TEXT NOT NULL,
      amount_usd REAL NOT NULL DEFAULT 0,
      amount_bdt REAL NOT NULL DEFAULT 0,
      trx_id TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

    `CREATE TABLE IF NOT EXISTS user_states (
      user_id INTEGER PRIMARY KEY,
      state TEXT,
      data TEXT
    );`
  ];

  for (const q of schema) {
    await db.prepare(q).run();
  }

  // Safe table migrations for existing deployments
  const alterStatements = [
    "ALTER TABLE users ADD COLUMN balance_usd REAL DEFAULT 0;",
    "ALTER TABLE users ADD COLUMN balance_bdt REAL DEFAULT 0;",
    "ALTER TABLE users ADD COLUMN total_spent_usd REAL DEFAULT 0;",
    "ALTER TABLE products ADD COLUMN is_external INTEGER DEFAULT 0;",
    "ALTER TABLE products ADD COLUMN external_id TEXT DEFAULT '';",
    "ALTER TABLE products ADD COLUMN cost_price_usd REAL DEFAULT 0;",
    "ALTER TABLE products ADD COLUMN custom_price_usd REAL DEFAULT 0;",
    "ALTER TABLE products ADD COLUMN api_stock INTEGER DEFAULT 0;",
    "ALTER TABLE orders ADD COLUMN quantity INTEGER DEFAULT 1;",
    "ALTER TABLE orders ADD COLUMN amount_usd REAL DEFAULT 0;",
    "ALTER TABLE orders ADD COLUMN amount_bdt REAL DEFAULT 0;"
  ];
  for (const alt of alterStatements) {
    try { await db.prepare(alt).run(); } catch (_) {}
  }

  // Default Settings
  const defaultSettings = [
    ['usd_to_bdt_rate', '125'],
    ['referral_commission_percent', '5'],
    ['support_admin', '@fojlaybd'],
    ['bkash_num', '017XXXXXXXX'],
    ['nagad_num', '017XXXXXXXX'],
    ['rocket_num', '017XXXXXXXX'],
    ['binance_id', '6029752069'],
    ['bep20_addr', '0x71C...YourWalletAddress'],
    ['external_api_url', ''],
    ['external_api_key', ''],
    ['external_profit_margin', '20'],
    ['auto_order_enabled', '1']
  ];
  for (const [k, v] of defaultSettings) {
    await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").bind(k, v).run();
  }

  // Demo Catalog matching screenshot
  await db.prepare(`INSERT OR IGNORE INTO products (id, name, description, price_usd, price_bdt, is_active) VALUES 
    (1, 'Lovable Pro 12m NW', 'Full Pro Access for 12 Months\\n- 5 daily credits (up to 150/month)\\n- One-Time 300 Credits\\n- No Warranty After Activation\\n- Custom Domains & Remove Badge', 45.50, 5688, 1),
    (2, 'Lovable Lite 12m (300 Credits)', 'Full Lite Access for 12 Months\\n- 5 daily credits (up to 150/month)\\n- One-Time 300 Credits (Not Monthly)\\n- Activate on Your Own Account\\n- Custom Domains & Remove Badge', 5.00, 625, 1),
    (3, 'NordVPN 3m', 'NordVPN 3 Months Premium Access Account\\n- Fast VPN servers worldwide\\n- Multi-device support', 2.50, 312, 1),
    (4, 'Udemy Personal Plan 1M', 'Udemy Personal Plan 1 Month Subscription\\n- Access to 10,000+ top courses\\n- Private activation', 1.50, 188, 1),
    (5, 'Duolingo Super 12m', 'Duolingo Super 1 Year Subscription\\n- Unlimited Hearts & practice\\n- Ad-free learning', 0.75, 94, 1),
    (6, 'Coursera Premium (NW)', 'Coursera Plus Premium 1 Month Access\\n- 7,000+ certificates included', 2.00, 250, 1);`
  ).run();

  // Demo Stock
  await db.prepare(`INSERT OR IGNORE INTO inventory (id, product_id, item_data) VALUES 
    (1, 2, 'https://lovable.dev/redeem/LOV-300-LITE-KEY-001'),
    (2, 2, 'https://lovable.dev/redeem/LOV-300-LITE-KEY-002'),
    (3, 2, 'https://lovable.dev/redeem/LOV-300-LITE-KEY-003'),
    (4, 3, 'User: norduser_01@gmail.com | Pass: Nord#Pass2026'),
    (5, 4, 'User: udemy_pro@gmail.com | Pass: Study#2026'),
    (6, 5, 'https://invite.duolingo.com/super-gift-code-1234');`
  ).run();
}

// ====================================================================
// Telegram Update Processor
// ====================================================================
async function handleUpdate(update, env, originUrl = "") {
  // 1. Text Messages
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
        const parts = text.split("ref_");
        if (parts.length > 1) {
          referrerId = parseInt(parts[1]) || 0;
          if (referrerId === chatId) referrerId = 0;
        }
      }

      await env.DB.prepare(
        "INSERT INTO users (user_id, username, first_name, referred_by) VALUES (?, ?, ?, ?)"
      ).bind(chatId, username, firstName, referrerId).run();

      user = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(chatId).first();

      // Notify Referrer (Commission will be earned upon purchase!)
      if (referrerId > 0) {
        const commPct = await getSetting(env, "referral_commission_percent", "5");
        await sendTelegram(env, "sendMessage", {
          chat_id: referrerId,
          text: `👥 <b>New Referral Joined!</b>\n\nUser ${username} joined using your invite link.\nYou will automatically earn <b>${commPct}% commission</b> on all their product purchases! 🎉`,
          parse_mode: "HTML"
        });
      }
    }

    // CHECK ADMIN STATE (100% Button-Guided Interaction)
    if (String(chatId) === String(env.ADMIN_ID)) {
      const adminState = await env.DB.prepare("SELECT * FROM admin_states WHERE user_id = ?").bind(chatId).first();
      if (adminState && adminState.state) {
        const handled = await handleAdminTextState(env, chatId, text, adminState);
        if (handled) return;
      }
    }

    // CHECK CUSTOMER STATE (e.g. Custom Quantity Input)
    const userState = await env.DB.prepare("SELECT * FROM user_states WHERE user_id = ?").bind(chatId).first();
    if (userState && userState.state === "awaiting_custom_qty") {
      const prodId = userState.data;
      const parsedQty = parseInt(text.replace(/[^0-9]/g, "")) || 1;
      const finalQty = parsedQty > 0 ? parsedQty : 1;

      await env.DB.prepare("DELETE FROM user_states WHERE user_id = ?").bind(chatId).run();
      await sendOrderPreview(env, chatId, prodId, finalQty);
      return;
    }

    // Navigation Commands
    if (text.startsWith("/start") || text === "/home") {
      await sendHomeDashboard(env, chatId, user, firstName);
      return;
    }

    if (text === "/shop") {
      await sendProductsDirectly(env, chatId);
      return;
    }

    if (text === "/deposit") {
      await sendDeposit(env, chatId);
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

    if (text === "/preorder") {
      await sendUserPreorders(env, chatId);
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

    // Customer Reply with TrxID / Hash
    if (msg.reply_to_message && msg.reply_to_message.text) {
      const replyText = msg.reply_to_message.text;

      // Case A: Reply to Order Checkout
      if (replyText.includes("Order ID:")) {
        const match = replyText.match(/Order ID:\s*#(\d+)/);
        if (match) {
          const orderId = match[1];
          const trxId = text;

          await env.DB.prepare("UPDATE orders SET trx_id = ? WHERE id = ?").bind(trxId, orderId).run();

          await sendTelegram(env, "sendMessage", {
            chat_id: chatId,
            text: `✅ <b>Payment Details Received!</b>\n\nOrder ID: #${orderId}\nTransaction ID/Hash: <code>${trxId}</code>\n\nOur team is verifying your payment. Your product will be delivered automatically upon confirmation.`,
            parse_mode: "HTML"
          });

          const order = await env.DB.prepare(
            "SELECT o.*, p.name as product_name FROM orders o JOIN products p ON o.product_id = p.id WHERE o.id = ?"
          ).bind(orderId).first();

          if (order) {
            const adminKeyboard = {
              inline_keyboard: [
                [
                  { text: "✅ Approve Order", callback_data: `admin_approve_${orderId}`, style: "success" },
                  { text: "❌ Reject Order", callback_data: `admin_reject_${orderId}`, style: "danger" }
                ]
              ]
            };

            await sendTelegram(env, "sendMessage", {
              chat_id: env.ADMIN_ID,
              text: `🚨 <b>New Order Payment Verification!</b>\n\nOrder ID: #${order.id}\nProduct: <b>${order.product_name}</b>\nQuantity: <b>${order.quantity || 1} items</b>\nPayment Method: <b>${order.payment_method}</b>\nAmount: <b>$${order.amount_usd} USD (৳${order.amount_bdt} BDT)</b>\nTrxID / Hash: <code>${trxId}</code>\nCustomer: ${order.username} (ID: <code>${order.user_id}</code>)`,
              parse_mode: "HTML",
              reply_markup: adminKeyboard
            });
          }
          return;
        }
      }

      // Case B: Reply to Deposit Request
      if (replyText.includes("Deposit Instructions") || replyText.includes("Deposit ID:")) {
        const matchDep = replyText.match(/Deposit ID:\s*#(\d+)/);
        const depId = matchDep ? matchDep[1] : 0;
        const trxInfo = text;

        if (depId) {
          await env.DB.prepare("UPDATE deposits SET trx_id = ? WHERE id = ?").bind(trxInfo, depId).run();
        }

        await sendTelegram(env, "sendMessage", {
          chat_id: chatId,
          text: `✅ <b>Deposit Submission Received!</b>\n\nTransaction Details: <code>${trxInfo}</code>\n\nAdmin will verify the transaction and credit your wallet balance shortly.`,
          parse_mode: "HTML"
        });

        const depRow = depId ? await env.DB.prepare("SELECT * FROM deposits WHERE id = ?").bind(depId).first() : null;

        await sendTelegram(env, "sendMessage", {
          chat_id: env.ADMIN_ID,
          text: `💰 <b>New Wallet Deposit Submitted!</b>\n\nDeposit ID: #${depId || "Direct"}\nCustomer: ${username} (ID: <code>${chatId}</code>)\nMethod: <b>${depRow ? depRow.method : "Manual"}</b>\nAmount: <b>$${depRow ? depRow.amount_usd : "0"} USD (৳${depRow ? depRow.amount_bdt : "0"} BDT)</b>\nTrxID/Note: <code>${trxInfo}</code>`,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              depId ? [
                { text: "✅ Approve Deposit", callback_data: `adm_apprdep_${depId}`, style: "success" },
                { text: "❌ Reject Deposit", callback_data: `adm_rejdep_${depId}`, style: "danger" }
              ] : [
                { text: "➕ Manually Credit User", callback_data: `adm_credit_${chatId}`, style: "success" }
              ]
            ]
          }
        });
        return;
      }
    }
  }

  // 2. Inline Callback Queries
  if (update.callback_query) {
    const cb = update.callback_query;
    const data = cb.data;
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;

    let user = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(chatId).first();
    const firstName = cb.from.first_name || "Customer";
    const username = cb.from.username ? `@${cb.from.username}` : firstName;

    // Home
    if (data === "home") {
      await clearAdminState(env, chatId);
      await sendHomeDashboard(env, chatId, user, firstName, messageId);
      return;
    }

    // Direct Products Catalog (Shop)
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

    if (data === "my_preorders") {
      await sendUserPreorders(env, chatId, messageId);
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

    // ----------------------------------------------------------------
    // CUSTOMER PRE-ORDER SYSTEM
    // ----------------------------------------------------------------
    if (data.startsWith("preorder_")) {
      const prodId = data.replace("preorder_", "");
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();

      if (prod) {
        await env.DB.prepare(
          "INSERT INTO preorders (user_id, username, product_id, status) VALUES (?, ?, ?, 'pending')"
        ).bind(chatId, username, prodId).run();

        const successText = `⏳ <b>Pre-Order Confirmed!</b>\n\nProduct: <b>${prod.name}</b>\nPrice: <b>$${Number(prod.price_usd).toFixed(2)} USD</b> (≈ ৳${prod.price_bdt} BDT)\n\nWe have registered your pre-order! As soon as new stock is added, you will receive an instant notification right here. ❤️`;

        await sendTelegram(env, "editMessageText", {
          chat_id: chatId,
          message_id: messageId,
          text: successText,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🛒 Continue Shopping", callback_data: "shop", style: "success" }],
              [{ text: "🏠 Main Menu", callback_data: "home", style: "success" }]
            ]
          }
        });

        // Notify Admin of Pre-Order
        await sendTelegram(env, "sendMessage", {
          chat_id: env.ADMIN_ID,
          text: `🚨 <b>New Pre-Order Placed!</b>\n\nCustomer: ${username} (ID: <code>${chatId}</code>)\nProduct: <b>${prod.name}</b>\nPrice: $${prod.price_usd} USD\n\n⚠️ Please restock this product using the Admin Panel or Provider API!`,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[{ text: `➕ Add Stock for ${prod.name}`, callback_data: `adm_addstock_${prod.id}`, style: "success" }]]
          }
        });
      }
      return;
    }

    // ----------------------------------------------------------------
    // CUSTOMER PRODUCT DETAILS VIEW (Matching Screenshot 4)
    // ----------------------------------------------------------------
    if (data.startsWith("prod_")) {
      const prodId = data.replace("prod_", "");
      await sendProductDetailView(env, chatId, prodId, messageId);
      return;
    }

    // ----------------------------------------------------------------
    // ORDER PREVIEW & QUANTITY SELECTOR (Matching Screenshot 5)
    // ----------------------------------------------------------------
    if (data.startsWith("buynow_")) {
      const prodId = data.replace("buynow_", "");
      await sendOrderPreview(env, chatId, prodId, 1, messageId);
      return;
    }

    // Quantity clicked on Keypad (1 to 9)
    if (data.startsWith("qty_")) {
      const parts = data.split("_");
      const prodId = parts[1];
      const qty = parseInt(parts[2]) || 1;
      await sendOrderPreview(env, chatId, prodId, qty, messageId);
      return;
    }

    // Custom Quantity Button clicked
    if (data.startsWith("custom_qty_")) {
      const prodId = data.replace("custom_qty_", "");
      await env.DB.prepare("INSERT OR REPLACE INTO user_states (user_id, state, data) VALUES (?, 'awaiting_custom_qty', ?)").bind(chatId, prodId).run();

      await sendTelegram(env, "sendMessage", {
        chat_id: chatId,
        text: `📦 <b>Enter Custom Quantity:</b>\n\nPlease send the exact quantity you want to purchase (e.g. <code>10</code> or <code>25</code>):`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: "◀️ Cancel", callback_data: `buynow_${prodId}`, style: "danger" }]]
        }
      });
      return;
    }

    // Direct Payment Method Picker (Matching Screenshot 1 & 5)
    if (data.startsWith("direct_pay_")) {
      const parts = data.split("_");
      const prodId = parts[2];
      const qty = parseInt(parts[3]) || 1;

      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
      const totalUsd = Number((prod.price_usd * qty).toFixed(2));
      const totalBdt = Math.round(totalUsd * rate);

      const choosePay = `💳 <b>Direct Payment Checkout</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Product: <b>${prod.name}</b>\n` +
        `Quantity: <b>${qty} item(s)</b>\n` +
        `Total: <b>$${totalUsd.toFixed(2)} USD</b> (≈ ৳${totalBdt} BDT)\n\n` +
        `📌 <b>Pick a payment method.</b>\n` +
        `✅ <b>Accepted:</b> Binance, BEP20, Rocket, Bkash, Nagad`;

      const buttons = [
        [{ text: "🟡 Binance", callback_data: `pay_${prodId}_${qty}_Binance`, style: "success" }],
        [{ text: "🌐 BEP20", callback_data: `pay_${prodId}_${qty}_BEP20`, style: "success" }, { text: "🚀 Rocket", callback_data: `pay_${prodId}_${qty}_Rocket`, style: "success" }],
        [{ text: "🌸 Bkash", callback_data: `pay_${prodId}_${qty}_Bkash`, style: "success" }, { text: "🔴 Nagad", callback_data: `pay_${prodId}_${qty}_Nagad`, style: "success" }],
        [{ text: `👛 Pay from Balance ($${totalUsd.toFixed(2)})`, callback_data: `pay_balance_${prodId}_${qty}`, style: "success" }],
        [{ text: "◀️ Back to Order Preview", callback_data: `qty_${prodId}_${qty}`, style: "success" }]
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

    // Direct Payment Instructions (Multi-Quantity Supported)
    if (data.startsWith("pay_") && !data.startsWith("pay_balance_") && !data.startsWith("pay_wallet_")) {
      const parts = data.split("_");
      const prodId = parts[1];
      const qty = parseInt(parts[2]) || 1;
      const method = parts[3];

      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
      const totalUsd = Number((prod.price_usd * qty).toFixed(2));
      const totalBdt = Math.round(totalUsd * rate);

      const res = await env.DB.prepare(
        "INSERT INTO orders (user_id, username, product_id, quantity, payment_method, trx_id, amount_usd, amount_bdt, status) VALUES (?, ?, ?, ?, ?, '', ?, ?, 'pending')"
      ).bind(chatId, username, prodId, qty, method, totalUsd, totalBdt).run();

      const orderId = res.meta.last_row_id;

      const bkashNum = await getSetting(env, "bkash_num", "017XXXXXXXX");
      const nagadNum = await getSetting(env, "nagad_num", "017XXXXXXXX");
      const rocketNum = await getSetting(env, "rocket_num", "017XXXXXXXX");
      const binanceId = await getSetting(env, "binance_id", "6029752069");
      const bep20Addr = await getSetting(env, "bep20_addr", "0x71C...YourWalletAddress");

      let payInfo = "";
      if (method === "Bkash") {
        payInfo = `🌸 <b>Bkash Personal (Send Money):</b>\n<code>${bkashNum}</code>\nAmount to send: <b>৳${totalBdt} BDT</b>`;
      } else if (method === "Nagad") {
        payInfo = `🔴 <b>Nagad Personal (Send Money):</b>\n<code>${nagadNum}</code>\nAmount to send: <b>৳${totalBdt} BDT</b>`;
      } else if (method === "Rocket") {
        payInfo = `🚀 <b>Rocket Personal:</b>\n<code>${rocketNum}</code>\nAmount to send: <b>৳${totalBdt} BDT</b>`;
      } else if (method === "Binance") {
        payInfo = `🟡 <b>Binance Pay ID:</b>\n<code>${binanceId}</code>\nAmount to send: <b>$${totalUsd.toFixed(2)} USDT</b>`;
      } else if (method === "BEP20") {
        payInfo = `🌐 <b>BEP20 (USDT) Address:</b>\n<code>${bep20Addr}</code>\nNetwork: <b>BNB Smart Chain (BEP20)</b>\nAmount to send: <b>$${totalUsd.toFixed(2)} USDT</b>`;
      }

      const promptMsg = `📌 <b>Order ID: #${orderId}</b>\n` +
        `Product: <b>${prod.name}</b> (Quantity: <b>${qty}</b>)\n\n` +
        `${payInfo}\n\n` +
        `⚠️ <b>Payment Verification:</b>\n` +
        `After completing the payment, please <b>Reply directly to this message</b> with your <b>Transaction ID (TrxID)</b> or Transaction Hash.`;

      await sendTelegram(env, "sendMessage", {
        chat_id: chatId,
        text: promptMsg,
        parse_mode: "HTML"
      });
      return;
    }

    // Instant Wallet Balance Purchase (With External API Auto-Dispatch)
    if (data.startsWith("pay_balance_")) {
      const parts = data.split("_");
      const prodId = parts[2];
      const qty = parseInt(parts[3]) || 1;

      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      const userBalUsd = user ? (user.balance_usd || 0) : 0;
      const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
      const totalUsd = Number((prod.price_usd * qty).toFixed(2));
      const totalBdt = Math.round(totalUsd * rate);

      if (userBalUsd < totalUsd) {
        const diff = (totalUsd - userBalUsd).toFixed(2);
        const notEnough = `❌ <b>Insufficient Wallet Balance!</b>\n\n` +
          `Order Total: <b>$${totalUsd.toFixed(2)} USD</b> (৳${totalBdt} BDT)\n` +
          `Your Balance: <b>$${userBalUsd.toFixed(2)} USD</b>\n` +
          `Shortage: <b>$${diff} USD</b>\n\n` +
          `Please deposit funds to your wallet or proceed with direct payment.`;

        const buttons = [
          [{ text: `💳 Deposit $${diff} more → Pay from Balance`, callback_data: `dep_needed_${diff}`, style: "success" }],
          [{ text: `⚡ Direct Pay - ${qty} items - $${totalUsd.toFixed(2)}`, callback_data: `direct_pay_${prod.id}_${qty}`, style: "success" }],
          [{ text: "◀️ Back to Preview", callback_data: `qty_${prod.id}_${qty}`, style: "success" }]
        ];

        await sendTelegram(env, "editMessageText", {
          chat_id: chatId,
          message_id: messageId,
          text: notEnough,
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: buttons }
        });
        return;
      }

      // Check Stock & Delivery Type (External Bot API vs Local Inventory)
      if (prod.is_external === 1) {
        // Deduct Wallet Balance
        await env.DB.prepare(
          "UPDATE users SET balance_usd = balance_usd - ?, balance_bdt = balance_bdt - ?, total_spent_usd = total_spent_usd + ? WHERE user_id = ?"
        ).bind(totalUsd, totalBdt, totalUsd, chatId).run();

        // Create Order Record
        const resOrd = await env.DB.prepare(
          "INSERT INTO orders (user_id, username, product_id, quantity, payment_method, trx_id, amount_usd, amount_bdt, status) VALUES (?, ?, ?, ?, 'Wallet Balance', 'API-ORDER-PENDING', ?, ?, 'processing')"
        ).bind(chatId, username, prodId, qty, totalUsd, totalBdt).run();
        const ordId = resOrd.meta.last_row_id;

        // Auto-dispatch to external API
        const apiDelivery = await dispatchExternalOrder(env, prod, qty, ordId);

        if (apiDelivery.success) {
          await env.DB.prepare("UPDATE orders SET status = 'completed', trx_id = ? WHERE id = ?").bind(apiDelivery.externalOrderId || "API-COMPLETED", ordId).run();
          await env.DB.prepare("UPDATE products SET api_stock = MAX(0, api_stock - ?) WHERE id = ?").bind(qty, prodId).run();
          await processReferralCommission(env, chatId, totalUsd, prod.name);

          const successMsg = `🎉 <b>Purchase Successful (Delivered via Bot API)!</b>\n\n` +
            `Product: <b>${prod.name}</b>\n` +
            `Quantity: <b>${qty} item(s)</b>\n` +
            `Deducted: <b>$${totalUsd.toFixed(2)} USD</b>\n\n` +
            `<b>🔑 Your Delivered Digital Credentials:</b>\n\n` +
            `<code>${apiDelivery.credentials || "Order Active with Provider"}</code>\n\n` +
            `Thank you for shopping with us! ❤️`;

          await sendTelegram(env, "editMessageText", {
            chat_id: chatId,
            message_id: messageId,
            text: successMsg,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: [[{ text: "🏠 Main Menu", callback_data: "home", style: "success" }]] }
          });
        } else {
          // If API provider is queued or requires manual review
          await sendTelegram(env, "editMessageText", {
            chat_id: chatId,
            message_id: messageId,
            text: `🎉 <b>Payment Received! Order #${ordId} is Processing.</b>\n\nProduct: <b>${prod.name}</b> (x${qty})\nProvider Status: <i>${apiDelivery.message}</i>\n\nOur automated system is obtaining your credentials from the provider. You will receive an instant notification here once ready.`,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: [[{ text: "🏠 Main Menu", callback_data: "home", style: "success" }]] }
          });

          await sendTelegram(env, "sendMessage", {
            chat_id: env.ADMIN_ID,
            text: `🚨 <b>External API Order Notice!</b>\n\nOrder: #${ordId}\nProduct: <b>${prod.name}</b> (x${qty})\nCustomer: ${username} (ID: <code>${chatId}</code>)\nAPI Dispatch: ${apiDelivery.message}`,
            parse_mode: "HTML"
          });
        }
        return;
      }

      // Local Inventory Purchase
      const { results: items } = await env.DB.prepare(
        "SELECT * FROM inventory WHERE product_id = ? AND is_sold = 0 LIMIT ?"
      ).bind(prodId, qty).all();

      if (!items || items.length < qty) {
        await sendTelegram(env, "sendMessage", {
          chat_id: chatId,
          text: `❌ <b>Insufficient Stock!</b>\n\nSorry, only <b>${items ? items.length : 0} item(s)</b> are currently available. You can purchase the available count or pre-order!`,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              items && items.length > 0 ? [{ text: `🛒 Buy ${items.length} items`, callback_data: `qty_${prod.id}_${items.length}`, style: "success" }] : [],
              [{ text: "⏳ Pre-Order Now", callback_data: `preorder_${prod.id}`, style: "danger" }]
            ]
          }
        });
        return;
      }

      // Deduct Wallet Balance
      await env.DB.prepare(
        "UPDATE users SET balance_usd = balance_usd - ?, balance_bdt = balance_bdt - ?, total_spent_usd = total_spent_usd + ? WHERE user_id = ?"
      ).bind(totalUsd, totalBdt, totalUsd, chatId).run();

      // Mark Inventory Items as Sold
      for (const it of items) {
        await env.DB.prepare("UPDATE inventory SET is_sold = 1, order_id = 9999 WHERE id = ?").bind(it.id).run();
      }

      // Record Completed Order
      await env.DB.prepare(
        "INSERT INTO orders (user_id, username, product_id, quantity, payment_method, trx_id, amount_usd, amount_bdt, status) VALUES (?, ?, ?, ?, 'Wallet Balance', 'WALLET-PURCHASE', ?, ?, 'completed')"
      ).bind(chatId, username, prodId, qty, totalUsd, totalBdt).run();

      // Process Referral Commission
      await processReferralCommission(env, chatId, totalUsd, prod.name);

      const keysList = items.map((it, idx) => `🔑 Item ${idx + 1}:\n<code>${it.item_data}</code>`).join("\n\n");

      const successMsg = `🎉 <b>Purchase Successful!</b>\n\n` +
        `Product: <b>${prod.name}</b>\n` +
        `Quantity: <b>${qty} item(s)</b>\n` +
        `Deducted: <b>$${totalUsd.toFixed(2)} USD</b>\n\n` +
        `<b>Your Digital Product(s) / License Keys:</b>\n\n${keysList}\n\n` +
        `Thank you for shopping with us! ❤️`;

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: successMsg,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "🏠 Main Menu", callback_data: "home", style: "success" }]] }
      });
      return;
    }

    // ----------------------------------------------------------------
    // DEPOSIT METHOD SELECTION (Matching Screenshot 1 - NO Bangladesh Text)
    // ----------------------------------------------------------------
    if (data.startsWith("dep_method_") || data.startsWith("dep_needed_")) {
      let methodKey = data.replace("dep_method_", "");
      let neededAmount = "";

      if (data.startsWith("dep_needed_")) {
        neededAmount = data.replace("dep_needed_", "");
        await sendDeposit(env, chatId, messageId, neededAmount);
        return;
      }

      const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));

      const bkashNum = await getSetting(env, "bkash_num", "017XXXXXXXX");
      const nagadNum = await getSetting(env, "nagad_num", "017XXXXXXXX");
      const rocketNum = await getSetting(env, "rocket_num", "017XXXXXXXX");
      const binanceId = await getSetting(env, "binance_id", "6029752069");
      const bep20Addr = await getSetting(env, "bep20_addr", "0x71C...YourWalletAddress");

      let methodTitle = "", payDetails = "";
      if (methodKey === "bkash") {
        methodTitle = "🌸 Bkash";
        payDetails = `• Bkash Personal Number: <code>${bkashNum}</code> (Send Money)\n• Exchange Rate: <b>1 USD = ${rate} BDT</b>`;
      } else if (methodKey === "nagad") {
        methodTitle = "🔴 Nagad";
        payDetails = `• Nagad Personal Number: <code>${nagadNum}</code> (Send Money)\n• Exchange Rate: <b>1 USD = ${rate} BDT</b>`;
      } else if (methodKey === "rocket") {
        methodTitle = "🚀 Rocket";
        payDetails = `• Rocket Personal Number: <code>${rocketNum}</code>\n• Exchange Rate: <b>1 USD = ${rate} BDT</b>`;
      } else if (methodKey === "binance") {
        methodTitle = "🟡 Binance";
        payDetails = `• Binance Pay ID: <code>${binanceId}</code>\n• Currency: <b>USDT / USDC</b>`;
      } else if (methodKey === "bep20") {
        methodTitle = "🌐 BEP20";
        payDetails = `• BEP20 (USDT) Address: <code>${bep20Addr}</code>\n• Network: <b>BNB Smart Chain (BEP20)</b>`;
      }

      // Record a pending deposit session
      const resDep = await env.DB.prepare(
        "INSERT INTO deposits (user_id, username, method, amount_usd, amount_bdt, status) VALUES (?, ?, ?, 0, 0, 'pending')"
      ).bind(chatId, username, methodTitle).run();
      const depId = resDep.meta.last_row_id;

      const depPrompt = `💳 <b>Deposit Instructions — ${methodTitle}</b>\n` +
        `Deposit ID: <b>#${depId}</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `${payDetails}\n\n` +
        `📌 <b>How to complete deposit:</b>\n` +
        `1. Send your desired deposit amount to the account/wallet above.\n` +
        `2. <b>Reply directly to this message</b> with your <b>Transaction ID (TrxID)</b> and the <b>Amount sent</b>.\n\n` +
        `<i>Example Reply: <code>TRX12345678, 1000 BDT</code></i>`;

      await sendTelegram(env, "sendMessage", {
        chat_id: chatId,
        text: depPrompt,
        parse_mode: "HTML"
      });
      return;
    }

    // ----------------------------------------------------------------
    // ADMIN PANEL (100% Button-Driven)
    // ----------------------------------------------------------------
    if (data === "admin_panel") {
      if (String(chatId) === String(env.ADMIN_ID)) {
        await clearAdminState(env, chatId);
        await sendAdminDashboard(env, chatId, messageId);
      }
      return;
    }

    // Admin Stock Menu (Shows list of products to pick from)
    if (data === "adm_stock_menu") {
      const { results: prods } = await env.DB.prepare(
        `SELECT p.*, 
          CASE WHEN p.is_external = 1 THEN COALESCE(p.api_stock, 0)
          ELSE (SELECT COUNT(*) FROM inventory i WHERE i.product_id = p.id AND i.is_sold = 0)
          END as stock_qty 
         FROM products p WHERE p.is_active = 1`
      ).all();

      const buttons = prods.map(p => [
        { text: `📦 ${p.name} (${p.stock_qty || 0})`, callback_data: `adm_addstock_${p.id}`, style: p.stock_qty > 0 ? "success" : "danger" }
      ]);
      buttons.push([{ text: "🔙 Admin Panel", callback_data: "admin_panel", style: "success" }]);

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `📦 <b>Select Product to Add Stock:</b>\n\nClick on any product to add license keys or accounts:`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons }
      });
      return;
    }

    // Admin Clicked Product to Add Stock
    if (data.startsWith("adm_addstock_")) {
      const prodId = data.replace("adm_addstock_", "");
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();

      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_stock', ?)").bind(chatId, prodId).run();

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `📥 <b>Add Stock for: ${prod ? prod.name : "Product"}</b>\n\nPlease send the license key or account credentials below.\n\n💡 <b>Tip:</b> You can send multiple license keys separated by new lines to add multiple items at once!`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "adm_stock_menu", style: "danger" }]] }
      });
      return;
    }

    // Admin: Change Price Menu (Button-Driven)
    if (data === "adm_price_menu") {
      const { results: prods } = await env.DB.prepare("SELECT * FROM products WHERE is_active = 1").all();
      const buttons = prods.map(p => [
        { text: `💰 ${p.name} — $${p.price_usd.toFixed(2)}${p.is_external ? " [API]" : ""}`, callback_data: `adm_setprice_${p.id}`, style: "success" }
      ]);
      buttons.push([{ text: "🔙 Admin Panel", callback_data: "admin_panel", style: "success" }]);

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `💰 <b>Select Product to Set Custom Selling Price:</b>\n\nClick on any product below to customize its price:`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons }
      });
      return;
    }

    // Admin Clicked Product to Change Price
    if (data.startsWith("adm_setprice_")) {
      const prodId = data.replace("adm_setprice_", "");
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();

      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_new_price', ?)").bind(chatId, prodId).run();

      const costInfo = prod.is_external ? `\n• Provider Cost Price: <b>$${prod.cost_price_usd.toFixed(2)} USD</b>` : "";

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `💰 <b>Set Custom Price for: ${prod ? prod.name : "Product"}</b>\n${costInfo}\n• Current Selling Price: <b>$${prod.price_usd.toFixed(2)} USD</b> (৳${prod.price_bdt} BDT)\n\nPlease enter your new <b>custom price in USD</b> (e.g. <code>6.50</code>):`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "adm_price_menu", style: "danger" }]] }
      });
      return;
    }

    // Admin: Add New Product Flow
    if (data === "adm_add_product") {
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_prod_name', '{}')").bind(chatId).run();

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `➕ <b>Add New Product — Step 1/3</b>\n\nPlease send the <b>Name</b> of the new product:\n<i>(Example: Lovable Pro 12m NW)</i>`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_panel", style: "danger" }]] }
      });
      return;
    }

    // Admin: Manage / Delete Products
    if (data === "adm_manage_products") {
      const { results: prods } = await env.DB.prepare(
        `SELECT p.*, 
          CASE WHEN p.is_external = 1 THEN COALESCE(p.api_stock, 0)
          ELSE (SELECT COUNT(*) FROM inventory i WHERE i.product_id = p.id AND i.is_sold = 0)
          END as stock_qty 
         FROM products p WHERE p.is_active = 1`
      ).all();

      const buttons = prods.map(p => [
        { text: `${p.name} (${p.stock_qty || 0}) ${p.is_external ? "⚡[API]" : ""}`, callback_data: `adm_prod_details_${p.id}`, style: p.stock_qty > 0 ? "success" : "danger" }
      ]);
      buttons.push([{ text: "🔙 Admin Panel", callback_data: "admin_panel", style: "success" }]);

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `📋 <b>All Store Products:</b>\nClick on any product to view details, change price, add stock or delete:`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons }
      });
      return;
    }

    // Admin: Product Details View
    if (data.startsWith("adm_prod_details_")) {
      const prodId = data.replace("adm_prod_details_", "");
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      const stock = await env.DB.prepare("SELECT COUNT(*) as count FROM inventory WHERE product_id = ? AND is_sold = 0").bind(prodId).first();
      const liveStock = prod.is_external ? prod.api_stock : (stock ? stock.count : 0);

      const text = `📦 <b>${prod.name}</b>\n\n` +
        `• Selling Price: <b>$${prod.price_usd.toFixed(2)} USD (৳${prod.price_bdt} BDT)</b>\n` +
        (prod.is_external ? `• Provider Cost Price: <b>$${prod.cost_price_usd.toFixed(2)} USD</b>\n• Origin: <b>External Bot API (ID: ${prod.external_id})</b>\n` : `• Origin: <b>Manual Store Stock</b>\n`) +
        `• Remaining Stock: <b>${liveStock} items</b>\n\n` +
        `📝 <b>Description:</b>\n${prod.description}`;

      const buttons = [
        [{ text: "💰 Set Custom Price", callback_data: `adm_setprice_${prod.id}`, style: "success" }],
        prod.is_external ? [] : [{ text: "➕ Add Stock", callback_data: `adm_addstock_${prod.id}`, style: "success" }],
        [{ text: "🗑️ Delete Product", callback_data: `adm_del_prod_${prod.id}`, style: "danger" }],
        [{ text: "🔙 Back", callback_data: "adm_manage_products", style: "success" }]
      ].filter(r => r.length > 0);

      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
      return;
    }

    // Admin: Delete Product
    if (data.startsWith("adm_del_prod_")) {
      const prodId = data.replace("adm_del_prod_", "");
      await env.DB.prepare("UPDATE products SET is_active = 0 WHERE id = ?").bind(prodId).run();
      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `✅ Product #${prodId} has been removed from store!`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "🔙 Products List", callback_data: "adm_manage_products", style: "success" }]] }
      });
      return;
    }

    // Admin: View Pre-Orders
    if (data === "adm_view_preorders") {
      const { results: preorders } = await env.DB.prepare(
        "SELECT po.*, p.name as product_name FROM preorders po JOIN products p ON po.product_id = p.id WHERE po.status = 'pending' ORDER BY po.id DESC LIMIT 10"
      ).all();

      let poText = `⏳ <b>Pending Pre-Orders:</b>\n\n`;
      if (!preorders || preorders.length === 0) {
        poText += `There are no pending pre-orders.`;
      } else {
        preorders.forEach(po => {
          poText += `🔹 #${po.id} — <b>${po.product_name}</b>\nUser: ${po.username} (ID: <code>${po.user_id}</code>)\nDate: ${po.created_at}\n\n`;
        });
      }

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: poText,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "🔙 Admin Panel", callback_data: "admin_panel", style: "success" }]] }
      });
      return;
    }

    // Admin: 1 USD = X BDT Exchange Rate Setting
    if (data === "adm_set_rate") {
      const currentRate = await getSetting(env, "usd_to_bdt_rate", "125");
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_rate', '')").bind(chatId).run();

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `💱 <b>Set USD to BDT Exchange Rate:</b>\n\nCurrent Rate: <b>1 USD = ${currentRate} BDT</b>\n\nPlease enter the new exchange rate in BDT (e.g. <code>122</code>):`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_panel", style: "danger" }]] }
      });
      return;
    }

    // Admin: Referral Commission % Setting
    if (data === "adm_set_ref_comm") {
      const currentPct = await getSetting(env, "referral_commission_percent", "5");
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_ref_comm', '')").bind(chatId).run();

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `🎁 <b>Set Referral Commission Percentage:</b>\n\nCurrent Commission: <b>${currentPct}%</b> on every purchase made by referred users.\n\nPlease enter the new commission percentage (e.g. <code>10</code>):`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_panel", style: "danger" }]] }
      });
      return;
    }

    // Admin: Support Username / ID Setting
    if (data === "adm_set_support") {
      const currentSup = await getSetting(env, "support_admin", "@fojlaybd");
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_support_contact', '')").bind(chatId).run();

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `📞 <b>Set Customer Support Contact:</b>\n\nCurrent Support Handle: <b>${currentSup}</b>\n\nPlease enter the Admin Telegram Username (e.g. <code>@fojlaybd</code>) or Chat ID:`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_panel", style: "danger" }]] }
      });
      return;
    }

    // ----------------------------------------------------------------
    // ADMIN: EXTERNAL BOT / PROVIDER API MANAGEMENT
    // ----------------------------------------------------------------
    if (data === "adm_api_menu") {
      const apiUrl = await getSetting(env, "external_api_url", "");
      const apiKey = await getSetting(env, "external_api_key", "");
      const margin = await getSetting(env, "external_profit_margin", "20");
      const autoOrder = await getSetting(env, "auto_order_enabled", "1") === "1";

      const apiProds = await env.DB.prepare("SELECT COUNT(*) as c FROM products WHERE is_external = 1 AND is_active = 1").first();
      const count = apiProds ? apiProds.c : 0;

      const apiText = `🔌 <b>External Bot / Provider API Center</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `• <b>Status:</b> ${apiUrl ? "✅ Connected" : "⚠️ Not Configured"}\n` +
        `• <b>API URL:</b> <code>${apiUrl || "Not Set"}</code>\n` +
        `• <b>API Key:</b> <code>${apiKey ? "••••••••" + apiKey.slice(-4) : "Not Set"}</code>\n` +
        `• <b>Default Profit Margin:</b> <b>${margin}%</b>\n` +
        `• <b>Auto-Order on Purchase:</b> <b>${autoOrder ? "✅ Enabled (Instant)" : "⏸️ Disabled"}</b>\n` +
        `• <b>Imported API Products:</b> <b>${count} products active</b>\n\n` +
        `💡 <b>Quick Guide:</b>\n` +
        `1. Set the API URL and API Key from another bot / provider.\n` +
        `2. Tap <b>Sync Products Now</b> to import all products.\n` +
        `3. Tap <b>Set Custom Prices</b> to override any product's selling price!\n` +
        `<i>(Or tap "🧪 Test with Demo API" to test right now with 1-click!)</i>`;

      const buttons = [
        [{ text: "🔄 Sync Products Now", callback_data: "adm_sync_api", style: "success" }],
        [{ text: "🔗 Set API URL", callback_data: "adm_set_api_url", style: "success" }, { text: "🔑 Set API Key", callback_data: "adm_set_api_key", style: "success" }],
        [{ text: `📈 Profit Margin (${margin}%)`, callback_data: "adm_set_api_margin", style: "success" }, { text: `🤖 Auto-Order: ${autoOrder ? "ON" : "OFF"}`, callback_data: "adm_toggle_auto_order", style: "success" }],
        [{ text: "💰 Set Custom Product Prices", callback_data: "adm_price_menu", style: "success" }],
        [{ text: "🧪 Test with Demo API (1-Click)", callback_data: "adm_setup_demo_api", style: "success" }],
        [{ text: "🔙 Admin Panel", callback_data: "admin_panel", style: "success" }]
      ];

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: apiText,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons }
      });
      return;
    }

    // Admin: Toggle Auto Order Dispatch
    if (data === "adm_toggle_auto_order") {
      const current = await getSetting(env, "auto_order_enabled", "1");
      const newVal = current === "1" ? "0" : "1";
      await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('auto_order_enabled', ?)").bind(newVal).run();
      await sendTelegram(env, "answerCallbackQuery", { callback_query_id: cb.id, text: `Auto-Order is now ${newVal === "1" ? "ENABLED" : "DISABLED"}` });
      // Re-render menu
      const refreshBtn = { data: "adm_api_menu", message: { chat: { id: chatId }, message_id: messageId } };
      await handleUpdate({ callback_query: refreshBtn }, env, originUrl);
      return;
    }

    // Admin: Setup Demo Mock API with 1-Click
    if (data === "adm_setup_demo_api") {
      const demoEndpoint = `${originUrl}/api/mock-provider`;
      await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('external_api_url', ?)").bind(demoEndpoint).run();
      await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('external_api_key', 'DEMO_SECRET_KEY_1234')").bind().run();

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `⏳ <b>Demo API Connected! Syncing products from ${demoEndpoint}...</b>`,
        parse_mode: "HTML"
      });

      const syncResult = await syncExternalProducts(env, demoEndpoint, "DEMO_SECRET_KEY_1234");

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `🎉 <b>Demo API Connected & Products Synced!</b>\n\n${syncResult.message}\n\nAll external bot products are now live in your shop with customized prices! You can check <b>[ 🛒 Shop ]</b> or customize individual prices anytime.`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🛒 Open Shop to Test", callback_data: "shop", style: "success" }],
            [{ text: "💰 Set Custom Prices", callback_data: "adm_price_menu", style: "success" }],
            [{ text: "🔌 API Settings", callback_data: "adm_api_menu", style: "success" }]
          ]
        }
      });
      return;
    }

    // Admin: Trigger API Sync
    if (data === "adm_sync_api") {
      const apiUrl = await getSetting(env, "external_api_url", "");
      const apiKey = await getSetting(env, "external_api_key", "");

      if (!apiUrl) {
        await sendTelegram(env, "editMessageText", {
          chat_id: chatId,
          message_id: messageId,
          text: `⚠️ <b>API URL Not Configured!</b>\n\nPlease set the External Bot API URL first using the button below:`,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔗 Set API URL", callback_data: "adm_set_api_url", style: "success" }],
              [{ text: "🧪 Test with Demo API", callback_data: "adm_setup_demo_api", style: "success" }],
              [{ text: "🔙 Back", callback_data: "adm_api_menu", style: "success" }]
            ]
          }
        });
        return;
      }

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `⏳ <b>Connecting to External Bot API & Fetching Products... Please wait...</b>`,
        parse_mode: "HTML"
      });

      const syncResult = await syncExternalProducts(env, apiUrl, apiKey);

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `✅ <b>API Sync Result:</b>\n\n${syncResult.message}\n\nAny custom prices you previously assigned to products have been preserved. You can change individual prices anytime via <b>Set Custom Prices</b>.`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🛒 Open Shop", callback_data: "shop", style: "success" }],
            [{ text: "💰 Customize Prices", callback_data: "adm_price_menu", style: "success" }],
            [{ text: "👑 Admin Panel", callback_data: "admin_panel", style: "success" }]
          ]
        }
      });
      return;
    }

    // Admin: Set API Parameters
    if (data === "adm_set_api_url" || data === "adm_set_api_key" || data === "adm_set_api_margin") {
      let state = "awaiting_api_url";
      let prompt = "Please send the External Bot / Provider API URL:\n<i>(Example: https://provider.com/api/v2)</i>";

      if (data === "adm_set_api_key") {
        state = "awaiting_api_key";
        prompt = "Please send the API Key or Secret Token from that bot/provider:";
      } else if (data === "adm_set_api_margin") {
        state = "awaiting_api_margin";
        prompt = "Please enter your default Profit Margin % on imported products (e.g. <code>25</code> for 25% markup):";
      }

      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, ?, '')").bind(chatId, state).run();

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `🔌 <b>API Configuration:</b>\n\n${prompt}`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "adm_api_menu", style: "danger" }]] }
      });
      return;
    }

    // Admin: Payment Numbers Menu
    if (data === "adm_payment_settings") {
      const bKash = await getSetting(env, "bkash_num", "Not set");
      const nagad = await getSetting(env, "nagad_num", "Not set");
      const rocket = await getSetting(env, "rocket_num", "Not set");
      const binance = await getSetting(env, "binance_id", "Not set");
      const bep20 = await getSetting(env, "bep20_addr", "Not set");

      const text = `⚙️ <b>Store Payment Accounts:</b>\n\n• <b>Bkash:</b> <code>${bKash}</code>\n• <b>Nagad:</b> <code>${nagad}</code>\n• <b>Rocket:</b> <code>${rocket}</code>\n• <b>Binance:</b> <code>${binance}</code>\n• <b>BEP20:</b> <code>${bep20}</code>\n\nClick any button below to update account number:`;

      const buttons = [
        [{ text: "🌸 Edit Bkash", callback_data: "adm_set_bkash", style: "success" }, { text: "🔴 Edit Nagad", callback_data: "adm_set_nagad", style: "success" }],
        [{ text: "🚀 Edit Rocket", callback_data: "adm_set_rocket", style: "success" }],
        [{ text: "🟡 Edit Binance ID", callback_data: "adm_set_binance", style: "success" }],
        [{ text: "🌐 Edit BEP20 Address", callback_data: "adm_set_bep20", style: "success" }],
        [{ text: "🔙 Admin Panel", callback_data: "admin_panel", style: "success" }]
      ];

      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
      return;
    }

    // Admin Payment number edit trigger
    if (data.startsWith("adm_set_") && !data.startsWith("adm_set_rate") && !data.startsWith("adm_set_ref") && !data.startsWith("adm_set_support") && !data.startsWith("adm_set_api")) {
      const field = data.replace("adm_set_", "");
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, ?, '')").bind(chatId, `awaiting_setting_${field}`).run();

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `✏️ <b>Enter new account details for ${field.toUpperCase()}:</b>\n\nPlease send the new account number or wallet address:`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "adm_payment_settings", style: "danger" }]] }
      });
      return;
    }

    // Admin: Broadcast
    if (data === "adm_broadcast") {
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_broadcast', '')").bind(chatId).run();

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `📢 <b>Broadcast Announcement to All Users:</b>\n\nPlease type and send the message you want to deliver to every registered user:`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_panel", style: "danger" }]] }
      });
      return;
    }

    // Admin Approval of Order
    if (data.startsWith("admin_approve_")) {
      const orderId = data.replace("admin_approve_", "");
      const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first();

      if (order && order.status === "pending") {
        const orderQty = order.quantity || 1;
        const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(order.product_id).first();

        // If product is from external API
        if (prod && prod.is_external === 1) {
          const apiDelivery = await dispatchExternalOrder(env, prod, orderQty, orderId);

          await env.DB.prepare("UPDATE orders SET status = 'completed', trx_id = ? WHERE id = ?").bind(apiDelivery.externalOrderId || "API-APPROVED", orderId).run();
          await env.DB.prepare("UPDATE products SET api_stock = MAX(0, api_stock - ?) WHERE id = ?").bind(orderQty, prod.id).run();
          await processReferralCommission(env, order.user_id, order.amount_usd, prod.name);

          await sendTelegram(env, "sendMessage", {
            chat_id: order.user_id,
            text: `🎉 <b>Order Approved & Delivered!</b>\n\nOrder ID: #${orderId}\nProduct: <b>${prod.name}</b> (x${orderQty})\n\n<b>🔑 Your License / Credentials:</b>\n<code>${apiDelivery.credentials || "Delivered via Bot API"}</code>\n\nThank you for choosing our store! ❤️`,
            parse_mode: "HTML"
          });

          await sendTelegram(env, "editMessageText", {
            chat_id: chatId,
            message_id: messageId,
            text: `✅ <b>Order #${orderId} approved and dispatched via External API!</b>`,
            parse_mode: "HTML"
          });
          return;
        }

        // Local Inventory
        const { results: items } = await env.DB.prepare(
          "SELECT * FROM inventory WHERE product_id = ? AND is_sold = 0 LIMIT ?"
        ).bind(order.product_id, orderQty).all();

        if (items && items.length >= orderQty) {
          for (const it of items) {
            await env.DB.prepare("UPDATE inventory SET is_sold = 1, order_id = ? WHERE id = ?").bind(orderId, it.id).run();
          }
          await env.DB.prepare("UPDATE orders SET status = 'completed' WHERE id = ?").bind(orderId).run();
          await processReferralCommission(env, order.user_id, order.amount_usd, prod ? prod.name : "Order");

          const keysList = items.map((it, idx) => `🔑 Item ${idx + 1}:\n<code>${it.item_data}</code>`).join("\n\n");

          await sendTelegram(env, "sendMessage", {
            chat_id: order.user_id,
            text: `🎉 <b>Order Approved & Delivered!</b>\n\nOrder ID: #${orderId}\nQuantity: <b>${orderQty} item(s)</b>\n\n${keysList}\n\nThank you for choosing our store! Please reach out to Support if you need any assistance. ❤️`,
            parse_mode: "HTML"
          });

          await sendTelegram(env, "editMessageText", {
            chat_id: chatId,
            message_id: messageId,
            text: `✅ <b>Order #${orderId} approved and product delivered successfully!</b>`,
            parse_mode: "HTML"
          });
        } else {
          await sendTelegram(env, "sendMessage", {
            chat_id: chatId,
            text: `⚠️ <b>Unable to auto-deliver Order #${orderId}: Only ${items ? items.length : 0} item(s) in stock, but order requires ${orderQty}!</b>\nPlease add stock for this product first.`
          });
        }
      }
      return;
    }

    // Admin Rejection of Order
    if (data.startsWith("admin_reject_")) {
      const orderId = data.replace("admin_reject_", "");
      await env.DB.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").bind(orderId).run();
      const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first();

      if (order) {
        await sendTelegram(env, "sendMessage", {
          chat_id: order.user_id,
          text: `❌ <b>Payment Verification Failed</b>\n\nYour Order #${orderId} was cancelled because transaction details could not be verified.`
        });
      }

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `❌ <b>Order #${orderId} was rejected.</b>`
      });
      return;
    }

    // Admin Approve Deposit
    if (data.startsWith("adm_apprdep_")) {
      const depId = data.replace("adm_apprdep_", "");
      const dep = await env.DB.prepare("SELECT * FROM deposits WHERE id = ?").bind(depId).first();

      if (dep && dep.status === "pending") {
        await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_deposit_amount', ?)").bind(chatId, depId).run();

        await sendTelegram(env, "sendMessage", {
          chat_id: chatId,
          text: `💰 <b>Approve Deposit #${depId}</b>\nCustomer: ${dep.username} (ID: <code>${dep.user_id}</code>)\nMethod: ${dep.method}\nTrxID: <code>${dep.trx_id}</code>\n\nPlease enter the amount in <b>USD</b> to credit to this customer's balance (e.g. <code>10.00</code>):`,
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_panel", style: "danger" }]] }
        });
      }
      return;
    }

    // Admin Reject Deposit
    if (data.startsWith("adm_rejdep_")) {
      const depId = data.replace("adm_rejdep_", "");
      await env.DB.prepare("UPDATE deposits SET status = 'rejected' WHERE id = ?").bind(depId).run();
      const dep = await env.DB.prepare("SELECT * FROM deposits WHERE id = ?").bind(depId).first();

      if (dep) {
        await sendTelegram(env, "sendMessage", {
          chat_id: dep.user_id,
          text: `❌ <b>Deposit Verification Failed</b>\n\nYour deposit #${depId} could not be verified.`
        });
      }

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `❌ Deposit #${depId} was rejected.`
      });
      return;
    }
  }
}

// ====================================================================
// Admin Interactive State Processor (Zero-Command Guided Flow)
// ====================================================================
async function handleAdminTextState(env, chatId, text, adminState) {
  const state = adminState.state;

  // 1. Adding Stock (Supports single or multi-line keys!)
  if (state === "awaiting_stock") {
    const prodId = adminState.data;
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

    for (const line of lines) {
      await env.DB.prepare("INSERT INTO inventory (product_id, item_data) VALUES (?, ?)").bind(prodId, line).run();
    }
    await clearAdminState(env, chatId);

    const prod = await env.DB.prepare("SELECT name FROM products WHERE id = ?").bind(prodId).first();
    const count = await env.DB.prepare("SELECT COUNT(*) as c FROM inventory WHERE product_id = ? AND is_sold = 0").bind(prodId).first();

    // Check if there were any pre-orders for this product and notify them!
    const { results: pendingPreorders } = await env.DB.prepare("SELECT * FROM preorders WHERE product_id = ? AND status = 'pending'").bind(prodId).all();
    if (pendingPreorders && pendingPreorders.length > 0) {
      for (const po of pendingPreorders) {
        await sendTelegram(env, "sendMessage", {
          chat_id: po.user_id,
          text: `🔔 <b>Good News! Your Pre-Ordered Product is Back in Stock!</b>\n\nProduct: <b>${prod ? prod.name : "Product"}</b>\nStock has just been added! Open the store now to complete your order.`,
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [[{ text: "🛒 Buy Now", callback_data: `prod_${prodId}`, style: "success" }]] }
        });
      }
      await env.DB.prepare("UPDATE preorders SET status = 'notified' WHERE product_id = ? AND status = 'pending'").bind(prodId).run();
    }

    const buttons = [
      [{ text: "➕ Add More Stock to this Product", callback_data: `adm_addstock_${prodId}`, style: "success" }],
      [{ text: "👑 Admin Panel", callback_data: "admin_panel", style: "success" }]
    ];

    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `✅ <b>Added ${lines.length} Stock Item(s) Successfully!</b>\n\nProduct: <b>${prod ? prod.name : "Product"}</b>\nCurrent In-Stock: <b>${count ? count.c : lines.length} items</b>${pendingPreorders && pendingPreorders.length > 0 ? `\n📢 Notified ${pendingPreorders.length} pre-order customers!` : ""}`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: buttons }
    });
    return true;
  }

  // 2. Change Product Price / Custom Price for API product
  if (state === "awaiting_new_price") {
    const prodId = adminState.data;
    const newUsd = parseFloat(text.replace("$", "").trim()) || 5.00;
    const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
    const newBdt = Math.round(newUsd * rate);

    // Save both price_usd and custom_price_usd so future syncs preserve it!
    await env.DB.prepare("UPDATE products SET price_usd = ?, price_bdt = ?, custom_price_usd = ? WHERE id = ?").bind(newUsd, newBdt, newUsd, prodId).run();
    await clearAdminState(env, chatId);

    const prod = await env.DB.prepare("SELECT name, is_external, cost_price_usd FROM products WHERE id = ?").bind(prodId).first();

    const profitInfo = (prod && prod.is_external && prod.cost_price_usd > 0)
      ? `\n• Provider Cost: $${prod.cost_price_usd.toFixed(2)}\n• Your Profit Margin: <b>+$${(newUsd - prod.cost_price_usd).toFixed(2)} USD</b> per sale!`
      : "";

    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `✅ <b>Custom Price Saved Successfully!</b>\n\nProduct: <b>${prod ? prod.name : "Product"}</b>\nNew Selling Price: <b>$${newUsd.toFixed(2)} USD</b> (≈ ৳${newBdt} BDT)${profitInfo}\n\n<i>Note: This custom price will remain permanent even when you sync products again.</i>`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "💰 Change Another Price", callback_data: "adm_price_menu", style: "success" }],
          [{ text: "👑 Admin Panel", callback_data: "admin_panel", style: "success" }]
        ]
      }
    });
    return true;
  }

  // 3. Adding Product - Step 1: Name received
  if (state === "awaiting_prod_name") {
    const data = { name: text };
    await env.DB.prepare("UPDATE admin_states SET state = 'awaiting_prod_desc', data = ? WHERE user_id = ?").bind(JSON.stringify(data), chatId).run();

    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `📝 <b>Add Product — Step 2/3</b>\n\nProduct Name: <b>${text}</b>\n\nPlease send a short <b>Description</b> for this product:`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_panel", style: "danger" }]] }
    });
    return true;
  }

  // 3. Adding Product - Step 2: Description received
  if (state === "awaiting_prod_desc") {
    const data = JSON.parse(adminState.data || "{}");
    data.description = text;
    await env.DB.prepare("UPDATE admin_states SET state = 'awaiting_prod_price', data = ? WHERE user_id = ?").bind(JSON.stringify(data), chatId).run();

    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `💰 <b>Add Product — Step 3/3</b>\n\nPlease enter the price in <b>USD</b> (e.g. <code>45.50</code>):`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_panel", style: "danger" }]] }
    });
    return true;
  }

  // 3. Adding Product - Step 3: Price received & Product Created!
  if (state === "awaiting_prod_price") {
    const data = JSON.parse(adminState.data || "{}");
    const usd = parseFloat(text.replace("$", "").trim()) || 5.00;
    const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
    const bdt = Math.round(usd * rate);

    const res = await env.DB.prepare(
      "INSERT INTO products (name, description, price_usd, price_bdt, is_active) VALUES (?, ?, ?, ?, 1)"
    ).bind(data.name, data.description || "Digital Product", usd, bdt).run();

    const newProdId = res.meta.last_row_id;
    await clearAdminState(env, chatId);

    const buttons = [
      [{ text: "➕ Add Stock to this Product Now", callback_data: `adm_addstock_${newProdId}`, style: "success" }],
      [{ text: "👑 Admin Panel", callback_data: "admin_panel", style: "success" }]
    ];

    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `🎉 <b>New Product Successfully Created!</b>\n\n• Name: <b>${data.name}</b>\n• Price: <b>$${usd.toFixed(2)} USD (≈ ৳${bdt} BDT)</b>\n• Status: Active in Shop!`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: buttons }
    });
    return true;
  }

  // 4. Update 1 USD = BDT Exchange Rate
  if (state === "awaiting_rate") {
    const newRate = parseFloat(text.trim()) || 125;
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('usd_to_bdt_rate', ?)").bind(String(newRate)).run();

    // Recalculate all product BDT prices automatically
    await env.DB.prepare("UPDATE products SET price_bdt = ROUND(price_usd * ?)").bind(newRate).run();
    await clearAdminState(env, chatId);

    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `✅ <b>Exchange Rate Updated!</b>\n\nNew Rate: <b>1 USD = ${newRate} BDT</b>\nAll store product BDT prices have been updated automatically.`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "👑 Admin Panel", callback_data: "admin_panel", style: "success" }]] }
    });
    return true;
  }

  // 5. Update Referral Commission %
  if (state === "awaiting_ref_comm") {
    const pct = parseFloat(text.replace("%", "").trim()) || 5;
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('referral_commission_percent', ?)").bind(String(pct)).run();
    await clearAdminState(env, chatId);

    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `✅ <b>Referral Commission Updated!</b>\n\nReferrers will now receive <b>${pct}% commission</b> on every product purchase made by their referred users.`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "👑 Admin Panel", callback_data: "admin_panel", style: "success" }]] }
    });
    return true;
  }

  // 6. Update Support Contact
  if (state === "awaiting_support_contact") {
    const contact = text.trim();
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('support_admin', ?)").bind(contact).run();
    await clearAdminState(env, chatId);

    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `✅ <b>Support Contact Updated!</b>\n\nCustomers will now be directed to: <b>${contact}</b>`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "👑 Admin Panel", callback_data: "admin_panel", style: "success" }]] }
    });
    return true;
  }

  // 7. External API Settings Handlers
  if (state === "awaiting_api_url") {
    const cleanUrl = text.trim();
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('external_api_url', ?)").bind(cleanUrl).run();
    await clearAdminState(env, chatId);
    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `✅ <b>External Bot API URL Saved!</b>\n\n<code>${cleanUrl}</code>\n\nNow set your API Key or tap <b>Sync Products Now</b>:`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔑 Set API Key", callback_data: "adm_set_api_key", style: "success" }],
          [{ text: "🔄 Sync Products Now", callback_data: "adm_sync_api", style: "success" }],
          [{ text: "🔌 API Settings", callback_data: "adm_api_menu", style: "success" }]
        ]
      }
    });
    return true;
  }

  if (state === "awaiting_api_key") {
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('external_api_key', ?)").bind(text.trim()).run();
    await clearAdminState(env, chatId);
    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `✅ <b>External API Key Saved!</b>\n\nYou are ready to sync products from that bot now:`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Sync Products Now", callback_data: "adm_sync_api", style: "success" }],
          [{ text: "🔌 API Settings", callback_data: "adm_api_menu", style: "success" }]
        ]
      }
    });
    return true;
  }

  if (state === "awaiting_api_margin") {
    const margin = parseFloat(text.replace("%", "").trim()) || 20;
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('external_profit_margin', ?)").bind(String(margin)).run();
    await clearAdminState(env, chatId);
    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `✅ <b>Default Profit Margin Saved: ${margin}%!</b>\n\nNewly synced products will be marked up by ${margin}% over the provider's cost price.`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Re-Sync with New Margin", callback_data: "adm_sync_api", style: "success" }],
          [{ text: "🔌 API Settings", callback_data: "adm_api_menu", style: "success" }]
        ]
      }
    });
    return true;
  }

  // 8. Approve Deposit Amount input
  if (state === "awaiting_deposit_amount") {
    const depId = adminState.data;
    const usdAmount = parseFloat(text.replace("$", "").trim()) || 0;
    const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
    const bdtAmount = Math.round(usdAmount * rate);

    await clearAdminState(env, chatId);

    const dep = await env.DB.prepare("SELECT * FROM deposits WHERE id = ?").bind(depId).first();
    if (dep && usdAmount > 0) {
      await env.DB.prepare("UPDATE deposits SET amount_usd = ?, amount_bdt = ?, status = 'completed' WHERE id = ?").bind(usdAmount, bdtAmount, depId).run();
      await env.DB.prepare("UPDATE users SET balance_usd = balance_usd + ?, balance_bdt = balance_bdt + ? WHERE user_id = ?").bind(usdAmount, bdtAmount, dep.user_id).run();

      const user = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(dep.user_id).first();

      await sendTelegram(env, "sendMessage", {
        chat_id: dep.user_id,
        text: `🎉 <b>Deposit Approved!</b>\n\nCredited: <b>+$${usdAmount.toFixed(2)} USD (≈ ৳${bdtAmount} BDT)</b>\nNew Wallet Balance: <b>$${user.balance_usd.toFixed(2)} USD</b>\n\nThank you for choosing our store!`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "🛒 Open Shop", callback_data: "shop", style: "success" }]] }
      });

      await sendTelegram(env, "sendMessage", {
        chat_id: chatId,
        text: `✅ <b>Deposit #${depId} Approved!</b>\nCredited $${usdAmount.toFixed(2)} USD to user <code>${dep.user_id}</code>.`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "👑 Admin Panel", callback_data: "admin_panel", style: "success" }]] }
      });
    }
    return true;
  }

  // 9. Broadcasting Message
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
      } catch (_) {}
    }

    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `✅ <b>Broadcast Completed!</b>\nMessage delivered to ${sentCount} members successfully.`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "👑 Admin Panel", callback_data: "admin_panel", style: "success" }]] }
    });
    return true;
  }

  // 10. Updating Payment Settings
  if (state.startsWith("awaiting_setting_")) {
    const field = state.replace("awaiting_setting_", "");
    let key = "bkash_num";
    if (field === "bkash") key = "bkash_num";
    else if (field === "nagad") key = "nagad_num";
    else if (field === "rocket") key = "rocket_num";
    else if (field === "binance") key = "binance_id";
    else if (field === "bep20") key = "bep20_addr";

    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(key, text.trim()).run();
    await clearAdminState(env, chatId);

    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `✅ <b>Payment Account Updated!</b>\n\n${field.toUpperCase()}: <code>${text.trim()}</code>`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "⚙️ Payment Settings", callback_data: "adm_payment_settings", style: "success" }], [{ text: "👑 Admin Panel", callback_data: "admin_panel", style: "success" }]] }
    });
    return true;
  }

  return false;
}

// ====================================================================
// External Bot / Provider API Sync & Auto-Order Dispatch Engine
// ====================================================================
async function syncExternalProducts(env, apiUrl, apiKey) {
  try {
    let url = apiUrl;
    let options = {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "TelegramBotStore/2.0"
      }
    };

    // If query parameters or standard V2 SMM API format
    try {
      const parsedUrl = new URL(apiUrl);
      if (apiKey && !parsedUrl.searchParams.has("key")) {
        parsedUrl.searchParams.set("key", apiKey);
      }
      if (!parsedUrl.searchParams.has("action")) {
        parsedUrl.searchParams.set("action", "services");
      }
      url = parsedUrl.toString();
    } catch (_) {}

    let response = await fetch(url, options);

    // Fallback: If GET returned 405 or 400, try POST with JSON or form body
    if (!response.ok && apiKey) {
      response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ key: apiKey, action: "services" })
      });
    }

    if (!response.ok) {
      return { success: false, message: `Could not connect to external API. Status: ${response.status} (${response.statusText}). Please check your API URL.` };
    }

    const data = await response.json();
    let items = [];

    if (Array.isArray(data)) {
      items = data;
    } else if (data.services && Array.isArray(data.services)) {
      items = data.services;
    } else if (data.products && Array.isArray(data.products)) {
      items = data.products;
    } else if (data.data && Array.isArray(data.data)) {
      items = data.data;
    } else if (data.items && Array.isArray(data.items)) {
      items = data.items;
    } else {
      return { success: false, message: "Unrecognized API response format. Expected a JSON array of products or services." };
    }

    const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
    const margin = parseFloat(await getSetting(env, "external_profit_margin", "20"));

    let importedCount = 0;
    for (const item of items) {
      const extId = String(item.service || item.id || item.product_id || item.service_id || "");
      if (!extId) continue;

      const name = item.name || item.title || item.product_name || "External Product";
      const desc = item.desc || item.description || item.details || `Automated digital product delivered via external bot API. (Service ID: ${extId})`;
      const baseCostPrice = parseFloat(item.rate || item.price || item.cost || item.unit_price || 5.0);
      const apiStock = parseInt(item.stock || item.remains || item.quantity || (item.status === 'active' || item.status === 1 ? 50 : 0)) || 0;

      // Check if product already exists in store
      const existing = await env.DB.prepare("SELECT id, custom_price_usd FROM products WHERE external_id = ?").bind(extId).first();

      let finalSellingPrice = 0;
      if (existing && existing.custom_price_usd && existing.custom_price_usd > 0) {
        // PRESERVE CUSTOM PRICE SET BY ADMIN!
        finalSellingPrice = existing.custom_price_usd;
      } else {
        // Calculate with profit margin
        finalSellingPrice = Number((baseCostPrice * (1 + margin / 100)).toFixed(2));
      }

      const priceBdt = Math.round(finalSellingPrice * rate);

      if (existing) {
        await env.DB.prepare(
          "UPDATE products SET name = ?, description = ?, cost_price_usd = ?, price_usd = ?, price_bdt = ?, api_stock = ?, is_active = 1 WHERE id = ?"
        ).bind(name, desc, baseCostPrice, finalSellingPrice, priceBdt, apiStock, existing.id).run();
      } else {
        await env.DB.prepare(
          "INSERT INTO products (name, description, price_usd, price_bdt, cost_price_usd, custom_price_usd, api_stock, is_active, is_external, external_id) VALUES (?, ?, ?, ?, ?, 0, ?, 1, 1, ?)"
        ).bind(name, desc, finalSellingPrice, priceBdt, baseCostPrice, apiStock, extId).run();
      }
      importedCount++;
    }

    return {
      success: true,
      message: `Successfully connected! Imported & updated <b>${importedCount} products</b> from the external bot API with live stock and pricing.`
    };
  } catch (err) {
    return { success: false, message: `Error connecting to external API: ${err.message}` };
  }
}

// Auto-dispatch order to External API
async function dispatchExternalOrder(env, prod, quantity, orderId) {
  try {
    const apiUrl = await getSetting(env, "external_api_url", "");
    const apiKey = await getSetting(env, "external_api_key", "");

    if (!apiUrl) {
      return { success: false, message: "External API URL not configured in store settings." };
    }

    const payload = {
      key: apiKey,
      action: "add",
      service: prod.external_id,
      quantity: quantity,
      order_id: orderId
    };

    let response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      // Fallback form urlencoded
      const formBody = new URLSearchParams(payload);
      response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody.toString()
      });
    }

    if (response.ok) {
      const resData = await response.json().catch(() => ({}));
      const extOrderId = resData.order || resData.order_id || resData.id || "";
      const credentials = resData.credentials || resData.license || resData.key || resData.data || "";

      return {
        success: true,
        externalOrderId: String(extOrderId),
        credentials: credentials || (extOrderId ? `Provider Order Confirmed: #${extOrderId}` : "Order Registered with Provider"),
        message: "Order placed successfully with external provider."
      };
    } else {
      return { success: false, message: `Provider API responded with HTTP status ${response.status}` };
    }
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ====================================================================
// Purchase-Based Referral Commission Engine
// ====================================================================
async function processReferralCommission(env, buyerChatId, orderAmountUsd, productName) {
  try {
    const buyer = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(buyerChatId).first();
    if (!buyer || !buyer.referred_by || buyer.referred_by === 0) return;

    const referrerId = buyer.referred_by;
    const commPct = parseFloat(await getSetting(env, "referral_commission_percent", "5"));
    const commissionUsd = Number(((orderAmountUsd * commPct) / 100).toFixed(2));

    if (commissionUsd <= 0) return;

    const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
    const commissionBdt = Math.round(commissionUsd * rate);

    await env.DB.prepare(
      "UPDATE users SET balance_usd = balance_usd + ?, balance_bdt = balance_bdt + ? WHERE user_id = ?"
    ).bind(commissionUsd, commissionBdt, referrerId).run();

    await sendTelegram(env, "sendMessage", {
      chat_id: referrerId,
      text: `🎉 <b>Referral Commission Received!</b>\n\nYour referred friend just completed a purchase of <b>${productName}</b>!\n💰 Added: <b>+$${commissionUsd.toFixed(2)} USD (≈ ৳${commissionBdt} BDT)</b> (${commPct}% commission) to your wallet balance.`,
      parse_mode: "HTML"
    });
  } catch (err) {
    console.error("Referral Commission Error:", err);
  }
}

async function clearAdminState(env, userId) {
  await env.DB.prepare("DELETE FROM admin_states WHERE user_id = ?").bind(userId).run();
}

async function getSetting(env, key, defaultVal) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first();
  return (row && row.value) ? row.value : defaultVal;
}

// ====================================================================
// User Interface Views (100% Matching Screenshots & Colors)
// ====================================================================

// 1. Home Dashboard
async function sendHomeDashboard(env, chatId, user, firstName, editMessageId = null) {
  const usdBal = user ? (user.balance_usd || 0).toFixed(2) : "0.00";
  const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
  const bdtBal = user ? Math.round((user.balance_usd || 0) * rate) : 0;

  const welcome = `🛒 <b>Welcome to SMART SUBS STORE!</b>\n\n` +
    `Hello ${firstName}! 👋\n\n` +
    `We offer high-quality digital products and software licenses with fast, secure, and automated delivery.\n\n` +
    `<blockquote>🛒 <b>Shop</b> — Browse & buy products\n` +
    `💰 <b>Deposit</b> — Add funds to your wallet\n` +
    `👤 <b>Profile</b> — View wallet balance & orders\n` +
    `🕒 <b>Support</b> — 24/7 Customer Helpdesk</blockquote>\n\n` +
    `💰 <b>Wallet Balance:</b> $${usdBal} USD (≈ ৳${bdtBal} BDT)\n\n` +
    `Select an option below to continue:`;

  const keyboard = [
    [{ text: "🛒 Shop", callback_data: "shop", style: "success" }],
    [{ text: "👤 Profile", callback_data: "profile", style: "success" }, { text: "💰 Deposit", callback_data: "deposit", style: "success" }],
    [{ text: "🕒 Support", callback_data: "support", style: "success" }, { text: "📦 Orders", callback_data: "my_orders", style: "success" }],
    [{ text: "⏳ Pre-Orders", callback_data: "my_preorders", style: "success" }, { text: "👥 Refer & Earn", callback_data: "refer", style: "success" }]
  ];

  if (String(chatId) === String(env.ADMIN_ID)) {
    keyboard.push([{ text: "👑 Admin Panel", callback_data: "admin_panel", style: "success" }]);
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

// 2. Direct Products on [🛒 Shop] (Matching Screenshots 2 & 3: Green for in-stock, Red for out-of-stock, with Refresh & Back)
async function sendProductsDirectly(env, chatId, editMessageId = null) {
  const { results: prods } = await env.DB.prepare(
    `SELECT p.*, 
      CASE 
        WHEN p.is_external = 1 THEN COALESCE(p.api_stock, 0)
        ELSE (SELECT COUNT(*) FROM inventory i WHERE i.product_id = p.id AND i.is_sold = 0)
      END as stock_qty 
     FROM products p 
     WHERE p.is_active = 1`
  ).all();

  const buttons = [];

  if (prods && prods.length > 0) {
    for (const p of prods) {
      const qty = p.stock_qty || 0;
      // Format matching Screenshot 2 & 3: e.g. "NordVPN 3m · $2.50 (203)" or "Coursera Premium (NW) · $2 (0)"
      const priceFormatted = Number(p.price_usd) % 1 === 0 ? Number(p.price_usd).toFixed(0) : Number(p.price_usd).toFixed(2);
      const label = `📦 ${p.name} · $${priceFormatted} (${qty})`;

      // Native Telegram color styling:
      // "success" = Green for available stock
      // "danger" = Red for 0 stock
      const buttonStyle = qty > 0 ? "success" : "danger";

      buttons.push([{ text: label, callback_data: `prod_${p.id}`, style: buttonStyle }]);
    }
  } else {
    buttons.push([{ text: "❌ No products currently in store", callback_data: "none", style: "danger" }]);
  }

  // Bottom action bar: Refresh & Back (as shown in Screenshot 2)
  buttons.push([
    { text: "🔄 Refresh", callback_data: "shop", style: "success" },
    { text: "◀️ Back", callback_data: "home", style: "success" }
  ]);

  const text = `🛒 <b>Available Products</b>\n\nSelect any product below to view details, live stock, and instant buy options:`;
  const payload = { chat_id: chatId, text, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };

  if (editMessageId) {
    payload.message_id = editMessageId;
    await sendTelegram(env, "editMessageText", payload);
  } else {
    await sendTelegram(env, "sendMessage", payload);
  }
}

// 3. Product Details View (Matching Screenshot 4)
async function sendProductDetailView(env, chatId, prodId, editMessageId = null) {
  const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
  if (!prod) return;

  const stock = await env.DB.prepare("SELECT COUNT(*) as count FROM inventory WHERE product_id = ? AND is_sold = 0").bind(prodId).first();
  const stockCount = prod.is_external ? prod.api_stock : (stock ? stock.count : 0);
  const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
  const priceBdt = Math.round(prod.price_usd * rate);

  const descBlock = prod.description || "Digital product license key / account credentials.";

  const details = `💌 <b>${prod.name}</b>\n\n` +
    `👛 Price: <b>$${Number(prod.price_usd).toFixed(2)} / item</b> (≈ ৳${priceBdt} BDT)\n` +
    `📦 Available Stock: <b>${stockCount}</b>\n\n` +
    `📦 <b>Product Details</b>\n` +
    `<blockquote>${descBlock}</blockquote>\n\n` +
    `<blockquote>Important Note:\n` +
    `Delivery is instant and automated after payment confirmation.\n` +
    `All items and redemption links are verified before delivery.\n` +
    `Please reach out to 24/7 Support if you have any questions.</blockquote>\n\n` +
    `<i>Delivery is automatic after payment confirmation.</i>`;

  const buttons = [];
  if (stockCount > 0) {
    buttons.push([{ text: "🛍️ Buy Now", callback_data: `buynow_${prod.id}`, style: "success" }]);
  } else {
    buttons.push([{ text: "⏳ Pre-Order Now", callback_data: `preorder_${prod.id}`, style: "danger" }]);
  }

  // Row with Refresh and Back (Matching Screenshot 4)
  buttons.push([
    { text: "🔄 Refresh", callback_data: `prod_${prod.id}`, style: "success" },
    { text: "◀️ Back", callback_data: "shop", style: "success" }
  ]);

  const payload = { chat_id: chatId, text: details, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };

  if (editMessageId) {
    payload.message_id = editMessageId;
    await sendTelegram(env, "editMessageText", payload);
  } else {
    await sendTelegram(env, "sendMessage", payload);
  }
}

// 4. Order Preview & Quantity Selector (Matching Screenshot 5)
async function sendOrderPreview(env, chatId, prodId, quantity = 1, editMessageId = null) {
  const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
  if (!prod) return;

  const user = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(chatId).first();
  const userBal = user ? (user.balance_usd || 0) : 0;
  const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));

  const qty = quantity > 0 ? quantity : 1;
  const unitPrice = Number(prod.price_usd);
  const totalPrice = Number((unitPrice * qty).toFixed(2));
  const totalBdt = Math.round(totalPrice * rate);

  const diff = totalPrice - userBal;
  const hasEnoughBal = diff <= 0;

  const previewText = `💌 <b>${prod.name}</b>\n\n` +
    `📦 <b>Order Preview</b>\n\n` +
    `Quantity: <b>${qty} item(s)</b>\n` +
    `👛 Unit Price: <b>$${unitPrice.toFixed(2)}</b>\n` +
    `💼 Total: <b>$${totalPrice.toFixed(2)}</b> (≈ ৳${totalBdt} BDT)\n` +
    `👛 Wallet Balance: <b>${userBal.toFixed(2)} USDT</b>\n\n` +
    (hasEnoughBal ? `✅ <b>Wallet balance is sufficient!</b>` : `⚠️ <b>Need ${diff.toFixed(2)} USDT more in your wallet.</b>\n\nChoose how you want to pay:`);

  // Keypad for 1-9 (Current selected quantity highlighted as · X ·)
  const keypad = [
    [
      { text: qty === 1 ? "· 1 ·" : "1", callback_data: `qty_${prod.id}_1`, style: "success" },
      { text: qty === 2 ? "· 2 ·" : "2", callback_data: `qty_${prod.id}_2`, style: "success" },
      { text: qty === 3 ? "· 3 ·" : "3", callback_data: `qty_${prod.id}_3`, style: "success" }
    ],
    [
      { text: qty === 4 ? "· 4 ·" : "4", callback_data: `qty_${prod.id}_4`, style: "success" },
      { text: qty === 5 ? "· 5 ·" : "5", callback_data: `qty_${prod.id}_5`, style: "success" },
      { text: qty === 6 ? "· 6 ·" : "6", callback_data: `qty_${prod.id}_6`, style: "success" }
    ],
    [
      { text: qty === 7 ? "· 7 ·" : "7", callback_data: `qty_${prod.id}_7`, style: "success" },
      { text: qty === 8 ? "· 8 ·" : "8", callback_data: `qty_${prod.id}_8`, style: "success" },
      { text: qty === 9 ? "· 9 ·" : "9", callback_data: `qty_${prod.id}_9`, style: "success" }
    ],
    [
      { text: "📦 Custom", callback_data: `custom_qty_${prod.id}`, style: "success" }
    ]
  ];

  // Action buttons matching Screenshot 5
  if (!hasEnoughBal) {
    keypad.push([{ text: `💳 Deposit $${diff.toFixed(2)} more → Pay from Balance`, callback_data: `dep_needed_${diff.toFixed(2)}`, style: "success" }]);
  } else {
    keypad.push([{ text: `👛 Pay from Balance ($${totalPrice.toFixed(2)})`, callback_data: `pay_balance_${prod.id}_${qty}`, style: "success" }]);
  }

  keypad.push([
    { text: `⚡ Direct Pay - ${qty} items - $${totalPrice.toFixed(2)}`, callback_data: `direct_pay_${prod.id}_${qty}`, style: "success" }
  ]);

  keypad.push([
    { text: "✨ Change Quantity", callback_data: `custom_qty_${prod.id}`, style: "success" }
  ]);

  keypad.push([
    { text: "⚠️ Cancel Order", callback_data: `prod_${prod.id}`, style: "danger" }
  ]);

  const payload = { chat_id: chatId, text: previewText, parse_mode: "HTML", reply_markup: { inline_keyboard: keypad } };

  if (editMessageId) {
    payload.message_id = editMessageId;
    await sendTelegram(env, "editMessageText", payload);
  } else {
    await sendTelegram(env, "sendMessage", payload);
  }
}

// 5. Deposit / Add Funds View (Matching Screenshot 1 - NO Bangladesh Text!)
async function sendDeposit(env, chatId, editMessageId = null, prefillAmount = null) {
  const user = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(chatId).first();
  const usdBal = user ? (user.balance_usd || 0).toFixed(2) : "0.00";
  const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
  const bdtBal = user ? Math.round((user.balance_usd || 0) * rate) : 0;

  const depText = `💳 <b>Add funds</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `<b>Balance:</b> $${usdBal} USD (≈ ৳${bdtBal} BDT)\n` +
    (prefillAmount ? `⚠️ <i>Required for current order: $${prefillAmount} USD</i>\n\n` : `\n`) +
    `📌 <b>Pick a payment method.</b>\n` +
    `✅ <b>Accepted:</b> Binance, BEP20, Rocket, Bkash, Nagad`;

  // Buttons with dedicated icons and NO "Bangladesh" text (Matching Screenshot 1)
  const buttons = [
    [{ text: "🟡 Binance", callback_data: "dep_method_binance", style: "success" }],
    [{ text: "🌐 BEP20", callback_data: "dep_method_bep20", style: "success" }, { text: "🚀 Rocket", callback_data: "dep_method_rocket", style: "success" }],
    [{ text: "🌸 Bkash", callback_data: "dep_method_bkash", style: "success" }, { text: "🔴 Nagad", callback_data: "dep_method_nagad", style: "success" }],
    [{ text: "👛 Wallet", callback_data: "profile", style: "success" }],
    [{ text: "◀️ Main Menu", callback_data: "home", style: "success" }]
  ];

  const payload = { chat_id: chatId, text: depText, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };

  if (editMessageId) {
    payload.message_id = editMessageId;
    await sendTelegram(env, "editMessageText", payload);
  } else {
    await sendTelegram(env, "sendMessage", payload);
  }
}

// 6. Button-Driven Admin Dashboard (100% Zero-Command)
async function sendAdminDashboard(env, chatId, editMessageId = null) {
  const totalUsers = await env.DB.prepare("SELECT COUNT(*) as count FROM users").first();
  const totalOrders = await env.DB.prepare("SELECT COUNT(*) as count FROM orders").first();
  const completed = await env.DB.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'completed'").first();
  const pending = await env.DB.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'").first();
  const stock = await env.DB.prepare("SELECT COUNT(*) as count FROM inventory WHERE is_sold = 0").first();
  const pendingPo = await env.DB.prepare("SELECT COUNT(*) as count FROM preorders WHERE status = 'pending'").first();
  const apiProds = await env.DB.prepare("SELECT COUNT(*) as count FROM products WHERE is_external = 1 AND is_active = 1").first();

  const rate = await getSetting(env, "usd_to_bdt_rate", "125");
  const commPct = await getSetting(env, "referral_commission_percent", "5");

  const report = `👑 <b>Store Administration Control Center</b>\n\n` +
    `📊 <b>Store Analytics:</b>\n` +
    `• Registered Users: <b>${totalUsers ? totalUsers.count : 0} members</b>\n` +
    `• Total Orders: <b>${totalOrders ? totalOrders.count : 0}</b>\n` +
    `• Completed Deliveries: <b>${completed ? completed.count : 0}</b>\n` +
    `• Pending Verifications: <b>${pending ? pending.count : 0}</b>\n` +
    `• Total In-Stock Items: <b>${stock ? stock.count : 0}</b>\n` +
    `• External Bot API Products: <b>${apiProds ? apiProds.count : 0} active</b>\n` +
    `• Pending Pre-Orders: <b>${pendingPo ? pendingPo.count : 0}</b>\n\n` +
    `⚙️ <b>Current System Rates:</b>\n` +
    `• Rate: <b>1 USD = ${rate} BDT</b>\n` +
    `• Referral Commission: <b>${commPct}% on purchase</b>\n\n` +
    `Select any button below to manage your store:`;

  const buttons = [
    [{ text: "➕ Add Stock", callback_data: "adm_stock_menu", style: "success" }, { text: "➕ Add New Product", callback_data: "adm_add_product", style: "success" }],
    [{ text: "💰 Custom Prices", callback_data: "adm_price_menu", style: "success" }, { text: "📋 Manage Products", callback_data: "adm_manage_products", style: "success" }],
    [{ text: `🔌 Bot API Center (${apiProds ? apiProds.count : 0})`, callback_data: "adm_api_menu", style: "success" }, { text: `⏳ Pre-Orders (${pendingPo ? pendingPo.count : 0})`, callback_data: "adm_view_preorders", style: "success" }],
    [{ text: `💱 1 USD = BDT Rate (${rate})`, callback_data: "adm_set_rate", style: "success" }, { text: `🎁 Referral % (${commPct}%)`, callback_data: "adm_set_ref_comm", style: "success" }],
    [{ text: "⚙️ Payment Numbers", callback_data: "adm_payment_settings", style: "success" }, { text: "📞 Support Contact ID", callback_data: "adm_set_support", style: "success" }],
    [{ text: "📢 Broadcast Message", callback_data: "adm_broadcast", style: "success" }],
    [{ text: "🏪 Back to Store Home", callback_data: "home", style: "success" }]
  ];

  const payload = { chat_id: chatId, text: report, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) {
    payload.message_id = editMessageId;
    await sendTelegram(env, "editMessageText", payload);
  } else {
    await sendTelegram(env, "sendMessage", payload);
  }
}

// 7. Profile & Wallet
async function sendProfile(env, chatId, user, editMessageId = null) {
  const usdBal = user ? (user.balance_usd || 0).toFixed(2) : "0.00";
  const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
  const bdtBal = user ? Math.round((user.balance_usd || 0) * rate) : 0;

  const profileText = `👤 <b>Customer Profile & Wallet</b>\n\n` +
    `🆔 <b>User ID:</b> <code>${chatId}</code>\n` +
    `👤 <b>Name:</b> ${user ? user.first_name : "Customer"}\n\n` +
    `💰 <b>Available Wallet Balance:</b>\n` +
    `• USD: <b>$${usdBal} USD</b>\n` +
    `• BDT: <b>৳${bdtBal} BDT</b>\n\n` +
    `👥 <b>Total Invited Friends:</b> ${user ? user.total_referrals : 0} members`;

  const buttons = [
    [{ text: "💰 Deposit / Add Funds", callback_data: "deposit", style: "success" }],
    [{ text: "📦 Order History", callback_data: "my_orders", style: "success" }, { text: "⏳ My Pre-Orders", callback_data: "my_preorders", style: "success" }],
    [{ text: "◀️ Main Menu", callback_data: "home", style: "success" }]
  ];

  const payload = { chat_id: chatId, text: profileText, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

// 8. User Pre-Orders List
async function sendUserPreorders(env, chatId, editMessageId = null) {
  const { results: preorders } = await env.DB.prepare(
    "SELECT po.*, p.name as product_name, p.price_usd FROM preorders po JOIN products p ON po.product_id = p.id WHERE po.user_id = ? ORDER BY po.id DESC LIMIT 5"
  ).bind(chatId).all();

  let text = `⏳ <b>Your Pre-Orders:</b>\n\n`;
  if (!preorders || preorders.length === 0) {
    text += `You have not placed any pre-orders yet.`;
  } else {
    preorders.forEach(po => {
      text += `🔹 <b>${po.product_name}</b>\nPrice: $${po.price_usd.toFixed(2)} USD\nStatus: <b>${po.status.toUpperCase()}</b>\n\n`;
    });
  }

  const buttons = [
    [{ text: "🛒 Open Shop", callback_data: "shop", style: "success" }],
    [{ text: "◀️ Main Menu", callback_data: "home", style: "success" }]
  ];
  const payload = { chat_id: chatId, text, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

// 9. Order History
async function sendOrders(env, chatId, editMessageId = null) {
  const { results } = await env.DB.prepare(
    "SELECT o.*, p.name as product_name, i.item_data FROM orders o JOIN products p ON o.product_id = p.id LEFT JOIN inventory i ON o.id = i.order_id WHERE o.user_id = ? AND o.status = 'completed' ORDER BY o.id DESC LIMIT 5"
  ).bind(chatId).all();

  let orderText = `📦 <b>Your Completed Orders:</b>\n\n`;
  if (!results || results.length === 0) {
    orderText += `You have not completed any purchases yet.`;
  } else {
    results.forEach(o => {
      orderText += `🔹 <b>${o.product_name}</b>\nOrder: #${o.id} | Quantity: ${o.quantity || 1} | Amount: $${o.amount_usd} USD\nCredentials: <code>${o.item_data || o.trx_id || "Delivered"}</code>\n\n`;
    });
  }

  const buttons = [[{ text: "◀️ Main Menu", callback_data: "home", style: "success" }]];
  const payload = { chat_id: chatId, text: orderText, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

// 10. Refer & Earn Program (Purchase-Based % Commission)
async function sendRefer(env, chatId, user, editMessageId = null) {
  const botInfo = await sendTelegram(env, "getMe", {});
  const botData = await botInfo.json();
  const botUsername = botData.result ? botData.result.username : "bot";

  const refLink = `https://t.me/${botUsername}?start=ref_${chatId}`;
  const commPct = await getSetting(env, "referral_commission_percent", "5");

  const refText = `👥 <b>Refer & Earn Program</b>\n\n` +
    `Invite friends to our store and earn <b>${commPct}% instant wallet commission</b> whenever your invited friend purchases any product!\n\n` +
    `🔗 <b>Your Personal Referral Link:</b>\n` +
    `<code>${refLink}</code>\n\n` +
    `📊 <b>Your Statistics:</b>\n` +
    `• Total Referred Members: <b>${user ? user.total_referrals : 0} members</b>\n` +
    `• Commission Rate: <b>${commPct}% on all purchases</b>`;

  const buttons = [
    [{ text: "📤 Share Referral Link", url: `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent("Check out this digital products store with instant automated delivery!")}` }],
    [{ text: "◀️ Main Menu", callback_data: "home", style: "success" }]
  ];

  const payload = { chat_id: chatId, text: refText, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

// 11. Support & Helpdesk
async function sendSupport(env, chatId, editMessageId = null) {
  const supContact = await getSetting(env, "support_admin", "@fojlaybd");
  const cleanUsername = supContact.replace("@", "");

  const supText = `🕒 <b>Customer Support & Helpdesk</b>\n\n` +
    `Need help with an order, deposit, or have questions?\nOur customer service team is ready to assist you!\n\n` +
    `📞 <b>Official Administrator:</b> <code>${supContact}</code>\n\n` +
    `Click below to start a direct chat with Support:`;

  const buttons = [
    [{ text: "💬 Chat with Support Admin", url: `https://t.me/${cleanUsername}` }],
    [{ text: "◀️ Main Menu", callback_data: "home", style: "success" }]
  ];

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
