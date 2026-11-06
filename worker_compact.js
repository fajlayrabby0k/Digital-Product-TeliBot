// ====================================================================
// SMART SUBS STORE - COMPLETE ALL-IN-ONE TELEGRAM BOT WORKER
// Includes: Force Join, Pre-Orders, % Profit Margin Markup, Icons,
// VEXORIX Reseller API Engine, Zero [API] Tag, Referral Program.
// ====================================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. Setup Database & Register Bot Commands (No /home command)
    if (url.pathname === "/api/setup") {
      try {
        if (!env.DB) return new Response(JSON.stringify({ error: "D1 database 'DB' not bound in Cloudflare Pages." }), { status: 500 });
        await setupDatabase(env.DB);
        await sendTelegram(env, "setMyCommands", {
          commands: [
            { command: "start", description: "Open store dashboard" },
            { command: "shop", description: "Browse all products" },
            { command: "deposit", description: "Add funds to wallet" },
            { command: "profile", description: "My wallet & account" },
            { command: "orders", description: "My order history" },
            { command: "preorder", description: "My active pre-orders" },
            { command: "refer", description: "Refer & earn commission" },
            { command: "support", description: "24/7 Customer Helpdesk" }
          ]
        });
        return new Response(JSON.stringify({ success: true, message: "Store schema & Telegram commands configured successfully!" }), { status: 200, headers: { "Content-Type": "application/json" } });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }

    // 2. Mock External Provider API for instant testing (/api/mock-provider)
    if (url.pathname.startsWith("/api/mock-provider")) {
      let action = url.searchParams.get("action") || "";
      if (request.method === "POST") {
        try {
          const body = await request.clone().json().catch(() => ({}));
          if (body.action) action = body.action;
          if (body.product_id) action = "orders";
        } catch (_) {}
      }
      if (action === "me" || url.pathname.endsWith("/me")) {
        return new Response(JSON.stringify({ reseller: { id: "reseller_demo", username: "DemoReseller" }, wallet: { balance: 50.0, currency: "USDT" } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (action === "products" || url.pathname.endsWith("/products")) {
        return new Response(JSON.stringify({
          products: [
            { id: "ext_prime_6m", name: "🍿 Amazon Prime 6 Months", description: "Prime Video 6 Months Premium", price: 3.50, stock: 150, available: true },
            { id: "ext_lovable_pro", name: "🤖 Lovable Pro 12M", description: "Full Lovable Pro with daily credits", price: 35.00, stock: 45, available: true },
            { id: "ext_nordvpn_1y", name: "🛡️ NordVPN Premium 1 Year", description: "Ultra-fast VPN access", price: 4.00, stock: 80, available: true }
          ]
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (action === "orders" || url.pathname.endsWith("/orders")) {
        return new Response(JSON.stringify({ order_id: `MOCK-${Date.now()}`, status: "completed", items: [{ content: `KEY-AUTO-${Date.now().toString(36).toUpperCase()}` }], balance_after: 46.50 }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
    }

    // 3. Telegram Webhook Entrypoint
    if (request.method === "POST" && (url.pathname === "/api/webhook" || url.pathname === "/")) {
      try {
        const update = await request.json();
        await handleUpdate(update, env, url.origin);
        return new Response("OK", { status: 200 });
      } catch (err) {
        console.error("Webhook processing error:", err);
        return new Response("ERROR", { status: 200 });
      }
    }

    return new Response("SMART SUBS STORE Telegram Bot Worker is Active.", { status: 200 });
  }
};

// ====================================================================
// Database Setup & Migration
// ====================================================================
async function setupDatabase(db) {
  const schema = [
    `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER UNIQUE NOT NULL, username TEXT, first_name TEXT, balance_usd REAL DEFAULT 0, balance_bdt REAL DEFAULT 0, referred_by INTEGER DEFAULT 0, total_referrals INTEGER DEFAULT 0, total_spent_usd REAL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);`,
    `CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, price_usd REAL NOT NULL, price_bdt REAL NOT NULL, is_active INTEGER DEFAULT 1, is_external INTEGER DEFAULT 0, external_id TEXT DEFAULT '', cost_price_usd REAL DEFAULT 0, custom_price_usd REAL DEFAULT 0, api_stock INTEGER DEFAULT 0);`,
    `CREATE TABLE IF NOT EXISTS inventory (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, item_data TEXT NOT NULL, is_sold INTEGER DEFAULT 0, order_id INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (product_id) REFERENCES products(id));`,
    `CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, username TEXT, product_id INTEGER NOT NULL, quantity INTEGER DEFAULT 1, payment_method TEXT NOT NULL, trx_id TEXT DEFAULT '', amount_usd REAL NOT NULL DEFAULT 0, amount_bdt REAL NOT NULL DEFAULT 0, status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (product_id) REFERENCES products(id));`,
    `CREATE TABLE IF NOT EXISTS preorders (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, username TEXT, product_id INTEGER NOT NULL, status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (product_id) REFERENCES products(id));`,
    `CREATE TABLE IF NOT EXISTS deposits (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, username TEXT, method TEXT NOT NULL, amount_usd REAL NOT NULL DEFAULT 0, amount_bdt REAL NOT NULL DEFAULT 0, trx_id TEXT DEFAULT '', status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);`,
    `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);`,
    `CREATE TABLE IF NOT EXISTS admin_states (user_id INTEGER PRIMARY KEY, state TEXT, data TEXT);`,
    `CREATE TABLE IF NOT EXISTS user_states (user_id INTEGER PRIMARY KEY, state TEXT, data TEXT);`
  ];
  for (const q of schema) await db.prepare(q).run();

  const alters = [
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
  for (const alt of alters) { try { await db.prepare(alt).run(); } catch (_) {} }

  const defaultSettings = [
    ['usd_to_bdt_rate', '125'],
    ['referral_commission_percent', '5'],
    ['support_admin', '@fojlaybd'],
    ['bkash_num', '017XXXXXXXX'],
    ['nagad_num', '017XXXXXXXX'],
    ['rocket_num', '017XXXXXXXX'],
    ['binance_id', '6029752069'],
    ['bep20_addr', '0x71C...YourWalletAddress'],
    ['external_api_url', 'https://207-148-64-141.sslip.io'],
    ['external_api_key', ''],
    ['external_profit_margin', '20'],
    ['auto_order_enabled', '1'],
    ['force_channel_username', ''],
    ['force_group_username', '']
  ];
  for (const [k, v] of defaultSettings) {
    await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").bind(k, v).run();
  }

  // Sample catalog if empty
  const prodsCount = await db.prepare("SELECT COUNT(*) as count FROM products").first();
  if (!prodsCount || prodsCount.count === 0) {
    await db.prepare(`INSERT INTO products (id, name, description, price_usd, price_bdt, is_active) VALUES 
      (1, '🤖 Lovable Pro 12m NW', 'Full Pro Access for 12 Months\\n- 5 daily credits (up to 150/month)\\n- One-Time 300 Credits\\n- Instant Automated Delivery', 45.50, 5688, 1),
      (2, '⚡ Lovable Lite 12m (300 Credits)', 'Full Lite Access for 12 Months\\n- 300 Credits\\n- Instant Automated Delivery', 5.00, 625, 1),
      (3, '🛡️ NordVPN 3m Premium', 'NordVPN 3 Months Premium Access Account\\n- Fast VPN servers worldwide', 2.50, 312, 1),
      (4, '🎓 Udemy Personal Plan 1M', 'Udemy Personal Plan 1 Month Subscription\\n- Access to 10,000+ top courses', 1.50, 188, 1);`
    ).run();
    await db.prepare(`INSERT INTO inventory (product_id, item_data) VALUES 
      (2, 'https://lovable.dev/redeem/LOV-300-LITE-KEY-001'),
      (2, 'https://lovable.dev/redeem/LOV-300-LITE-KEY-002'),
      (3, 'User: norduser_01@gmail.com | Pass: Nord#Pass2026'),
      (4, 'User: udemy_pro@gmail.com | Pass: Study#2026');`
    ).run();
  }
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

    // User Registration / Loading & Referral Tracking
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
      await env.DB.prepare("INSERT INTO users (user_id, username, first_name, referred_by) VALUES (?, ?, ?, ?)").bind(chatId, username, firstName, referrerId).run();
      user = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(chatId).first();

      if (referrerId > 0) {
        await env.DB.prepare("UPDATE users SET total_referrals = total_referrals + 1 WHERE user_id = ?").bind(referrerId).run();
        const commPct = await getSetting(env, "referral_commission_percent", "5");
        await sendTelegram(env, "sendMessage", {
          chat_id: referrerId,
          text: `👥 <b>New Referral Joined!</b>\n\nUser ${username} joined using your invite link.\nYou will automatically earn <b>${commPct}% commission</b> on all their product purchases! 🎉`,
          parse_mode: "HTML"
        }).catch(() => {});
      }
    } else if ((!user.referred_by || user.referred_by === 0) && text.startsWith("/start ref_")) {
      const parts = text.split("ref_");
      if (parts.length > 1) {
        const refId = parseInt(parts[1]) || 0;
        if (refId > 0 && refId !== chatId) {
          await env.DB.prepare("UPDATE users SET referred_by = ? WHERE user_id = ?").bind(refId, chatId).run();
          await env.DB.prepare("UPDATE users SET total_referrals = total_referrals + 1 WHERE user_id = ?").bind(refId).run();
          user.referred_by = refId;
          const commPct = await getSetting(env, "referral_commission_percent", "5");
          await sendTelegram(env, "sendMessage", {
            chat_id: refId,
            text: `👥 <b>New Referral Linked!</b>\n\nUser ${username} linked using your invite link.\nYou will automatically earn <b>${commPct}% commission</b> on all their purchases! 🎉`,
            parse_mode: "HTML"
          }).catch(() => {});
        }
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

    // MANDATORY FORCE JOIN GATE (Announcement Channel + Chat Group)
    if (String(chatId) !== String(env.ADMIN_ID)) {
      const forceCheck = await checkForceJoin(env, chatId);
      if (!forceCheck.passed) {
        await sendForceJoinScreen(env, chatId, forceCheck);
        return;
      }
    }

    // Reply to Order Checkout or Deposit with TrxID / Hash
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
          const order = await env.DB.prepare("SELECT o.*, p.name as product_name FROM orders o JOIN products p ON o.product_id = p.id WHERE o.id = ?").bind(orderId).first();
          if (order) {
            await sendTelegram(env, "sendMessage", {
              chat_id: env.ADMIN_ID,
              text: `🚨 <b>New Order Payment Verification!</b>\n\nOrder ID: #${order.id}\nProduct: <b>${order.product_name}</b>\nQuantity: <b>${order.quantity || 1} items</b>\nPayment Method: <b>${order.payment_method}</b>\nAmount: <b>$${order.amount_usd} USD (৳${order.amount_bdt} BDT)</b>\nTrxID / Hash: <code>${trxId}</code>\nCustomer: ${order.username} (ID: <code>${order.user_id}</code>)`,
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [[
                  { text: "✅ Approve Order", callback_data: `admin_approve_${orderId}`, style: "success" },
                  { text: "❌ Reject Order", callback_data: `admin_reject_${orderId}`, style: "danger" }
                ]]
              }
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
        if (depId) await env.DB.prepare("UPDATE deposits SET trx_id = ? WHERE id = ?").bind(trxInfo, depId).run();
        await sendTelegram(env, "sendMessage", {
          chat_id: chatId,
          text: `✅ <b>Deposit Submission Received!</b>\n\nTransaction Details: <code>${trxInfo}</code>\n\nAdmin will verify the transaction and credit your wallet balance shortly.`,
          parse_mode: "HTML"
        });
        const depRow = depId ? await env.DB.prepare("SELECT * FROM deposits WHERE id = ?").bind(depId).first() : null;
        await sendTelegram(env, "sendMessage", {
          chat_id: env.ADMIN_ID,
          text: `🚨 <b>New Wallet Deposit Verification!</b>\n\nDeposit ID: #${depId || "N/A"}\nCustomer: ${username} (ID: <code>${chatId}</code>)\nMethod: <b>${depRow ? depRow.method : "Payment"}</b>\nAmount: $${depRow ? depRow.amount_usd : "0"} USD (~ ৳${depRow ? depRow.amount_bdt : "0"} BDT)\nTrxID / Hash: <code>${trxInfo}</code>`,
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

    // Navigation Commands
    if (text.startsWith("/start") || text === "/home") { await sendHomeDashboard(env, chatId, user, firstName); return; }
    if (text === "/shop") { await sendProductsDirectly(env, chatId); return; }
    if (text === "/deposit") { await sendDeposit(env, chatId); return; }
    if (text === "/profile") { await sendProfile(env, chatId, user); return; }
    if (text === "/orders") { await sendOrders(env, chatId); return; }
    if (text === "/preorder") { await sendUserPreorders(env, chatId); return; }
    if (text === "/refer") { await sendRefer(env, chatId, user); return; }
    if (text === "/support") { await sendSupport(env, chatId); return; }
    if (text === "/admin" && String(chatId) === String(env.ADMIN_ID)) { await sendAdminDashboard(env, chatId); return; }

    await sendHomeDashboard(env, chatId, user, firstName);
    return;
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

    // Force Join Verification Button
    if (data === "check_force_join") {
      const forceCheck = await checkForceJoin(env, chatId);
      if (forceCheck.passed) {
        await sendTelegram(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "✅ Membership verified! Welcome to the store.", show_alert: true });
        await sendHomeDashboard(env, chatId, user, firstName, messageId);
      } else {
        await sendTelegram(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "⚠️ You haven't joined both channels yet! Please click the buttons above to join both and tap Verify again.", show_alert: true });
      }
      return;
    }

    // Force Join Gate for regular customer callbacks
    if (String(chatId) !== String(env.ADMIN_ID) && !data.startsWith("adm_") && !data.startsWith("admin_")) {
      const forceCheck = await checkForceJoin(env, chatId);
      if (!forceCheck.passed) {
        await sendForceJoinScreen(env, chatId, forceCheck, messageId);
        return;
      }
    }

    // Customer Navigation
    if (data === "home") { await clearAdminState(env, chatId); await sendHomeDashboard(env, chatId, user, firstName, messageId); return; }
    if (data === "shop") { await sendProductsDirectly(env, chatId, messageId); return; }
    if (data === "profile") { await sendProfile(env, chatId, user, messageId); return; }
    if (data === "deposit") { await sendDeposit(env, chatId, messageId); return; }
    if (data === "my_orders") { await sendOrders(env, chatId, messageId); return; }
    if (data === "my_preorders") { await sendUserPreorders(env, chatId, messageId); return; }
    if (data === "refer") { await sendRefer(env, chatId, user, messageId); return; }
    if (data === "support") { await sendSupport(env, chatId, messageId); return; }

    // CUSTOMER PRE-ORDER SYSTEM
    if (data.startsWith("preorder_")) {
      const prodId = data.replace("preorder_", "");
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      if (prod) {
        const existingPo = await env.DB.prepare("SELECT id FROM preorders WHERE user_id = ? AND product_id = ? AND status = 'pending'").bind(chatId, prodId).first();
        if (!existingPo) {
          await env.DB.prepare("INSERT INTO preorders (user_id, username, product_id, status) VALUES (?, ?, ?, 'pending')").bind(chatId, username, prodId).run();
        }
        await sendTelegram(env, "editMessageText", {
          chat_id: chatId,
          message_id: messageId,
          text: `⏳ <b>Pre-Order Confirmed!</b>\n\nProduct: <b>${prod.name}</b>\nPrice: <b>$${Number(prod.price_usd).toFixed(2)} USD</b> (≈ ৳${prod.price_bdt} BDT)\n\n✅ Your pre-order is registered! As soon as new stock is added or synced via API, you will receive an instant notification with a direct purchase link. ❤️`,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🛒 Continue Shopping", callback_data: "shop", style: "success" }],
              [{ text: "🏠 Main Menu", callback_data: "home", style: "success" }]
            ]
          }
        });
        await sendTelegram(env, "sendMessage", {
          chat_id: env.ADMIN_ID,
          text: `🚨 <b>New Pre-Order Placed!</b>\n\nCustomer: ${username} (ID: <code>${chatId}</code>)\nProduct: <b>${prod.name}</b>\nPrice: $${prod.price_usd} USD\n\n⚠️ Please restock this product using Admin Panel or Provider API!`,
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [[{ text: `➕ Add Stock for ${prod.name}`, callback_data: `adm_addstock_${prod.id}`, style: "success" }]] }
        });
      }
      return;
    }

    // Customer Product Details & Ordering Views
    if (data.startsWith("prod_")) { await sendProductDetailView(env, chatId, data.replace("prod_", ""), messageId); return; }
    if (data.startsWith("buynow_")) { await sendOrderPreview(env, chatId, data.replace("buynow_", ""), 1, messageId); return; }
    if (data.startsWith("qty_")) {
      const parts = data.replace("qty_", "").split("_");
      await sendOrderPreview(env, chatId, parts[0], parseInt(parts[1]) || 1, messageId);
      return;
    }
    if (data.startsWith("custom_qty_")) {
      const prodId = data.replace("custom_qty_", "");
      await env.DB.prepare("INSERT OR REPLACE INTO user_states (user_id, state, data) VALUES (?, 'awaiting_custom_qty', ?)").bind(chatId, prodId).run();
      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `✏️ <b>Enter Custom Quantity:</b>\n\nPlease type the exact number of items you wish to purchase (e.g. <code>5</code>):`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "◀️ Cancel", callback_data: `prod_${prodId}`, style: "danger" }]] }
      });
      return;
    }

    // Direct Pay / Select Payment Method
    if (data.startsWith("direct_pay_")) {
      const parts = data.replace("direct_pay_", "").split("_");
      const prodId = parts[0];
      const qty = parseInt(parts[1]) || 1;
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      if (!prod) return;
      const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
      const totalUsd = Number((prod.price_usd * qty).toFixed(2));
      const totalBdt = Math.round(totalUsd * rate);

      const buttons = [
        [{ text: "🟢 bKash", callback_data: `pay_bkash_${prod.id}_${qty}`, style: "success" }, { text: "🟠 Nagad", callback_data: `pay_nagad_${prod.id}_${qty}`, style: "success" }],
        [{ text: "🟣 Rocket", callback_data: `pay_rocket_${prod.id}_${qty}`, style: "success" }],
        [{ text: "🟡 Binance Pay (USDT)", callback_data: `pay_binance_${prod.id}_${qty}`, style: "success" }, { text: "🔵 BEP20 (USDT)", callback_data: `pay_bep20_${prod.id}_${qty}`, style: "success" }],
        [{ text: "◀️ Back to Product", callback_data: `prod_${prod.id}`, style: "danger" }]
      ];
      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `💳 <b>Select Payment Method:</b>\n\nProduct: <b>${prod.name}</b>\nQuantity: <b>${qty} item(s)</b>\nTotal Amount: <b>$${totalUsd.toFixed(2)} USD (≈ ৳${totalBdt} BDT)</b>\n\nChoose your preferred payment method below:`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons }
      });
      return;
    }

    // Manual Payment Methods Checkout Flow
    if (data.startsWith("pay_") && !data.startsWith("pay_balance_")) {
      const parts = data.split("_");
      const method = parts[1];
      const prodId = parts[2];
      const qty = parseInt(parts[3]) || 1;
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      if (!prod) return;
      const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
      const totalUsd = Number((prod.price_usd * qty).toFixed(2));
      const totalBdt = Math.round(totalUsd * rate);

      const res = await env.DB.prepare("INSERT INTO orders (user_id, username, product_id, quantity, payment_method, amount_usd, amount_bdt, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')").bind(chatId, username, prodId, qty, method.toUpperCase(), totalUsd, totalBdt).run();
      const orderId = res.meta ? res.meta.last_row_id : Math.floor(Math.random() * 10000);

      let methodTitle = "Payment";
      let accountInfo = "";
      if (method === "bkash") { methodTitle = "bKash Personal"; accountInfo = await getSetting(env, "bkash_num", "017XXXXXXXX"); }
      else if (method === "nagad") { methodTitle = "Nagad Personal"; accountInfo = await getSetting(env, "nagad_num", "017XXXXXXXX"); }
      else if (method === "rocket") { methodTitle = "Rocket Personal"; accountInfo = await getSetting(env, "rocket_num", "017XXXXXXXX"); }
      else if (method === "binance") { methodTitle = "Binance Pay ID"; accountInfo = await getSetting(env, "binance_id", "6029752069"); }
      else if (method === "bep20") { methodTitle = "USDT (BEP20 / BSC)"; accountInfo = await getSetting(env, "bep20_addr", "0x71C...YourWalletAddress"); }

      const checkoutText = `💳 <b>Payment Instructions — ${methodTitle}</b>\n\n` +
        `Order ID: <b>#${orderId}</b>\n` +
        `Product: <b>${prod.name}</b> (${qty} items)\n` +
        `Total Payable: <b>$${totalUsd.toFixed(2)} USD (≈ ৳${totalBdt} BDT)</b>\n\n` +
        `👉 <b>Send Money to:</b>\n<code>${accountInfo}</code>\n\n` +
        `⚠️ <b>Important:</b> After payment, please <b>REPLY to this message</b> with your <b>Transaction ID / Hash</b> or last 4 digits of sender number.\n\n` +
        `<i>Delivery is automated immediately upon payment confirmation.</i>`;

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: checkoutText,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "◀️ Cancel Order", callback_data: `prod_${prod.id}`, style: "danger" }]] }
      });
      return;
    }

    // Pay with Wallet Balance (Instant Automated Delivery!)
    if (data.startsWith("pay_balance_")) {
      const parts = data.replace("pay_balance_", "").split("_");
      const prodId = parts[0];
      const qty = parseInt(parts[1]) || 1;
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      if (!prod) return;
      const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
      const totalUsd = Number((prod.price_usd * qty).toFixed(2));
      const totalBdt = Math.round(totalUsd * rate);

      if (!user || (user.balance_usd || 0) < totalUsd) {
        await sendTelegram(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "❌ Insufficient wallet balance!", show_alert: true });
        return;
      }

      // External API Order Dispatch
      if (prod.is_external === 1) {
        if ((prod.api_stock || 0) < qty) {
          await sendTelegram(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "❌ Product is currently out of stock!", show_alert: true });
          return;
        }
        await env.DB.prepare("UPDATE users SET balance_usd = balance_usd - ?, balance_bdt = balance_bdt - ?, total_spent_usd = total_spent_usd + ? WHERE user_id = ?").bind(totalUsd, totalBdt, totalUsd, chatId).run();
        const res = await env.DB.prepare("INSERT INTO orders (user_id, username, product_id, quantity, payment_method, trx_id, amount_usd, amount_bdt, status) VALUES (?, ?, ?, ?, 'WALLET', 'AUTO_DISPATCH', ?, ?, 'completed')").bind(chatId, username, prodId, qty, totalUsd, totalBdt).run();
        const orderId = res.meta ? res.meta.last_row_id : Math.floor(Math.random() * 10000);

        const apiResult = await dispatchExternalOrder(env, prod, qty, orderId);
        const credentials = apiResult.success ? apiResult.credentials : "Order registered with external provider. Details will be delivered shortly.";
        if (apiResult.success) {
          await env.DB.prepare("UPDATE products SET api_stock = MAX(0, api_stock - ?) WHERE id = ?").bind(qty, prod.id).run();
        }

        await sendTelegram(env, "editMessageText", {
          chat_id: chatId,
          message_id: messageId,
          text: `🎉 <b>Purchase Successful! Instant Delivery</b>\n\nOrder: #${orderId}\nProduct: <b>${prod.name}</b>\nQuantity: <b>${qty} items</b>\nTotal Paid: <b>$${totalUsd.toFixed(2)} USD</b>\n\n🔑 <b>Your Delivery Credentials:</b>\n<blockquote><code>${credentials}</code></blockquote>\n\n<i>Thank you for shopping with us!</i>`,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "📦 View Orders", callback_data: "my_orders", style: "success" }],
              [{ text: "🛒 Continue Shopping", callback_data: "shop", style: "success" }]
            ]
          }
        });
        await processReferralCommission(env, chatId, totalUsd, prod.name);
        return;
      }

      // Local Inventory Purchase
      const { results: items } = await env.DB.prepare("SELECT * FROM inventory WHERE product_id = ? AND is_sold = 0 LIMIT ?").bind(prodId, qty).all();
      if (!items || items.length < qty) {
        await sendTelegram(env, "sendMessage", {
          chat_id: chatId,
          text: `❌ <b>Insufficient Stock!</b>\n\nOnly ${items ? items.length : 0} item(s) are available. You can purchase the available count or pre-order!`,
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [[{ text: "⏳ Pre-Order Now", callback_data: `preorder_${prod.id}`, style: "danger" }]] }
        });
        return;
      }

      await env.DB.prepare("UPDATE users SET balance_usd = balance_usd - ?, balance_bdt = balance_bdt - ?, total_spent_usd = total_spent_usd + ? WHERE user_id = ?").bind(totalUsd, totalBdt, totalUsd, chatId).run();
      const res = await env.DB.prepare("INSERT INTO orders (user_id, username, product_id, quantity, payment_method, trx_id, amount_usd, amount_bdt, status) VALUES (?, ?, ?, ?, 'WALLET', 'LOCAL_STOCK', ?, ?, 'completed')").bind(chatId, username, prodId, qty, totalUsd, totalBdt).run();
      const orderId = res.meta ? res.meta.last_row_id : Math.floor(Math.random() * 10000);

      const itemStrings = [];
      for (const it of items) {
        await env.DB.prepare("UPDATE inventory SET is_sold = 1, order_id = ? WHERE id = ?").bind(orderId, it.id).run();
        itemStrings.push(it.item_data);
      }

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `🎉 <b>Purchase Successful! Instant Delivery</b>\n\nOrder: #${orderId}\nProduct: <b>${prod.name}</b>\nQuantity: <b>${qty} item(s)</b>\nTotal Paid: <b>$${totalUsd.toFixed(2)} USD</b>\n\n🔑 <b>Your Delivery Credentials:</b>\n<blockquote><code>${itemStrings.join("\n\n")}</code></blockquote>\n\n<i>Thank you for shopping with us!</i>`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📦 View Orders", callback_data: "my_orders", style: "success" }],
            [{ text: "🛒 Continue Shopping", callback_data: "shop", style: "success" }]
          ]
        }
      });
      await processReferralCommission(env, chatId, totalUsd, prod.name);
      return;
    }

    // Deposit Method Selection & Instructions
    if (data.startsWith("dep_method_") || data.startsWith("dep_needed_")) {
      let needed = 0;
      let method = "bkash";
      if (data.startsWith("dep_needed_")) {
        needed = parseFloat(data.replace("dep_needed_", "")) || 5;
        method = "bkash";
      } else {
        method = data.replace("dep_method_", "");
      }

      let mTitle = "bKash Personal";
      let accNum = await getSetting(env, "bkash_num", "017XXXXXXXX");
      if (method === "nagad") { mTitle = "Nagad Personal"; accNum = await getSetting(env, "nagad_num", "017XXXXXXXX"); }
      else if (method === "rocket") { mTitle = "Rocket Personal"; accNum = await getSetting(env, "rocket_num", "017XXXXXXXX"); }
      else if (method === "binance") { mTitle = "Binance Pay ID"; accNum = await getSetting(env, "binance_id", "6029752069"); }
      else if (method === "bep20") { mTitle = "USDT (BEP20 / BSC)"; accNum = await getSetting(env, "bep20_addr", "0x71C...YourWalletAddress"); }

      const res = await env.DB.prepare("INSERT INTO deposits (user_id, username, method, amount_usd, status) VALUES (?, ?, ?, ?, 'pending')").bind(chatId, username, method.toUpperCase(), needed).run();
      const depId = res.meta ? res.meta.last_row_id : Math.floor(Math.random() * 1000);

      const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
      const depPrompt = `💰 <b>Deposit Instructions — ${mTitle}</b>\n\n` +
        `Deposit ID: <b>#${depId}</b>\n` +
        `Send funds to the account below:\n` +
        `<blockquote><code>${accNum}</code></blockquote>\n` +
        `Exchange Rate: <b>1 USD = ${rate} BDT</b>\n\n` +
        `⚠️ <b>Important:</b> After sending payment, please <b>REPLY to this message</b> with the amount and <b>Transaction ID / Hash</b>.\n\n` +
        `Admin will verify and credit your wallet balance instantly.`;

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: depPrompt,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "◀️ Back to Deposit", callback_data: "deposit", style: "danger" }]] }
      });
      return;
    }

    // ----------------------------------------------------------------
    // ADMIN PANEL CALLBACKS (100% Button-Driven)
    // ----------------------------------------------------------------
    if (data === "admin_panel") {
      if (String(chatId) === String(env.ADMIN_ID)) {
        await clearAdminState(env, chatId);
        await sendAdminDashboard(env, chatId, messageId);
      }
      return;
    }

    // Admin Stock Management
    if (data === "adm_stock_menu") {
      const { results: prods } = await env.DB.prepare("SELECT p.*, CASE WHEN p.is_external = 1 THEN COALESCE(p.api_stock, 0) ELSE (SELECT COUNT(*) FROM inventory i WHERE i.product_id = p.id AND i.is_sold = 0) END as stock_qty FROM products p WHERE p.is_active = 1").all();
      const buttons = prods.map(p => [{ text: `📦 ${p.name} (${p.stock_qty || 0})`, callback_data: `adm_addstock_${p.id}`, style: p.stock_qty > 0 ? "success" : "danger" }]);
      buttons.push([{ text: "🔙 Admin Panel", callback_data: "admin_panel", style: "success" }]);
      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: `📦 <b>Select Product to Add Stock:</b>\nClick any product below:`, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
      return;
    }

    if (data.startsWith("adm_addstock_")) {
      const prodId = data.replace("adm_addstock_", "");
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_stock', ?)").bind(chatId, prodId).run();
      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `📥 <b>Add Stock for: ${prod ? prod.name : "Product"}</b>\n\nPlease send the license key or account credentials below.\n<i>💡 You can send multiple items separated by new lines!</i>`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "adm_stock_menu", style: "danger" }]] }
      });
      return;
    }

    // Admin: Change Price Menu (Zero [API] tag, shows live stock & price)
    if (data === "adm_price_menu") {
      const { results: prods } = await env.DB.prepare("SELECT p.*, CASE WHEN p.is_external = 1 THEN COALESCE(p.api_stock, 0) ELSE (SELECT COUNT(*) FROM inventory i WHERE i.product_id = p.id AND i.is_sold = 0) END as stock_qty FROM products p WHERE p.is_active = 1").all();
      const buttons = prods.map(p => [{ text: `${p.name} (${p.stock_qty || 0}) — $${p.price_usd.toFixed(2)}`, callback_data: `adm_setprice_${p.id}`, style: "success" }]);
      buttons.push([{ text: "🔙 Admin Panel", callback_data: "admin_panel", style: "success" }]);
      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `💰 <b>Select Product to Set Custom Price or Profit Margin:</b>\n\nClick any product below:`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons }
      });
      return;
    }

    // Admin: Set Custom Price with % Profit Margin Quick Buttons
    if (data.startsWith("adm_setprice_")) {
      const prodId = data.replace("adm_setprice_", "");
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      const stock = await env.DB.prepare("SELECT COUNT(*) as count FROM inventory WHERE product_id = ? AND is_sold = 0").bind(prodId).first();
      const liveStock = prod.is_external ? (prod.api_stock || 0) : (stock ? stock.count : 0);
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_new_price', ?)").bind(chatId, prodId).run();

      const costInfo = (prod.is_external && prod.cost_price_usd > 0) ? `\n• Provider Cost: <b>$${prod.cost_price_usd.toFixed(2)} USD</b>` : "";
      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `💰 <b>Set Custom Price for: ${prod ? prod.name : "Product"}</b>\n${costInfo}\n• Current Price: <b>$${prod.price_usd.toFixed(2)} USD</b> (≈ ৳${prod.price_bdt} BDT)\n• Live Stock: <b>${liveStock} items</b>\n\n👉 <b>Tap a Profit Margin % button below</b> OR <b>type a custom price / margin in chat</b> (e.g. <code>${(prod.price_usd * 1.25).toFixed(2)}</code> or <code>25%</code>):`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "+10% Profit", callback_data: `adm_quickmargin_${prod.id}_10`, style: "success" },
              { text: "+20% Profit", callback_data: `adm_quickmargin_${prod.id}_20`, style: "success" },
              { text: "+25% Profit", callback_data: `adm_quickmargin_${prod.id}_25`, style: "success" }
            ],
            [
              { text: "+30% Profit", callback_data: `adm_quickmargin_${prod.id}_30`, style: "success" },
              { text: "+40% Profit", callback_data: `adm_quickmargin_${prod.id}_40`, style: "success" },
              { text: "+50% Profit", callback_data: `adm_quickmargin_${prod.id}_50`, style: "success" }
            ],
            [
              { text: "+75% Profit", callback_data: `adm_quickmargin_${prod.id}_75`, style: "success" },
              { text: "+100% (2x)", callback_data: `adm_quickmargin_${prod.id}_100`, style: "success" }
            ],
            [{ text: "❌ Cancel", callback_data: "adm_price_menu", style: "danger" }]
          ]
        }
      });
      return;
    }

    if (data.startsWith("adm_quickmargin_")) {
      const parts = data.replace("adm_quickmargin_", "").split("_");
      const prodId = parts[0];
      const marginPct = parseFloat(parts[1]) || 20;
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      if (!prod) return;
      const baseCost = (prod.is_external && prod.cost_price_usd > 0) ? prod.cost_price_usd : prod.price_usd;
      const newUsd = Number((baseCost * (1 + marginPct / 100)).toFixed(2));
      const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
      const newBdt = Math.round(newUsd * rate);

      await env.DB.prepare("UPDATE products SET price_usd = ?, price_bdt = ?, custom_price_usd = ? WHERE id = ?").bind(newUsd, newBdt, newUsd, prodId).run();
      await clearAdminState(env, chatId);

      const profitUsd = (newUsd - baseCost).toFixed(2);
      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `✅ <b>Custom Price Updated!</b>\n\nProduct: <b>${prod.name}</b>\n• Profit Markup: <b>+${marginPct}%</b>\n• Base Cost: <b>$${baseCost.toFixed(2)} USD</b>\n• New Selling Price: <b>$${newUsd.toFixed(2)} USD</b> (≈ ৳${newBdt} BDT)\n• Net Profit: <b>+$${profitUsd} USD</b> per sale! 🚀`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "💰 Set Another Price", callback_data: "adm_price_menu", style: "success" }],
            [{ text: "👑 Admin Panel", callback_data: "admin_panel", style: "success" }]
          ]
        }
      });
      return;
    }

    // Admin: Add New Product (Step 1: Choose Icon from 12 Presets)
    if (data === "adm_add_product") {
      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `➕ <b>Add New Product — Step 1/4: Choose an Icon</b>\n\nSelect an attractive icon for this product from the presets below, or choose 'Skip' to type your own:`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🤖 AI Tool", callback_data: "adm_newicon_🤖", style: "success" },
              { text: "🍿 Streaming", callback_data: "adm_newicon_🍿", style: "success" },
              { text: "🎵 Music", callback_data: "adm_newicon_🎵", style: "success" }
            ],
            [
              { text: "🛡️ VPN", callback_data: "adm_newicon_🛡️", style: "success" },
              { text: "🎨 Design", callback_data: "adm_newicon_🎨", style: "success" },
              { text: "🔑 License", callback_data: "adm_newicon_🔑", style: "success" }
            ],
            [
              { text: "📺 OTT / Video", callback_data: "adm_newicon_📺", style: "success" },
              { text: "🎓 Education", callback_data: "adm_newicon_🎓", style: "success" },
              { text: "💎 Premium", callback_data: "adm_newicon_💎", style: "success" }
            ],
            [
              { text: "⚡ General", callback_data: "adm_newicon_⚡", style: "success" },
              { text: "🛍️ Digital", callback_data: "adm_newicon_🛍️", style: "success" },
              { text: "⏩ Skip / Type Own", callback_data: "adm_newicon_NONE", style: "success" }
            ],
            [{ text: "❌ Cancel", callback_data: "admin_panel", style: "danger" }]
          ]
        }
      });
      return;
    }

    if (data.startsWith("adm_newicon_")) {
      const icon = data.replace("adm_newicon_", "");
      const iconData = { icon: icon === "NONE" ? "" : icon };
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_prod_name', ?)").bind(chatId, JSON.stringify(iconData)).run();
      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `➕ <b>Add Product — Step 2/4: Product Name</b>\n\nSelected Icon: <b>${icon === "NONE" ? "None / Custom" : icon}</b>\n\nPlease enter the <b>Name</b> of the product:\n<i>(Example: Amazon Prime 6 Months)</i>`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_panel", style: "danger" }]] }
      });
      return;
    }

    // Admin: Manage Products List (Shows live stock, NO [API] tag)
    if (data === "adm_manage_products") {
      const { results: prods } = await env.DB.prepare("SELECT p.*, CASE WHEN p.is_external = 1 THEN COALESCE(p.api_stock, 0) ELSE (SELECT COUNT(*) FROM inventory i WHERE i.product_id = p.id AND i.is_sold = 0) END as stock_qty FROM products p WHERE p.is_active = 1").all();
      const buttons = prods.map(p => [{ text: `${p.name} (${p.stock_qty || 0}) — $${p.price_usd.toFixed(2)}`, callback_data: `adm_prod_details_${p.id}`, style: p.stock_qty > 0 ? "success" : "danger" }]);
      buttons.push([{ text: "🔙 Admin Panel", callback_data: "admin_panel", style: "success" }]);
      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: `📋 <b>All Store Products:</b>\nClick any product to view details, change price, or delete:`, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
      return;
    }

    if (data.startsWith("adm_prod_details_")) {
      const prodId = data.replace("adm_prod_details_", "");
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      const stock = await env.DB.prepare("SELECT COUNT(*) as count FROM inventory WHERE product_id = ? AND is_sold = 0").bind(prodId).first();
      const liveStock = prod.is_external ? (prod.api_stock || 0) : (stock ? stock.count : 0);

      const text = `📦 <b>${prod.name}</b>\n\n• Selling Price: <b>$${prod.price_usd.toFixed(2)} USD (≈ ৳${prod.price_bdt} BDT)</b>\n` +
        (prod.is_external ? `• Provider Cost: <b>$${prod.cost_price_usd.toFixed(2)} USD</b>\n• Origin: <b>External Bot API</b>\n` : `• Origin: <b>Manual Store Stock</b>\n`) +
        `• Live Stock: <b>${liveStock} items</b>\n\n📝 <b>Description:</b>\n${prod.description}`;

      const buttons = [
        [{ text: "💰 Set Custom Price", callback_data: `adm_setprice_${prod.id}`, style: "success" }],
        prod.is_external ? [] : [{ text: "➕ Add Stock", callback_data: `adm_addstock_${prod.id}`, style: "success" }],
        [{ text: "🗑️ Delete Product", callback_data: `adm_del_prod_${prod.id}`, style: "danger" }],
        [{ text: "🔙 Back", callback_data: "adm_manage_products", style: "success" }]
      ].filter(r => r.length > 0);
      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
      return;
    }

    if (data.startsWith("adm_del_prod_")) {
      await env.DB.prepare("UPDATE products SET is_active = 0 WHERE id = ?").bind(data.replace("adm_del_prod_", "")).run();
      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: `✅ Product removed from store!`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "🔙 Products List", callback_data: "adm_manage_products", style: "success" }]] } });
      return;
    }

    // Admin: View Pre-Orders
    if (data === "adm_view_preorders") {
      const { results: preorders } = await env.DB.prepare("SELECT po.*, p.name as product_name FROM preorders po JOIN products p ON po.product_id = p.id WHERE po.status = 'pending' ORDER BY po.id DESC LIMIT 10").all();
      let poText = `⏳ <b>Pending Pre-Orders:</b>\n\n`;
      if (!preorders || preorders.length === 0) poText += `There are no pending pre-orders.`;
      else preorders.forEach(po => { poText += `🔹 #${po.id} — <b>${po.product_name}</b>\nUser: ${po.username} (ID: <code>${po.user_id}</code>)\nDate: ${po.created_at}\n\n`; });
      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: poText, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "🔙 Admin Panel", callback_data: "admin_panel", style: "success" }]] } });
      return;
    }

    // Admin Rates & Support Settings
    if (data === "adm_set_rate") {
      const currentRate = await getSetting(env, "usd_to_bdt_rate", "125");
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_rate', '')").bind(chatId).run();
      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: `💱 <b>Set USD to BDT Rate:</b>\nCurrent: <b>1 USD = ${currentRate} BDT</b>\n\nEnter new exchange rate in BDT (e.g. <code>122</code>):`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_panel", style: "danger" }]] } });
      return;
    }

    if (data === "adm_set_ref_comm") {
      const currentPct = await getSetting(env, "referral_commission_percent", "5");
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_ref_comm', '')").bind(chatId).run();
      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: `🎁 <b>Set Referral Commission:</b>\nCurrent: <b>${currentPct}%</b> on purchases.\n\nEnter new percentage (e.g. <code>10</code>):`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_panel", style: "danger" }]] } });
      return;
    }

    if (data === "adm_set_support") {
      const currentSup = await getSetting(env, "support_admin", "@fojlaybd");
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_support_contact', '')").bind(chatId).run();
      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: `📞 <b>Set Support Contact:</b>\nCurrent: <b>${currentSup}</b>\n\nEnter Admin Telegram Username (e.g. <code>@fojlaybd</code>) or Chat ID:`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_panel", style: "danger" }]] } });
      return;
    }

    // Admin: Mandatory Force Join Settings Menu
    if (data === "adm_force_menu") {
      const channel = await getSetting(env, "force_channel_username", "");
      const group = await getSetting(env, "force_group_username", "");
      const isActive = (channel || group);
      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `🔒 <b>Mandatory Channel & Group Membership (Force Join):</b>\n\nStatus: ${isActive ? "🟢 <b>ACTIVE (Mandatory Join Enabled)</b>" : "⚪ <b>DISABLED (Open Access)</b>"}\n\n• <b>Announcement Channel:</b> ${channel ? `<code>${channel}</code>` : "<i>Not Set</i>"}\n• <b>Community Chat Group:</b> ${group ? `<code>${group}</code>` : "<i>Not Set</i>"}\n\n<blockquote>💡 Make sure your bot is an Administrator in both the channel and group so it can verify members!</blockquote>`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📢 Set Channel Username / Link", callback_data: "adm_set_force_channel", style: "success" }],
            [{ text: "💬 Set Group Username / Link", callback_data: "adm_set_force_group", style: "success" }],
            isActive ? [{ text: "❌ Disable Force Join", callback_data: "adm_disable_force", style: "danger" }] : [],
            [{ text: "🔙 Admin Panel", callback_data: "admin_panel", style: "success" }]
          ].filter(r => r.length > 0)
        }
      });
      return;
    }

    if (data === "adm_set_force_channel") {
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_force_channel', '')").bind(chatId).run();
      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: `📢 <b>Set Announcement Channel:</b>\n\nEnter the username (e.g. <code>@MyStoreChannel</code>) or link:\n<i>(Make sure the bot is an Admin in this channel!)</i>`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "adm_force_menu", style: "danger" }]] } });
      return;
    }

    if (data === "adm_set_force_group") {
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_force_group', '')").bind(chatId).run();
      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: `💬 <b>Set Community Chat Group:</b>\n\nEnter the username (e.g. <code>@MyStoreGroup</code>) or link:\n<i>(Make sure the bot is an Admin in this group!)</i>`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "adm_force_menu", style: "danger" }]] } });
      return;
    }

    if (data === "adm_disable_force") {
      await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('force_channel_username', '')").run();
      await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('force_group_username', '')").run();
      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: `✅ <b>Force Join Disabled!</b>\nUsers can now use the bot freely.`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "🔙 Force Join Menu", callback_data: "adm_force_menu", style: "success" }], [{ text: "👑 Admin Panel", callback_data: "admin_panel", style: "success" }]] } });
      return;
    }

    // Admin: VEXORIX Reseller API Management
    if (data === "adm_api_menu") {
      const apiUrl = await getSetting(env, "external_api_url", "https://207-148-64-141.sslip.io");
      const apiKey = await getSetting(env, "external_api_key", "");
      const margin = await getSetting(env, "external_profit_margin", "20");
      const autoOrder = await getSetting(env, "auto_order_enabled", "1") === "1";
      const apiProds = await env.DB.prepare("SELECT COUNT(*) as c FROM products WHERE is_external = 1 AND is_active = 1").first();
      const count = apiProds ? apiProds.c : 0;

      let balanceText = "⚠️ Not Connected";
      let statusText = "⚠️ Missing Key";
      if (apiKey) {
        const acc = await checkResellerAccount(env);
        if (acc && acc.wallet) { statusText = "✅ Connected & Verified"; balanceText = `$${Number(acc.wallet.balance || 0).toFixed(2)} ${acc.wallet.currency || "USDT"}`; }
        else { statusText = "⚠️ Connected (Tap Sync to Test)"; balanceText = "Ready"; }
      }

      const apiText = `🔌 <b>VEXORIX Reseller API Center</b>\n━━━━━━━━━━━━━━━━━━━━\n• <b>API Status:</b> ${statusText}\n• <b>Wallet:</b> <b>${balanceText}</b>\n• <b>Base URL:</b> <code>${apiUrl}</code>\n• <b>API Key:</b> <code>${apiKey ? apiKey.slice(0, 10) + "••••••••" : "Not Set"}</code>\n• <b>Profit Margin:</b> <b>${margin}%</b>\n• <b>Auto-Order:</b> <b>${autoOrder ? "✅ Enabled" : "⏸️ Disabled"}</b>\n• <b>Imported API Products:</b> <b>${count} products active</b>`;
      const buttons = [
        [{ text: "🔄 Sync Products Now", callback_data: "adm_sync_api", style: "success" }],
        [{ text: "🔑 Set API Key", callback_data: "adm_set_api_key", style: "success" }, { text: "🔗 Set Base URL", callback_data: "adm_set_api_url", style: "success" }],
        [{ text: `📈 Profit Margin (${margin}%)`, callback_data: "adm_set_api_margin", style: "success" }, { text: `🤖 Auto-Order: ${autoOrder ? "ON" : "OFF"}`, callback_data: "adm_toggle_auto_order", style: "success" }],
        [{ text: "💰 Set Custom Prices", callback_data: "adm_price_menu", style: "success" }],
        [{ text: "🧪 Test Demo API", callback_data: "adm_setup_demo_api", style: "success" }],
        [{ text: "🔙 Admin Panel", callback_data: "admin_panel", style: "success" }]
      ];
      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: apiText, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
      return;
    }

    if (data === "adm_toggle_auto_order") {
      const cur = await getSetting(env, "auto_order_enabled", "1");
      const next = cur === "1" ? "0" : "1";
      await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('auto_order_enabled', ?)").bind(next).run();
      await sendTelegram(env, "answerCallbackQuery", { callback_query_id: cb.id, text: `Auto-order ${next === "1" ? "Enabled" : "Disabled"}` });
      await sendAdminDashboard(env, chatId, messageId);
      return;
    }

    if (data === "adm_setup_demo_api") {
      await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('external_api_url', ?)").bind(`${originUrl}/api/mock-provider`).run();
      await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('external_api_key', 'vxr_live_demo_key_12345')").run();
      const syncResult = await syncExternalProducts(env, `${originUrl}/api/mock-provider`, "vxr_live_demo_key_12345");
      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `🧪 <b>Demo API Connected & Products Synced!</b>\n\n${syncResult.message}`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "🛒 Open Shop to Test", callback_data: "shop", style: "success" }], [{ text: "👑 Admin Panel", callback_data: "admin_panel", style: "success" }]] }
      });
      return;
    }

    if (data === "adm_sync_api") {
      await sendTelegram(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "⏳ Connecting to Provider API and fetching products..." });
      const syncResult = await syncExternalProducts(env);
      await sendTelegram(env, "sendMessage", {
        chat_id: chatId,
        text: syncResult.success ? `🎉 <b>API Sync Successful!</b>\n\n${syncResult.message}` : `❌ <b>API Sync Failed</b>\n\n${syncResult.message}`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "💰 Set Custom Prices", callback_data: "adm_price_menu", style: "success" }], [{ text: "👑 Admin Panel", callback_data: "admin_panel", style: "success" }]] }
      });
      return;
    }

    if (data === "adm_set_api_url" || data === "adm_set_api_key" || data === "adm_set_api_margin") {
      let stateName = "awaiting_api_url";
      let prompt = "Please enter the External API Base URL (e.g. <code>https://207-148-64-141.sslip.io</code>):";
      if (data === "adm_set_api_key") { stateName = "awaiting_api_key"; prompt = "Please enter your External API Key (e.g. <code>vxr_live_...</code>):"; }
      else if (data === "adm_set_api_margin") { stateName = "awaiting_api_margin"; prompt = "Please enter default profit margin % for synced products (e.g. <code>25</code>):"; }
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, ?, '')").bind(chatId, stateName).run();
      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: `⚙️ <b>${prompt}</b>`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "adm_api_menu", style: "danger" }]] } });
      return;
    }

    // Payment Numbers Setting Menu
    if (data === "adm_payment_settings") {
      const bkash = await getSetting(env, "bkash_num", "017XXXXXXXX");
      const nagad = await getSetting(env, "nagad_num", "017XXXXXXXX");
      const rocket = await getSetting(env, "rocket_num", "017XXXXXXXX");
      const binance = await getSetting(env, "binance_id", "6029752069");
      const bep20 = await getSetting(env, "bep20_addr", "0x71C...YourAddress");
      const txt = `⚙️ <b>Payment Accounts & Numbers:</b>\n\n• bKash: <code>${bkash}</code>\n• Nagad: <code>${nagad}</code>\n• Rocket: <code>${rocket}</code>\n• Binance Pay: <code>${binance}</code>\n• BEP20 USDT: <code>${bep20}</code>`;
      const buttons = [
        [{ text: "✏️ Change bKash", callback_data: "adm_set_bkash", style: "success" }, { text: "✏️ Change Nagad", callback_data: "adm_set_nagad", style: "success" }],
        [{ text: "✏️ Change Rocket", callback_data: "adm_set_rocket", style: "success" }, { text: "✏️ Change Binance", callback_data: "adm_set_binance", style: "success" }],
        [{ text: "✏️ Change BEP20 Address", callback_data: "adm_set_bep20", style: "success" }],
        [{ text: "🔙 Admin Panel", callback_data: "admin_panel", style: "success" }]
      ];
      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: txt, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
      return;
    }

    if (data.startsWith("adm_set_") && !data.startsWith("adm_set_rate") && !data.startsWith("adm_set_ref") && !data.startsWith("adm_set_support") && !data.startsWith("adm_set_api") && !data.startsWith("adm_set_force")) {
      const field = data.replace("adm_set_", "");
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, ?, '')").bind(chatId, `awaiting_setting_${field}`).run();
      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: `✏️ <b>Enter new ${field.toUpperCase()} number/address:</b>`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "adm_payment_settings", style: "danger" }]] } });
      return;
    }

    // Broadcast Message
    if (data === "adm_broadcast") {
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_broadcast', '')").bind(chatId).run();
      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: `📢 <b>Broadcast Announcement:</b>\n\nType your message below. It will be sent to all store users!`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_panel", style: "danger" }]] } });
      return;
    }

    // Order Approval / Rejection
    if (data.startsWith("admin_approve_")) {
      const orderId = data.replace("admin_approve_", "");
      const order = await env.DB.prepare("SELECT o.*, p.name as product_name, p.is_external, p.external_id FROM orders o JOIN products p ON o.product_id = p.id WHERE o.id = ?").bind(orderId).first();
      if (order && order.status === "pending") {
        const orderQty = order.quantity || 1;
        if (order.is_external === 1) {
          await env.DB.prepare("UPDATE orders SET status = 'completed' WHERE id = ?").bind(orderId).run();
          const apiRes = await dispatchExternalOrder(env, order, orderQty, orderId);
          const creds = apiRes.success ? apiRes.credentials : "Order registered with external provider. Details arriving shortly.";
          await sendTelegram(env, "sendMessage", { chat_id: order.user_id, text: `🎉 <b>Payment Approved! Your Order is Delivered</b>\n\nOrder: #${orderId}\nProduct: <b>${order.product_name}</b>\nQuantity: <b>${orderQty}</b>\n\n🔑 <b>Credentials:</b>\n<blockquote><code>${creds}</code></blockquote>`, parse_mode: "HTML" });
          await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: `✅ <b>Order #${orderId} approved and delivered via Provider API!</b>`, parse_mode: "HTML" });
          await processReferralCommission(env, order.user_id, order.amount_usd, order.product_name);
          return;
        }

        const { results: items } = await env.DB.prepare("SELECT * FROM inventory WHERE product_id = ? AND is_sold = 0 LIMIT ?").bind(order.product_id, orderQty).all();
        if (items && items.length >= orderQty) {
          await env.DB.prepare("UPDATE orders SET status = 'completed' WHERE id = ?").bind(orderId).run();
          const lines = [];
          for (const it of items) { await env.DB.prepare("UPDATE inventory SET is_sold = 1, order_id = ? WHERE id = ?").bind(orderId, it.id).run(); lines.push(it.item_data); }
          await sendTelegram(env, "sendMessage", { chat_id: order.user_id, text: `🎉 <b>Payment Approved! Your Order is Delivered</b>\n\nOrder: #${orderId}\nProduct: <b>${order.product_name}</b>\nQuantity: <b>${orderQty}</b>\n\n🔑 <b>Credentials:</b>\n<blockquote><code>${lines.join("\n\n")}</code></blockquote>`, parse_mode: "HTML" });
          await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: `✅ <b>Order #${orderId} approved and delivered!</b>`, parse_mode: "HTML" });
          await processReferralCommission(env, order.user_id, order.amount_usd, order.product_name);
        } else {
          await sendTelegram(env, "sendMessage", { chat_id: chatId, text: `⚠️ <b>Unable to deliver Order #${orderId}: Insufficient local stock!</b> Please restock first.` });
        }
      }
      return;
    }

    if (data.startsWith("admin_reject_")) {
      const orderId = data.replace("admin_reject_", "");
      await env.DB.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").bind(orderId).run();
      const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first();
      if (order) await sendTelegram(env, "sendMessage", { chat_id: order.user_id, text: `❌ <b>Order #${orderId} cancelled:</b> Payment details could not be verified.` });
      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: `❌ Order #${orderId} rejected.` });
      return;
    }

    if (data.startsWith("adm_apprdep_")) {
      const depId = data.replace("adm_apprdep_", "");
      const dep = await env.DB.prepare("SELECT * FROM deposits WHERE id = ?").bind(depId).first();
      if (dep && dep.status === "pending") {
        await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_deposit_amount', ?)").bind(chatId, depId).run();
        await sendTelegram(env, "sendMessage", { chat_id: chatId, text: `💰 <b>Approve Deposit #${depId}</b>\nCustomer: ${dep.username} (ID: <code>${dep.user_id}</code>)\nMethod: ${dep.method}\nTrxID: <code>${dep.trx_id}</code>\n\nEnter amount in <b>USD</b> to credit (e.g. <code>10.00</code>):`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_panel", style: "danger" }]] } });
      }
      return;
    }

    if (data.startsWith("adm_rejdep_")) {
      const depId = data.replace("adm_rejdep_", "");
      await env.DB.prepare("UPDATE deposits SET status = 'rejected' WHERE id = ?").bind(depId).run();
      const dep = await env.DB.prepare("SELECT * FROM deposits WHERE id = ?").bind(depId).first();
      if (dep) await sendTelegram(env, "sendMessage", { chat_id: dep.user_id, text: `❌ Deposit #${depId} could not be verified.` });
      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: `❌ Deposit #${depId} rejected.` });
      return;
    }
  }
}

// ====================================================================
// Admin Interactive State Processor
// ====================================================================
async function handleAdminTextState(env, chatId, text, adminState) {
  const state = adminState.state;

  // 1. Adding Stock (Supports multiple lines)
  if (state === "awaiting_stock") {
    const prodId = adminState.data;
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    for (const line of lines) {
      await env.DB.prepare("INSERT INTO inventory (product_id, item_data) VALUES (?, ?)").bind(prodId, line).run();
    }
    await clearAdminState(env, chatId);
    const prod = await env.DB.prepare("SELECT name FROM products WHERE id = ?").bind(prodId).first();
    const count = await env.DB.prepare("SELECT COUNT(*) as c FROM inventory WHERE product_id = ? AND is_sold = 0").bind(prodId).first();

    await notifyPreorders(env, prodId, prod ? prod.name : "Product", lines.length);

    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `✅ <b>Added ${lines.length} Stock Item(s) Successfully!</b>\n\nProduct: <b>${prod ? prod.name : "Product"}</b>\nCurrent In-Stock: <b>${count ? count.c : lines.length} items</b>`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "➕ Add More Stock", callback_data: `adm_addstock_${prodId}`, style: "success" }],
          [{ text: "👑 Admin Panel", callback_data: "admin_panel", style: "success" }]
        ]
      }
    });
    return true;
  }

  // 2. Custom Price / % Margin Setting
  if (state === "awaiting_new_price") {
    const prodId = adminState.data;
    const prod = await env.DB.prepare("SELECT name, is_external, cost_price_usd, price_usd FROM products WHERE id = ?").bind(prodId).first();
    const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
    const baseCost = (prod && prod.is_external && prod.cost_price_usd > 0) ? prod.cost_price_usd : (prod ? prod.price_usd : 1.0);

    let newUsd = 0;
    let profitInfo = "";

    if (text.includes("%")) {
      const marginPct = parseFloat(text.replace("%", "").trim()) || 20;
      newUsd = Number((baseCost * (1 + marginPct / 100)).toFixed(2));
      const profitUsd = (newUsd - baseCost).toFixed(2);
      profitInfo = `\n• Margin Markup: <b>+${marginPct}%</b>\n• Provider Cost: <b>$${baseCost.toFixed(2)} USD</b>\n• Net Profit: <b>+$${profitUsd} USD</b> per sale!`;
    } else {
      newUsd = parseFloat(text.replace("$", "").trim()) || 5.00;
      if (prod && prod.cost_price_usd > 0) {
        const diff = (newUsd - prod.cost_price_usd).toFixed(2);
        profitInfo = `\n• Provider Cost: <b>$${prod.cost_price_usd.toFixed(2)} USD</b>\n• Net Profit: <b>+$${diff} USD</b> per sale!`;
      }
    }

    const newBdt = Math.round(newUsd * rate);
    await env.DB.prepare("UPDATE products SET price_usd = ?, price_bdt = ?, custom_price_usd = ? WHERE id = ?").bind(newUsd, newBdt, newUsd, prodId).run();
    await clearAdminState(env, chatId);

    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `✅ <b>Custom Price Saved Successfully!</b>\n\nProduct: <b>${prod ? prod.name : "Product"}</b>\nNew Selling Price: <b>$${newUsd.toFixed(2)} USD</b> (≈ ৳${newBdt} BDT)${profitInfo}`,
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

  // 3. Adding Product Steps (Icon -> Name -> Desc -> Price)
  if (state === "awaiting_prod_name") {
    let data = {};
    try { data = JSON.parse(adminState.data || "{}"); } catch (_) {}
    const iconPrefix = data.icon ? `${data.icon} ` : "";
    data.name = `${iconPrefix}${text.trim()}`;
    await env.DB.prepare("UPDATE admin_states SET state = 'awaiting_prod_desc', data = ? WHERE user_id = ?").bind(JSON.stringify(data), chatId).run();
    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `📝 <b>Add Product — Step 3/4: Description</b>\n\nProduct Name: <b>${data.name}</b>\n\nPlease enter description or instructions:`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_panel", style: "danger" }]] }
    });
    return true;
  }

  if (state === "awaiting_prod_desc") {
    const data = JSON.parse(adminState.data || "{}");
    data.description = text;
    await env.DB.prepare("UPDATE admin_states SET state = 'awaiting_prod_price', data = ? WHERE user_id = ?").bind(JSON.stringify(data), chatId).run();
    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `💰 <b>Add Product — Step 4/4: Price</b>\n\nEnter selling price in <b>USD</b> (e.g. <code>45.50</code>):`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_panel", style: "danger" }]] }
    });
    return true;
  }

  if (state === "awaiting_prod_price") {
    const data = JSON.parse(adminState.data || "{}");
    const usd = parseFloat(text.replace("$", "").trim()) || 5.00;
    const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
    const bdt = Math.round(usd * rate);
    const res = await env.DB.prepare("INSERT INTO products (name, description, price_usd, price_bdt, is_active) VALUES (?, ?, ?, ?, 1)").bind(data.name, data.description || "Digital Product", usd, bdt).run();
    const newProdId = res.meta ? res.meta.last_row_id : null;
    await clearAdminState(env, chatId);
    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `🎉 <b>New Product Successfully Created!</b>\n\n• Name: <b>${data.name}</b>\n• Price: <b>$${usd.toFixed(2)} USD (≈ ৳${bdt} BDT)</b>`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          newProdId ? [{ text: "➕ Add Stock Now", callback_data: `adm_addstock_${newProdId}`, style: "success" }] : [],
          [{ text: "👑 Admin Panel", callback_data: "admin_panel", style: "success" }]
        ].filter(r => r.length > 0)
      }
    });
    return true;
  }

  // 4. Rate, Commission & Support Setting Handlers
  if (state === "awaiting_rate") {
    const newRate = parseFloat(text.trim()) || 125;
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('usd_to_bdt_rate', ?)").bind(String(newRate)).run();
    await env.DB.prepare("UPDATE products SET price_bdt = ROUND(price_usd * ?)").bind(newRate).run();
    await clearAdminState(env, chatId);
    await sendTelegram(env, "sendMessage", { chat_id: chatId, text: `✅ <b>Exchange Rate Updated: 1 USD = ${newRate} BDT</b>`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "👑 Admin Panel", callback_data: "admin_panel", style: "success" }]] } });
    return true;
  }

  if (state === "awaiting_ref_comm") {
    const pct = parseFloat(text.replace("%", "").trim()) || 5;
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('referral_commission_percent', ?)").bind(String(pct)).run();
    await clearAdminState(env, chatId);
    await sendTelegram(env, "sendMessage", { chat_id: chatId, text: `✅ <b>Referral Commission Updated: ${pct}%</b>`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "👑 Admin Panel", callback_data: "admin_panel", style: "success" }]] } });
    return true;
  }

  if (state === "awaiting_support_contact") {
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('support_admin', ?)").bind(text.trim()).run();
    await clearAdminState(env, chatId);
    await sendTelegram(env, "sendMessage", { chat_id: chatId, text: `✅ <b>Support Contact Updated: ${text.trim()}</b>`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "👑 Admin Panel", callback_data: "admin_panel", style: "success" }]] } });
    return true;
  }

  // 5. Force Join Channel & Group Settings
  if (state === "awaiting_force_channel") {
    let channel = text.trim();
    if (channel.includes("t.me/")) channel = channel.split("t.me/")[1].replace(/^\+/, "").replace(/\/$/, "");
    if (!channel.startsWith("@") && !channel.startsWith("-")) channel = "@" + channel;
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('force_channel_username', ?)").bind(channel).run();
    await clearAdminState(env, chatId);
    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `✅ <b>Announcement Channel Saved:</b> <code>${channel}</code>\n\n<i>⚠️ Make sure to promote your bot to Administrator in this channel!</i>`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "🔒 Force Join Menu", callback_data: "adm_force_menu", style: "success" }], [{ text: "👑 Admin Panel", callback_data: "admin_panel", style: "success" }]] }
    });
    return true;
  }

  if (state === "awaiting_force_group") {
    let group = text.trim();
    if (group.includes("t.me/")) group = group.split("t.me/")[1].replace(/^\+/, "").replace(/\/$/, "");
    if (!group.startsWith("@") && !group.startsWith("-")) group = "@" + group;
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('force_group_username', ?)").bind(group).run();
    await clearAdminState(env, chatId);
    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `✅ <b>Community Group Saved:</b> <code>${group}</code>\n\n<i>⚠️ Make sure to promote your bot to Administrator in this group!</i>`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "🔒 Force Join Menu", callback_data: "adm_force_menu", style: "success" }], [{ text: "👑 Admin Panel", callback_data: "admin_panel", style: "success" }]] }
    });
    return true;
  }

  // 6. External API Settings
  if (state === "awaiting_api_url") {
    let cleanUrl = text.trim().replace(/\/+$/, "");
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('external_api_url', ?)").bind(cleanUrl).run();
    await clearAdminState(env, chatId);
    await sendTelegram(env, "sendMessage", { chat_id: chatId, text: `✅ <b>API Base URL Saved!</b>\n<code>${cleanUrl}</code>`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "🔄 Sync Products Now", callback_data: "adm_sync_api", style: "success" }], [{ text: "👑 Admin Panel", callback_data: "admin_panel", style: "success" }]] } });
    return true;
  }

  if (state === "awaiting_api_key") {
    const cleanKey = text.trim();
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('external_api_key', ?)").bind(cleanKey).run();
    await clearAdminState(env, chatId);
    const syncRes = await syncExternalProducts(env);
    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `🎉 <b>API Key Saved & Connected!</b>\n\n${syncRes.message}`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "💰 Set Custom Prices", callback_data: "adm_price_menu", style: "success" }], [{ text: "👑 Admin Panel", callback_data: "admin_panel", style: "success" }]] }
    });
    return true;
  }

  if (state === "awaiting_api_margin") {
    const margin = parseFloat(text.replace("%", "").trim()) || 20;
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('external_profit_margin', ?)").bind(String(margin)).run();
    await clearAdminState(env, chatId);
    await sendTelegram(env, "sendMessage", { chat_id: chatId, text: `✅ <b>Default Margin Saved: ${margin}%</b>`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "🔄 Re-Sync Now", callback_data: "adm_sync_api", style: "success" }], [{ text: "👑 Admin Panel", callback_data: "admin_panel", style: "success" }]] } });
    return true;
  }

  // 7. Deposit Approval Amount
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
      await sendTelegram(env, "sendMessage", { chat_id: chatId, text: `✅ <b>Deposit #${depId} Approved:</b> $${usdAmount.toFixed(2)} USD credited.`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "👑 Admin Panel", callback_data: "admin_panel", style: "success" }]] } });
    }
    return true;
  }

  // 8. Broadcast Message
  if (state === "awaiting_broadcast") {
    await clearAdminState(env, chatId);
    const { results: allUsers } = await env.DB.prepare("SELECT user_id FROM users").all();
    let sentCount = 0;
    for (const u of allUsers) {
      try {
        await sendTelegram(env, "sendMessage", { chat_id: u.user_id, text: `📢 <b>Store Announcement:</b>\n\n${text}`, parse_mode: "HTML" });
        sentCount++;
      } catch (_) {}
    }
    await sendTelegram(env, "sendMessage", { chat_id: chatId, text: `✅ <b>Broadcast Completed!</b> Delivered to ${sentCount} members.`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "👑 Admin Panel", callback_data: "admin_panel", style: "success" }]] } });
    return true;
  }

  // 9. Payment Numbers Update
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
// VEXORIX Reseller API & External Provider Engine
// ====================================================================
async function checkResellerAccount(env) {
  try {
    let baseUrl = (await getSetting(env, "external_api_url", "https://207-148-64-141.sslip.io")).trim().replace(/\/+$/, "");
    if (baseUrl.includes("/api/reseller")) baseUrl = baseUrl.split("/api/reseller")[0];
    const apiKey = await getSetting(env, "external_api_key", "");
    if (!apiKey) return null;
    const res = await fetch(`${baseUrl}/api/reseller/me`, { method: "GET", headers: { "X-Reseller-Key": apiKey, "Accept": "application/json", "User-Agent": "TelegramStoreBot/2.0" } });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) { return null; }
}

function smartProductIcon(name) {
  if (!name) return "⚡ Product";
  const str = String(name).trim();
  if (/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(str)) return str;
  const low = str.toLowerCase();
  if (low.includes("prime") || low.includes("amazon") || low.includes("netflix") || low.includes("disney") || low.includes("hulu") || low.includes("ott")) return `🍿 ${str}`;
  if (low.includes("spotify") || low.includes("music") || low.includes("tidal") || low.includes("deezer")) return `🎵 ${str}`;
  if (low.includes("chatgpt") || low.includes("openai") || low.includes("claude") || low.includes("gemini") || low.includes("ai") || low.includes("lovable") || low.includes("cursor")) return `🤖 ${str}`;
  if (low.includes("vpn") || low.includes("nord") || low.includes("express") || low.includes("surfshark") || low.includes("proxy")) return `🛡️ ${str}`;
  if (low.includes("canva") || low.includes("adobe") || low.includes("figma") || low.includes("design") || low.includes("photoshop")) return `🎨 ${str}`;
  if (low.includes("youtube") || low.includes("yt") || low.includes("video")) return `📺 ${str}`;
  if (low.includes("telegram") || low.includes("tg") || low.includes("member") || low.includes("boost")) return `📱 ${str}`;
  if (low.includes("windows") || low.includes("office") || low.includes("key") || low.includes("license")) return `🔑 ${str}`;
  if (low.includes("course") || low.includes("udemy") || low.includes("coursera") || low.includes("edu")) return `🎓 ${str}`;
  if (low.includes("gift") || low.includes("card") || low.includes("voucher")) return `🎁 ${str}`;
  return `⚡ ${str}`;
}

async function syncExternalProducts(env, apiUrl, apiKey) {
  try {
    let baseUrl = (apiUrl || await getSetting(env, "external_api_url", "https://207-148-64-141.sslip.io")).trim().replace(/\/+$/, "");
    if (baseUrl.includes("/api/reseller")) baseUrl = baseUrl.split("/api/reseller")[0];
    const key = apiKey || await getSetting(env, "external_api_key", "");
    if (!key) return { success: false, message: "Please set your VEXORIX API Key first." };

    let items = [];
    let isVexorix = false;

    // 1. Try VEXORIX Reseller API
    try {
      const vResp = await fetch(`${baseUrl}/api/reseller/products`, { method: "GET", headers: { "X-Reseller-Key": key, "Accept": "application/json", "User-Agent": "TelegramStoreBot/2.0" } });
      if (vResp.ok) {
        const vData = await vResp.json();
        if (vData && Array.isArray(vData.products)) {
          isVexorix = true;
          items = vData.products.map(p => ({
            id: p.id,
            name: p.name,
            desc: p.description ? (p.description + (p.how_to_use ? `\n\n📖 <b>Instructions:</b>\n${p.how_to_use}` : "")) : (p.how_to_use || "Digital License"),
            rate: p.price,
            stock: p.available ? (p.stock || 50) : 0
          }));
        }
      }
    } catch (_) {}

    // 2. Generic / SMM fallback
    if (!isVexorix) {
      try {
        const resp = await fetch(baseUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, action: "services" }) });
        if (resp.ok) {
          const d = await resp.json();
          items = Array.isArray(d) ? d : (d.services || d.products || d.data || []);
        }
      } catch (_) {}
    }

    if (!items || items.length === 0) return { success: false, message: `Could not fetch products. Check API key and Base URL (${baseUrl}).` };

    const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
    const margin = parseFloat(await getSetting(env, "external_profit_margin", "20"));

    let importedCount = 0;
    for (const item of items) {
      const extId = String(item.id || item.service || item.product_id || "");
      if (!extId) continue;

      const rawName = item.name || item.title || item.product_name || "External Product";
      const name = smartProductIcon(rawName);
      const desc = item.desc || item.description || `Automated digital product delivered via API. (ID: ${extId})`;
      const baseCostPrice = parseFloat(item.rate || item.price || item.cost || 1.0);
      const apiStock = parseInt(item.stock || item.remains || (item.available ? 50 : 0)) || 0;

      const existing = await env.DB.prepare("SELECT id, custom_price_usd FROM products WHERE external_id = ?").bind(extId).first();
      let finalSellingPrice = (existing && existing.custom_price_usd && existing.custom_price_usd > 0)
        ? existing.custom_price_usd
        : Number((baseCostPrice * (1 + margin / 100)).toFixed(2));
      const priceBdt = Math.round(finalSellingPrice * rate);

      let targetProdId = null;
      if (existing) {
        targetProdId = existing.id;
        await env.DB.prepare("UPDATE products SET name = ?, description = ?, cost_price_usd = ?, price_usd = ?, price_bdt = ?, api_stock = ?, is_active = 1 WHERE id = ?").bind(name, desc, baseCostPrice, finalSellingPrice, priceBdt, apiStock, existing.id).run();
      } else {
        const ins = await env.DB.prepare("INSERT INTO products (name, description, price_usd, price_bdt, cost_price_usd, custom_price_usd, api_stock, is_active, is_external, external_id) VALUES (?, ?, ?, ?, ?, 0, ?, 1, 1, ?)").bind(name, desc, finalSellingPrice, priceBdt, baseCostPrice, apiStock, extId).run();
        targetProdId = ins.meta ? ins.meta.last_row_id : null;
      }

      if (apiStock > 0 && targetProdId) {
        await notifyPreorders(env, targetProdId, name, apiStock);
      }
      importedCount++;
    }

    return { success: true, message: `Successfully connected! Imported & updated <b>${importedCount} products</b> with live stock and pricing.` };
  } catch (err) {
    return { success: false, message: `Error connecting to API: ${err.message}` };
  }
}

async function dispatchExternalOrder(env, prod, quantity, orderId) {
  try {
    let baseUrl = (await getSetting(env, "external_api_url", "https://207-148-64-141.sslip.io")).trim().replace(/\/+$/, "");
    if (baseUrl.includes("/api/reseller")) baseUrl = baseUrl.split("/api/reseller")[0];
    const apiKey = await getSetting(env, "external_api_key", "");
    if (!apiKey) return { success: false, message: "External API Key is not set." };

    const vexorixOrderUrl = `${baseUrl}/api/reseller/orders`;
    const vResp = await fetch(vexorixOrderUrl, {
      method: "POST",
      headers: { "X-Reseller-Key": apiKey, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ product_id: String(prod.external_id), quantity, external_order_id: `shop-${orderId}-${Date.now().toString(36)}` })
    });

    if (vResp.ok || vResp.status === 201 || vResp.status === 200) {
      const resData = await vResp.json();
      const items = resData.items || [];
      const credentials = items.map(it => it.content).join("\n\n");
      return { success: true, externalOrderId: String(resData.order_id || ""), credentials: credentials || (resData.order_id ? `Order Delivered: #${resData.order_id}` : "Delivered"), message: "Order placed & delivered instantly via VEXORIX API." };
    }
    return { success: false, message: `API responded with HTTP status ${vResp.status}` };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ====================================================================
// Helper Engines: Referrals, Pre-orders & Force Join
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

    await env.DB.prepare("UPDATE users SET balance_usd = balance_usd + ?, balance_bdt = balance_bdt + ? WHERE user_id = ?").bind(commissionUsd, commissionBdt, referrerId).run();
    await sendTelegram(env, "sendMessage", {
      chat_id: referrerId,
      text: `🎉 <b>Referral Commission Received!</b>\n\nYour referred friend completed a purchase of <b>${productName}</b>!\n💰 Added: <b>+$${commissionUsd.toFixed(2)} USD (≈ ৳${commissionBdt} BDT)</b> (${commPct}% commission) to your wallet balance.`,
      parse_mode: "HTML"
    }).catch(() => {});
  } catch (err) {
    console.error("Referral Commission Error:", err);
  }
}

async function notifyPreorders(env, productId, productName, stockCount) {
  try {
    const { results: pendingPreorders } = await env.DB.prepare("SELECT * FROM preorders WHERE product_id = ? AND status = 'pending'").bind(productId).all();
    if (pendingPreorders && pendingPreorders.length > 0) {
      for (const po of pendingPreorders) {
        await sendTelegram(env, "sendMessage", {
          chat_id: po.user_id,
          text: `🔔 <b>Good News! Pre-Ordered Product Restocked!</b>\n\n` +
            `The item you pre-ordered is now back in stock in our store!\n` +
            `📦 Product: <b>${productName}</b>\n` +
            `⚡ Available Stock: <b>${stockCount} items</b>\n\n` +
            `Tap the button below to complete your order now before it runs out:`,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: `🛍️ Buy ${productName} Now`, callback_data: `prod_${productId}`, style: "success" }],
              [{ text: "🛒 Open Shop", callback_data: "shop", style: "success" }]
            ]
          }
        }).catch(() => {});
      }
      await env.DB.prepare("UPDATE preorders SET status = 'notified' WHERE product_id = ? AND status = 'pending'").bind(productId).run();
    }
  } catch (err) {
    console.error("notifyPreorders Error:", err);
  }
}

async function checkForceJoin(env, chatId) {
  if (String(chatId) === String(env.ADMIN_ID)) return { passed: true };
  const channel = await getSetting(env, "force_channel_username", "");
  const group = await getSetting(env, "force_group_username", "");
  if (!channel && !group) return { passed: true };

  const validStatuses = ["creator", "administrator", "member", "restricted"];
  let missingChannel = false;
  let missingGroup = false;

  if (channel) {
    const target = channel.startsWith("-") || channel.startsWith("@") ? channel : `@${channel}`;
    try {
      const resp = await callTelegram(env, "getChatMember", { chat_id: target, user_id: chatId });
      if (!resp.ok || !resp.result || !validStatuses.includes(resp.result.status)) missingChannel = true;
    } catch (_) { missingChannel = true; }
  }

  if (group) {
    const target = group.startsWith("-") || group.startsWith("@") ? group : `@${group}`;
    try {
      const resp = await callTelegram(env, "getChatMember", { chat_id: target, user_id: chatId });
      if (!resp.ok || !resp.result || !validStatuses.includes(resp.result.status)) missingGroup = true;
    } catch (_) { missingGroup = true; }
  }

  if (missingChannel || missingGroup) return { passed: false, channel, group, missingChannel, missingGroup };
  return { passed: true };
}

async function sendForceJoinScreen(env, chatId, forceInfo, editMessageId = null) {
  const channelLink = forceInfo.channel ? (forceInfo.channel.startsWith("http") ? forceInfo.channel : `https://t.me/${forceInfo.channel.replace("@", "")}`) : "";
  const groupLink = forceInfo.group ? (forceInfo.group.startsWith("http") ? forceInfo.group : `https://t.me/${forceInfo.group.replace("@", "")}`) : "";

  const text = `🔒 <b>Must Join Channels to Use This Bot!</b>\n\n` +
    `Welcome! To browse products, check prices, and place orders, please join our official Telegram community:\n\n` +
    `📢 <b>1. Announcement Channel:</b> Latest stock updates & discounts\n` +
    `💬 <b>2. Discussion Group:</b> Customer reviews & instant chat\n\n` +
    `👇 <b>Click both links below to join, then click 'Verify & Enter':</b>`;

  const buttons = [];
  if (channelLink) buttons.push([{ text: "📢 Join Announcement Channel", url: channelLink }]);
  if (groupLink) buttons.push([{ text: "💬 Join Community Group", url: groupLink }]);
  buttons.push([{ text: "🔄 Verify & Enter Store", callback_data: "check_force_join", style: "success" }]);

  const payload = { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

async function callTelegram(env, method, payload) {
  if (!env.BOT_TOKEN) return { ok: false };
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    return await res.json();
  } catch (err) { return { ok: false, error: err.message }; }
}

async function sendTelegram(env, method, payload) {
  if (!env.BOT_TOKEN) return;
  return await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}

async function clearAdminState(env, userId) {
  await env.DB.prepare("DELETE FROM admin_states WHERE user_id = ?").bind(userId).run();
}

async function getSetting(env, key, defaultVal) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first();
  return (row && row.value) ? row.value : defaultVal;
}

// ====================================================================
// User Interface Views (100% Balanced & Clean)
// ====================================================================
async function sendHomeDashboard(env, chatId, user, firstName, editMessageId = null) {
  const usdBal = user ? (user.balance_usd || 0).toFixed(2) : "0.00";
  const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
  const bdtBal = user ? Math.round((user.balance_usd || 0) * rate) : 0;

  const welcome = `🛒 <b>Welcome to SMART SUBS STORE!</b>\n\n` +
    `Hello ${firstName}! 👋\n\n` +
    `We offer high-quality digital products and software licenses with fast, secure, and automated delivery.\n\n` +
    `<blockquote>🛒 <b>Shop</b> — Browse & buy products\n` +
    `💰 <b>Deposit</b> — Add funds to your wallet\n` +
    `👤 <b>Profile</b> — View wallet balance & orders</blockquote>\n\n` +
    `💰 <b>Wallet Balance:</b> $${usdBal} USD (≈ ৳${bdtBal} BDT)\n\n` +
    `Select an option below to continue:`;

  const keyboard = [
    [{ text: "🛒 Shop", callback_data: "shop", style: "success" }],
    [{ text: "👤 Profile", callback_data: "profile", style: "success" }, { text: "💰 Deposit", callback_data: "deposit", style: "success" }],
    [{ text: "📦 Orders", callback_data: "my_orders", style: "success" }, { text: "⏳ Pre-Orders", callback_data: "my_preorders", style: "success" }],
    [{ text: "👥 Refer & Earn", callback_data: "refer", style: "success" }]
  ];
  if (String(chatId) === String(env.ADMIN_ID)) {
    keyboard.push([{ text: "👑 Admin Panel", callback_data: "admin_panel", style: "success" }]);
  }

  const payload = { chat_id: chatId, text: welcome, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: { inline_keyboard: keyboard } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

async function sendProductsDirectly(env, chatId, editMessageId = null) {
  const { results: prods } = await env.DB.prepare(
    `SELECT p.*, CASE WHEN p.is_external = 1 THEN COALESCE(p.api_stock, 0) ELSE (SELECT COUNT(*) FROM inventory i WHERE i.product_id = p.id AND i.is_sold = 0) END as stock_qty FROM products p WHERE p.is_active = 1`
  ).all();

  const keyboard = [];
  if (prods && prods.length > 0) {
    prods.forEach(prod => {
      const stock = prod.stock_qty || 0;
      const inStock = stock > 0;
      const label = `${prod.name} (${stock})`;
      keyboard.push([{ text: label, callback_data: `prod_${prod.id}`, style: inStock ? "success" : "danger" }]);
    });
  }

  keyboard.push([
    { text: "🔄 Refresh", callback_data: "shop", style: "success" },
    { text: "◀️ Back", callback_data: "home", style: "success" }
  ]);

  const text = `🛍️ <b>Available Products</b>\n\n🟢 <b>Green</b> = In Stock\n🔴 <b>Red</b> = Out of Stock\n\nClick any product below to view details and order:`;
  const payload = { chat_id: chatId, text, parse_mode: "HTML", reply_markup: { inline_keyboard: keyboard } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

async function sendProductDetailView(env, chatId, prodId, editMessageId = null) {
  const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
  if (!prod) return;

  const stockRow = await env.DB.prepare("SELECT COUNT(*) as count FROM inventory WHERE product_id = ? AND is_sold = 0").bind(prodId).first();
  const stockCount = prod.is_external ? (prod.api_stock || 0) : (stockRow ? stockRow.count : 0);
  const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
  const priceBdt = Math.round(prod.price_usd * rate);

  const details = `💌 <b>${prod.name}</b>\n\n` +
    `👛 Price: <b>$${Number(prod.price_usd).toFixed(2)} / item</b> (≈ ৳${priceBdt} BDT)\n` +
    `📦 Available Stock: <b>${stockCount}</b>\n\n` +
    `📦 <b>Product Details:</b>\n<blockquote>${prod.description || "Digital License"}</blockquote>\n\n` +
    `<blockquote>Important Note:\nDelivery is instant and automated after payment confirmation.</blockquote>`;

  const buttons = [];
  if (stockCount > 0) buttons.push([{ text: "🛍️ Buy Now", callback_data: `buynow_${prod.id}`, style: "success" }]);
  else buttons.push([{ text: "⏳ Pre-Order Now", callback_data: `preorder_${prod.id}`, style: "danger" }]);

  buttons.push([
    { text: "🔄 Refresh", callback_data: `prod_${prod.id}`, style: "success" },
    { text: "◀️ Back", callback_data: "shop", style: "success" }
  ]);

  const payload = { chat_id: chatId, text: details, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

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
    [{ text: "📦 Custom Quantity", callback_data: `custom_qty_${prod.id}`, style: "success" }]
  ];

  if (!hasEnoughBal) {
    keypad.push([{ text: `💳 Deposit $${diff.toFixed(2)} more → Pay from Balance`, callback_data: `dep_needed_${diff.toFixed(2)}`, style: "success" }]);
  } else {
    keypad.push([{ text: `👛 Pay from Balance ($${totalPrice.toFixed(2)})`, callback_data: `pay_balance_${prod.id}_${qty}`, style: "success" }]);
  }
  keypad.push([{ text: `⚡ Direct Pay - ${qty} items - $${totalPrice.toFixed(2)}`, callback_data: `direct_pay_${prod.id}_${qty}`, style: "success" }]);
  keypad.push([{ text: "◀️ Cancel", callback_data: `prod_${prod.id}`, style: "danger" }]);

  const payload = { chat_id: chatId, text: previewText, parse_mode: "HTML", reply_markup: { inline_keyboard: keypad } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

async function sendDeposit(env, chatId, editMessageId = null, prefillAmount = null) {
  const user = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(chatId).first();
  const usdBal = user ? (user.balance_usd || 0).toFixed(2) : "0.00";
  const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
  const bdtBal = user ? Math.round((user.balance_usd || 0) * rate) : 0;

  const text = `💳 <b>Deposit Funds to Wallet</b>\n\n` +
    `Current Wallet Balance: <b>$${usdBal} USD (≈ ৳${bdtBal} BDT)</b>\n` +
    `Current Rate: <b>1 USD = ${rate} BDT</b>\n\n` +
    `Select a payment method below to get deposit instructions:`;

  const buttons = [
    [{ text: "🟢 bKash", callback_data: "dep_method_bkash", style: "success" }, { text: "🟠 Nagad", callback_data: "dep_method_nagad", style: "success" }],
    [{ text: "🟣 Rocket", callback_data: "dep_method_rocket", style: "success" }],
    [{ text: "🟡 Binance Pay (USDT)", callback_data: "dep_method_binance", style: "success" }, { text: "🔵 BEP20 (USDT)", callback_data: "dep_method_bep20", style: "success" }],
    [{ text: "◀️ Main Menu", callback_data: "home", style: "danger" }]
  ];

  const payload = { chat_id: chatId, text, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

async function sendAdminDashboard(env, chatId, editMessageId = null) {
  const totalUsers = await env.DB.prepare("SELECT COUNT(*) as count FROM users").first();
  const totalOrders = await env.DB.prepare("SELECT COUNT(*) as count FROM orders").first();
  const completed = await env.DB.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'completed'").first();
  const stock = await env.DB.prepare("SELECT COUNT(*) as count FROM inventory WHERE is_sold = 0").first();
  const pendingPo = await env.DB.prepare("SELECT COUNT(*) as count FROM preorders WHERE status = 'pending'").first();
  const apiProds = await env.DB.prepare("SELECT COUNT(*) as count FROM products WHERE is_external = 1 AND is_active = 1").first();

  const rate = await getSetting(env, "usd_to_bdt_rate", "125");
  const commPct = await getSetting(env, "referral_commission_percent", "5");
  const forceChan = await getSetting(env, "force_channel_username", "");
  const forceGrp = await getSetting(env, "force_group_username", "");
  const forceStatus = (forceChan || forceGrp) ? "Active ✅" : "Off ❌";

  const report = `👑 <b>Store Administration Control Center</b>\n\n` +
    `📊 <b>Store Analytics:</b>\n` +
    `• Registered Users: <b>${totalUsers ? totalUsers.count : 0} members</b>\n` +
    `• Completed Deliveries: <b>${completed ? completed.count : 0}</b> / Total Orders: <b>${totalOrders ? totalOrders.count : 0}</b>\n` +
    `• In-Stock Items: <b>${stock ? stock.count : 0}</b> | VEXORIX Products: <b>${apiProds ? apiProds.count : 0} active</b>\n` +
    `• Pending Pre-Orders: <b>${pendingPo ? pendingPo.count : 0}</b>\n\n` +
    `⚙️ <b>Rates:</b> 1 USD = ${rate} BDT | Referral: ${commPct}% | Force Join: <b>${forceStatus}</b>\n\n` +
    `Select any button below to manage your store:`;

  const buttons = [
    [{ text: "➕ Add Stock", callback_data: "adm_stock_menu", style: "success" }, { text: "➕ Add New Product", callback_data: "adm_add_product", style: "success" }],
    [{ text: "💰 Custom Prices", callback_data: "adm_price_menu", style: "success" }, { text: "📋 Manage Products", callback_data: "adm_manage_products", style: "success" }],
    [{ text: `🔌 VEXORIX API Center (${apiProds ? apiProds.count : 0})`, callback_data: "adm_api_menu", style: "success" }, { text: `⏳ Pre-Orders (${pendingPo ? pendingPo.count : 0})`, callback_data: "adm_view_preorders", style: "success" }],
    [{ text: `🔒 Force Join (${forceStatus})`, callback_data: "adm_force_menu", style: "success" }, { text: "📢 Broadcast Message", callback_data: "adm_broadcast", style: "success" }],
    [{ text: `💱 1 USD = BDT (${rate})`, callback_data: "adm_set_rate", style: "success" }, { text: `🎁 Referral % (${commPct}%)`, callback_data: "adm_set_ref_comm", style: "success" }],
    [{ text: "⚙️ Payment Numbers", callback_data: "adm_payment_settings", style: "success" }, { text: "📞 Support Contact", callback_data: "adm_set_support", style: "success" }],
    [{ text: "🏪 Back to Store Home", callback_data: "home", style: "success" }]
  ];

  const payload = { chat_id: chatId, text: report, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

async function sendProfile(env, chatId, user, editMessageId = null) {
  const usdBal = user ? (user.balance_usd || 0).toFixed(2) : "0.00";
  const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
  const bdtBal = user ? Math.round((user.balance_usd || 0) * rate) : 0;

  const profileText = `👤 <b>Customer Profile & Wallet</b>\n\n` +
    `🆔 <b>User ID:</b> <code>${chatId}</code>\n` +
    `👤 <b>Name:</b> ${user ? user.first_name : "Customer"}\n\n` +
    `💰 <b>Available Wallet Balance:</b>\n` +
    `• USD: <b>$${usdBal} USD</b>\n` +
    `• BDT: <b>≈ ৳${bdtBal} BDT</b>\n\n` +
    `📊 <b>Account Statistics:</b>\n` +
    `• Total Spent: <b>$${(user ? user.total_spent_usd || 0 : 0).toFixed(2)} USD</b>\n` +
    `• Total Invited Friends: <b>${user ? user.total_referrals : 0} members</b>`;

  const buttons = [
    [{ text: "💳 Deposit Funds", callback_data: "deposit", style: "success" }],
    [{ text: "📦 Order History", callback_data: "my_orders", style: "success" }, { text: "⏳ My Pre-Orders", callback_data: "my_preorders", style: "success" }],
    [{ text: "👥 Refer & Earn", callback_data: "refer", style: "success" }],
    [{ text: "◀️ Main Menu", callback_data: "home", style: "success" }]
  ];
  const payload = { chat_id: chatId, text: profileText, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

async function sendUserPreorders(env, chatId, editMessageId = null) {
  const { results: preorders } = await env.DB.prepare("SELECT po.*, p.name as product_name, p.price_usd FROM preorders po JOIN products p ON po.product_id = p.id WHERE po.user_id = ? ORDER BY po.id DESC LIMIT 10").bind(chatId).all();
  let text = `⏳ <b>Your Active Pre-Orders:</b>\n\n`;
  if (!preorders || preorders.length === 0) {
    text += `You have not placed any pre-orders yet.`;
  } else {
    preorders.forEach(po => { text += `🔹 <b>${po.product_name}</b>\nPrice: $${po.price_usd.toFixed(2)} USD\nStatus: <b>${po.status.toUpperCase()}</b>\n\n`; });
  }
  const buttons = [[{ text: "🛒 Open Shop", callback_data: "shop", style: "success" }], [{ text: "◀️ Main Menu", callback_data: "home", style: "success" }]];
  const payload = { chat_id: chatId, text, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

async function sendOrders(env, chatId, editMessageId = null) {
  const { results } = await env.DB.prepare("SELECT o.*, p.name as product_name, i.item_data FROM orders o JOIN products p ON o.product_id = p.id LEFT JOIN inventory i ON o.id = i.order_id WHERE o.user_id = ? AND o.status = 'completed' ORDER BY o.id DESC LIMIT 5").bind(chatId).all();
  let orderText = `📦 <b>Your Completed Orders:</b>\n\n`;
  if (!results || results.length === 0) orderText += `You have not completed any purchases yet.`;
  else results.forEach(o => { orderText += `🔹 <b>${o.product_name}</b>\nOrder: #${o.id} | Quantity: ${o.quantity || 1} | Amount: $${o.amount_usd} USD\nCredentials: <code>${o.item_data || o.trx_id || "Delivered"}</code>\n\n`; });
  const buttons = [[{ text: "◀️ Main Menu", callback_data: "home", style: "success" }]];
  const payload = { chat_id: chatId, text: orderText, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

async function sendRefer(env, chatId, user, editMessageId = null) {
  const botInfo = await sendTelegram(env, "getMe", {});
  const botData = await botInfo.json();
  const botUsername = botData.result ? botData.result.username : "bot";
  const refLink = `https://t.me/${botUsername}?start=ref_${chatId}`;
  const commPct = await getSetting(env, "referral_commission_percent", "5");

  const refText = `👥 <b>Refer & Earn Program</b>\n\n` +
    `Invite friends and earn <b>${commPct}% instant wallet commission</b> whenever your invited friend purchases any product!\n\n` +
    `🔗 <b>Your Personal Referral Link:</b>\n<code>${refLink}</code>\n\n` +
    `📊 <b>Your Statistics:</b>\n• Total Referred Members: <b>${user ? user.total_referrals : 0} members</b>\n• Commission Rate: <b>${commPct}% on all purchases</b>`;

  const buttons = [
    [{ text: "📤 Share Referral Link", url: `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent("Check out this digital products store with instant automated delivery!")}` }],
    [{ text: "◀️ Main Menu", callback_data: "home", style: "success" }]
  ];
  const payload = { chat_id: chatId, text: refText, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

async function sendSupport(env, chatId, editMessageId = null) {
  const supContact = await getSetting(env, "support_admin", "@fojlaybd");
  const cleanUsername = supContact.replace("@", "");
  const supText = `🕒 <b>Customer Support & Helpdesk</b>\n\nNeed help with an order or deposit?\nOur customer service team is ready to assist you!\n\n📞 <b>Support Handle:</b> <code>${supContact}</code>`;
  const buttons = [
    [{ text: "💬 Chat with Support Admin", url: `https://t.me/${cleanUsername}` }],
    [{ text: "◀️ Main Menu", callback_data: "home", style: "success" }]
  ];
  const payload = { chat_id: chatId, text: supText, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}
