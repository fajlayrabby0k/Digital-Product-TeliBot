// ====================================================================
// VEXORIX Store Clone - Ultimate Digital Product Telegram Bot
// Features:
// - Dynamic Currency Exchange Rate: 1 USD = X BDT (Admin Configurable)
// - External Bot API Sync (Import Products from other Bots/Providers)
// - Custom Price Setting for Local & API Products
// - Real-time Stock Quantity Display on Buttons & Details
// - Rock-Solid Wallet Accounting & Dual Currency Balance
// - Pre-Order System (Direct Submit & Admin Accept/Decline)
// - 100% Button-Driven Interactive Admin Panel (Zero Commands)
// - Purchase-Based Referral Commission (%)
// - 5 Payment Methods (bKash, Nagad, Rocket, Binance Pay, BEP-20 USDT)
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
            { command: "preorder", description: "Pre-order items" },
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
            message: "Setup complete! Exchange Rate, API Sync, Real-time Quantity, and Store features are active."
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
      total_commission_bdt REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price_bdt REAL NOT NULL,
      price_usd REAL NOT NULL,
      api_service_id TEXT DEFAULT '',
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

    `CREATE TABLE IF NOT EXISTS preorders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      username TEXT,
      details TEXT NOT NULL,
      budget TEXT DEFAULT '',
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

    // Demo Products
    `INSERT OR IGNORE INTO products (id, name, description, price_bdt, price_usd) VALUES 
      (1, 'Windows 11 Pro Retail Key', 'Lifetime Retail Online Activation License Key (1 PC)', 560, 4.5),
      (2, 'Internet Download Manager (IDM)', '1-Year Official Registration License Key', 875, 7.0),
      (3, 'Telegram Premium 1 Month', 'Direct Gift link activation (No login required)', 500, 4.0),
      (4, 'NordVPN 1 Year Account', 'Premium Shared Account with warranty', 680, 5.5);`,

    // Demo Inventory
    `INSERT OR IGNORE INTO inventory (id, product_id, item_data) VALUES 
      (1, 1, 'W269N-WFGWX-YVC9B-4J6C9-T83GX'),
      (2, 1, 'VK7JG-NPHTM-C97JM-9MPGT-3V66T'),
      (3, 2, 'IDM-KEY-9821-3948-2831-9238'),
      (4, 3, 'https://t.me/giftcode/demo-telegram-premium-link-1234'),
      (5, 4, 'Email: norduser@gmail.com | Password: NordPass#2026');`,

    // Default System Settings
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('usd_rate_bdt', '125');`,
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('referral_commission_percent', '5');`,
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('support_contact', '@admin');`
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

    // User Registration
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

      if (referrerId > 0) {
        await env.DB.prepare("UPDATE users SET total_referrals = total_referrals + 1 WHERE user_id = ?").bind(referrerId).run();
      }

      user = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(chatId).first();
    }

    // CHECK IF ADMIN IS IN A CONVERSATION STATE
    if (String(chatId) === String(env.ADMIN_ID)) {
      const adminState = await env.DB.prepare("SELECT * FROM admin_states WHERE user_id = ?").bind(chatId).first();
      if (adminState && adminState.state) {
        const handled = await handleAdminTextState(env, chatId, text, adminState);
        if (handled) return;
      }
    }

    // CHECK IF USER IS SUBMITTING A PRE-ORDER
    const userState = await env.DB.prepare("SELECT * FROM admin_states WHERE user_id = ?").bind(chatId).first();
    if (userState && userState.state === "awaiting_preorder_text") {
      await clearAdminState(env, chatId);
      const res = await env.DB.prepare(
        "INSERT INTO preorders (user_id, username, details, status) VALUES (?, ?, ?, 'pending')"
      ).bind(chatId, username, text).run();

      const preorderId = res.meta.last_row_id;

      await sendTelegram(env, "sendMessage", {
        chat_id: chatId,
        text: `✅ <b>Pre-Order Request Submitted!</b>\n\nRequest ID: #${preorderId}\nDetails: <i>${escapeHTML(text)}</i>\n\nOur team is reviewing your request. We will notify you here once reviewed.`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "🏠 Main Menu", callback_data: "home" }]] }
      });

      const adminNotice = `📦 <b>New Pre-Order Request!</b>\n\nRequest ID: #${preorderId}\nCustomer: ${username} (ID: <code>${chatId}</code>)\n\n<b>Details:</b>\n${escapeHTML(text)}`;
      const adminKeyboard = {
        inline_keyboard: [
          [
            { text: "✅ Accept Pre-Order", callback_data: `pre_accept_${preorderId}` },
            { text: "❌ Decline", callback_data: `pre_decline_${preorderId}` }
          ]
        ]
      };

      await sendTelegram(env, "sendMessage", {
        chat_id: env.ADMIN_ID,
        text: adminNotice,
        parse_mode: "HTML",
        reply_markup: adminKeyboard
      });
      return;
    }

    // Standard Menu Commands
    if (text.startsWith("/start") || text === "/home") {
      await sendHomeDashboard(env, chatId, user, firstName);
      return;
    }

    if (text === "/shop") {
      await sendProductsDirectly(env, chatId);
      return;
    }

    if (text === "/preorder") {
      await sendPreOrderMenu(env, chatId);
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

    if (data === "preorder") {
      await sendPreOrderMenu(env, chatId, messageId);
      return;
    }

    if (data === "submit_preorder") {
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_preorder_text', '')").bind(chatId).run();
      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `📦 <b>Place a Pre-Order:</b>\n\nPlease send the details of the digital product, account, or custom subscription you need:\n<i>(Include any specific requirements or budget)</i>`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "preorder" }]] }
      });
      return;
    }

    if (data === "my_preorders") {
      const { results: preorders } = await env.DB.prepare("SELECT * FROM preorders WHERE user_id = ? ORDER BY id DESC LIMIT 5").bind(chatId).all();
      let pText = `📦 <b>Your Pre-Order Requests:</b>\n\n`;
      if (!preorders || preorders.length === 0) {
        pText += `You have no active pre-order requests.`;
      } else {
        preorders.forEach(p => {
          pText += `🔹 <b>Request #${p.id}</b> [${p.status.toUpperCase()}]\nDetails: ${escapeHTML(p.details)}\n\n`;
        });
      }
      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: pText, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "preorder" }]] } });
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

    if (data === "bot_api") {
      const pUrl = await getSetting(env, "provider_api_url", "Not Connected");
      const apiText = `🔗 <b>Bot API & Integration</b>\n\nConnect our store directly to your automated systems or child bots.\n\nAPI Status: 🟢 <b>Online</b>\nProvider Endpoint: <code>${pUrl}</code>\n\nDocumentation: Standard REST API. Contact Support to request your API keys.`;
      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: apiText, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "🔙 Main Menu", callback_data: "home" }]] } });
      return;
    }

    // ----------------------------------------------------
    // PRE-ORDER ADMIN ACTIONS
    // ----------------------------------------------------
    if (data.startsWith("pre_accept_")) {
      const pId = data.replace("pre_accept_", "");
      await env.DB.prepare("UPDATE preorders SET status = 'accepted' WHERE id = ?").bind(pId).run();
      const p = await env.DB.prepare("SELECT * FROM preorders WHERE id = ?").bind(pId).first();
      if (p) {
        await sendTelegram(env, "sendMessage", {
          chat_id: p.user_id,
          text: `🎉 <b>Great News!</b>\nYour Pre-Order #${pId} has been <b>ACCEPTED</b> by our team. We will deliver the details or payment request shortly!`,
          parse_mode: "HTML"
        });
      }
      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: `✅ Pre-Order #${pId} marked as ACCEPTED!`, parse_mode: "HTML" });
      return;
    }

    if (data.startsWith("pre_decline_")) {
      const pId = data.replace("pre_decline_", "");
      await env.DB.prepare("UPDATE preorders SET status = 'declined' WHERE id = ?").bind(pId).run();
      const p = await env.DB.prepare("SELECT * FROM preorders WHERE id = ?").bind(pId).first();
      if (p) {
        await sendTelegram(env, "sendMessage", {
          chat_id: p.user_id,
          text: `❌ <b>Pre-Order Update:</b>\nSorry, your Pre-Order #${pId} could not be fulfilled at this moment.`,
          parse_mode: "HTML"
        });
      }
      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: `❌ Pre-Order #${pId} was DECLINED.`, parse_mode: "HTML" });
      return;
    }

    // ----------------------------------------------------
    // ADMIN PANEL BUTTON-DRIVEN WORKFLOWS (NO COMMANDS)
    // ----------------------------------------------------
    if (data === "admin_panel") {
      if (String(chatId) === String(env.ADMIN_ID)) {
        await clearAdminState(env, chatId);
        await sendAdminDashboard(env, chatId, messageId);
      }
      return;
    }

    // Set 1 USD = BDT Exchange Rate Flow
    if (data === "adm_set_usd_rate") {
      const currentRate = await getSetting(env, "usd_rate_bdt", "125");
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_usd_rate', '')").bind(chatId).run();

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `💱 <b>Set Currency Exchange Rate:</b>\n\nCurrent Rate: <b>1 USD = ৳${currentRate} BDT</b>\n\nPlease enter the new rate in Taka:\n<i>(Example: enter <code>125</code> or <code>128</code>)</i>`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_panel" }]] }
      });
      return;
    }

    // External Bot API Sync Menu
    if (data === "adm_api_sync_menu") {
      const pUrl = await getSetting(env, "provider_api_url", "Not Set");
      const pKey = await getSetting(env, "provider_api_key", "Not Set");

      const text = `🔗 <b>External Bot API Provider Settings:</b>\n\n• API Endpoint: <code>${pUrl}</code>\n• API Key: <code>${pKey !== "Not Set" ? "••••••••" : "Not Set"}</code>\n\nYou can connect an external store bot API to automatically sync its products into your shop.`;
      const buttons = [
        [{ text: "🌐 Set API URL", callback_data: "adm_set_api_url" }, { text: "🔑 Set API Key", callback_data: "adm_set_api_key" }],
        [{ text: "🔄 Sync Products Now", callback_data: "adm_trigger_api_sync" }],
        [{ text: "🔙 Admin Panel", callback_data: "admin_panel" }]
      ];
      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
      return;
    }

    if (data === "adm_set_api_url") {
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_api_url', '')").bind(chatId).run();
      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `🌐 <b>Enter External Bot API URL:</b>\n\nPlease send the API endpoint URL:\n<i>(Example: <code>https://api.externalbot.com/v1/products</code>)</i>`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "adm_api_sync_menu" }]] }
      });
      return;
    }

    if (data === "adm_set_api_key") {
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_api_key', '')").bind(chatId).run();
      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `🔑 <b>Enter External Bot API Key:</b>\n\nPlease send the API Secret or Bearer Token:`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "adm_api_sync_menu" }]] }
      });
      return;
    }

    // Trigger API Product Sync
    if (data === "adm_trigger_api_sync") {
      const pUrl = await getSetting(env, "provider_api_url", "");
      const pKey = await getSetting(env, "provider_api_key", "");

      if (!pUrl || pUrl === "Not Set") {
        await sendTelegram(env, "editMessageText", {
          chat_id: chatId,
          message_id: messageId,
          text: `⚠️ <b>API URL Not Configured!</b>\nPlease set the API URL first before syncing.`,
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "adm_api_sync_menu" }]] }
        });
        return;
      }

      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: `⏳ <b>Connecting to Provider API and fetching products...</b>`, parse_mode: "HTML" });

      try {
        const resp = await fetch(pUrl, {
          method: "GET",
          headers: pKey ? { "Authorization": `Bearer ${pKey}`, "Content-Type": "application/json" } : {}
        });

        const items = await resp.json();
        let synced = 0;
        const rate = parseFloat(await getSetting(env, "usd_rate_bdt", "125")) || 125;

        if (Array.isArray(items)) {
          for (const item of items) {
            const name = item.name || item.service || "External Product";
            const desc = item.description || "Imported via Provider API";
            const usd = parseFloat(item.price || item.rate || 5.0);
            const bdt = Math.round(usd * rate);
            const serviceId = String(item.service_id || item.id || "");

            await env.DB.prepare(
              "INSERT INTO products (name, description, price_bdt, price_usd, api_service_id, is_active) VALUES (?, ?, ?, ?, ?, 1)"
            ).bind(name, desc, bdt, usd, serviceId).run();
            synced++;
          }
        }

        await sendTelegram(env, "editMessageText", {
          chat_id: chatId,
          message_id: messageId,
          text: `✅ <b>API Sync Successful!</b>\nImported <b>${synced}</b> products from external bot.\n\nYou can customize their prices anytime using <b>Change Product Price</b> menu!`,
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [[{ text: "🛒 View Products", callback_data: "shop" }], [{ text: "👑 Admin Panel", callback_data: "admin_panel" }]] }
        });
      } catch (err) {
        await sendTelegram(env, "editMessageText", {
          chat_id: chatId,
          message_id: messageId,
          text: `❌ <b>Sync Failed:</b> ${escapeHTML(err.message)}\nPlease verify your API URL and Key.`,
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "adm_api_sync_menu" }]] }
        });
      }
      return;
    }

    // Stock Management Menu
    if (data === "adm_stock_menu") {
      const { results: prods } = await env.DB.prepare("SELECT * FROM products WHERE is_active = 1").all();
      const buttons = prods.map(p => [{ text: `📦 ${p.name}`, callback_data: `adm_addstock_${p.id}` }]);
      buttons.push([{ text: "🔙 Admin Panel", callback_data: "admin_panel" }]);

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `📦 <b>Select a product to add stock:</b>\nClick on the product to add license keys or accounts:`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons }
      });
      return;
    }

    if (data.startsWith("adm_addstock_")) {
      const prodId = data.replace("adm_addstock_", "");
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_stock', ?)").bind(chatId, prodId).run();

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `📥 <b>Add Stock for: ${prod ? prod.name : "Product"}</b>\n\nPlease <b>send / paste</b> the license key, account details, or download link:`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_panel" }]] }
      });
      return;
    }

    // Dedicated Price Change Menu
    if (data === "adm_change_price_menu") {
      const { results: prods } = await env.DB.prepare("SELECT * FROM products WHERE is_active = 1").all();
      const buttons = prods.map(p => [{ text: `💰 ${p.name} ($${p.price_usd} / ৳${p.price_bdt})`, callback_data: `adm_price_options_${p.id}` }]);
      buttons.push([{ text: "🔙 Admin Panel", callback_data: "admin_panel" }]);

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `💰 <b>Select a product to change price:</b>\nClick on any product below:`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons }
      });
      return;
    }

    // Product Price Card with Separate Buttons
    if (data.startsWith("adm_price_options_")) {
      const prodId = data.replace("adm_price_options_", "");
      await sendProductPriceCard(env, chatId, prodId, messageId);
      return;
    }

    if (data.startsWith("adm_edit_bdt_")) {
      const prodId = data.replace("adm_edit_bdt_", "");
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_price_bdt', ?)").bind(chatId, prodId).run();

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `🇧🇩 <b>Change BDT Price for: ${prod ? prod.name : "Product"}</b>\nCurrent BDT Price: <b>৳${prod.price_bdt} BDT</b>\n\nPlease send the new BDT price in Taka:\n<i>(Example: <code>550</code>)</i>`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: `adm_price_options_${prodId}` }]] }
      });
      return;
    }

    if (data.startsWith("adm_edit_usd_")) {
      const prodId = data.replace("adm_edit_usd_", "");
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_price_usd', ?)").bind(chatId, prodId).run();

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `🇺🇸 <b>Change USD Price for: ${prod ? prod.name : "Product"}</b>\nCurrent USD Price: <b>$${prod.price_usd} USD</b>\n\nPlease send the new USD price in Dollars:\n<i>(Example: <code>4.99</code>)</i>`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: `adm_price_options_${prodId}` }]] }
      });
      return;
    }

    // 1-Click Auto-Convert USD from BDT using Admin's exact rate
    if (data.startsWith("adm_autoconvert_")) {
      const prodId = data.replace("adm_autoconvert_", "");
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      const rate = parseFloat(await getSetting(env, "usd_rate_bdt", "125")) || 125;
      if (prod) {
        const newUsd = parseFloat((prod.price_bdt / rate).toFixed(2));
        await env.DB.prepare("UPDATE products SET price_usd = ? WHERE id = ?").bind(newUsd, prodId).run();
        await sendProductPriceCard(env, chatId, prodId, messageId, `✅ Converted at rate $1 = ৳${rate}! New USD: $${newUsd}`);
      }
      return;
    }

    // Add New Product Flow
    if (data === "adm_add_product") {
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_prod_name', '{}')").bind(chatId).run();
      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `➕ <b>Add New Product — Step 1/3</b>\n\nPlease send the <b>Name</b> of the new product:\n<i>(Example: Canva Pro 1 Year)</i>`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_panel" }]] }
      });
      return;
    }

    // Manage & Delete Products
    if (data === "adm_manage_products") {
      const { results: prods } = await env.DB.prepare("SELECT p.*, (SELECT COUNT(*) FROM inventory i WHERE i.product_id = p.id AND i.is_sold = 0) as stock_count FROM products p WHERE p.is_active = 1").all();
      const buttons = prods.map(p => [
        { text: `${p.name} (Qty: ${p.stock_count})`, callback_data: `adm_prod_details_${p.id}` }
      ]);
      buttons.push([{ text: "🔙 Admin Panel", callback_data: "admin_panel" }]);

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `📋 <b>Store Products & Inventory:</b>\nClick any item to view details or remove:`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons }
      });
      return;
    }

    if (data.startsWith("adm_prod_details_")) {
      const prodId = data.replace("adm_prod_details_", "");
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      const stock = await env.DB.prepare("SELECT COUNT(*) as count FROM inventory WHERE product_id = ? AND is_sold = 0").bind(prodId).first();

      const text = `📦 <b>${prod.name}</b>\n\nPrice: $${prod.price_usd} USD (৳${prod.price_bdt} BDT)\nRemaining Stock: <b>${stock ? stock.count : 0} items</b>\nDescription: ${prod.description}`;
      const buttons = [
        [{ text: "➕ Add Stock", callback_data: `adm_addstock_${prod.id}` }, { text: "💰 Edit Price", callback_data: `adm_price_options_${prod.id}` }],
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
        text: `✅ Product #${prodId} has been deleted!`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "🔙 Products List", callback_data: "adm_manage_products" }]] }
      });
      return;
    }

    // Set Referral Commission %
    if (data === "adm_referral_settings") {
      const current = await getSetting(env, "referral_commission_percent", "5");
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_ref_percent', '')").bind(chatId).run();

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `👥 <b>Referral Commission Settings:</b>\n\nCurrent Commission: <b>${current}%</b> of every purchase.\n\nPlease enter the new commission percentage:\n<i>(Example: enter <code>10</code> for 10% commission)</i>`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_panel" }]] }
      });
      return;
    }

    // Set Support Contact ID / Username
    if (data === "adm_support_contact") {
      const current = await getSetting(env, "support_contact", "@admin");
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_support_contact', '')").bind(chatId).run();

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `📞 <b>Customer Support Contact:</b>\n\nCurrent Contact: <code>${current}</code>\n\nPlease send your new Telegram Username or Support Link:\n<i>(Example: <code>@MyStoreSupport</code>)</i>`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_panel" }]] }
      });
      return;
    }

    // Broadcast Flow
    if (data === "adm_broadcast") {
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_broadcast', '')").bind(chatId).run();
      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `📢 <b>Broadcast Announcement to All Users:</b>\n\nPlease type and send the message you want to deliver to every registered user:`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_panel" }]] }
      });
      return;
    }

    // Payment Accounts Settings
    if (data === "adm_payment_settings") {
      const bkash = await getSetting(env, "bkash_num", env.BKASH_NUM || "Not set");
      const nagad = await getSetting(env, "nagad_num", env.NAGAD_NUM || "Not set");
      const rocket = await getSetting(env, "rocket_num", env.ROCKET_NUM || "Not set");
      const binance = await getSetting(env, "binance_id", env.BINANCE_PAY_ID || "Not set");
      const bep20 = await getSetting(env, "bep20_addr", env.BEP20_ADDRESS || "Not set");

      const text = `⚙️ <b>Store Payment Accounts:</b>\n\n• <b>bKash:</b> <code>${bkash}</code>\n• <b>Nagad:</b> <code>${nagad}</code>\n• <b>Rocket:</b> <code>${rocket}</code>\n• <b>Binance Pay:</b> <code>${binance}</code>\n• <b>USDT BEP-20:</b> <code>${bep20}</code>\n\nClick any button below to update account number:`;

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
    // CUSTOMER SHOPPING & REAL-TIME QUANTITY DISPLAY
    // ----------------------------------------------------
    if (data.startsWith("prod_")) {
      const prodId = data.split("_")[1];
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      const stock = await env.DB.prepare("SELECT COUNT(*) as count FROM inventory WHERE product_id = ? AND is_sold = 0").bind(prodId).first();

      const stockCount = stock ? stock.count : 0;
      const details = `📦 <b>${prod.name}</b>\n\n📝 <b>Description:</b>\n${prod.description}\n\n💵 <b>Price:</b> $${prod.price_usd} USD / ৳${prod.price_bdt} BDT\n📊 <b>Available Stock:</b> ${stockCount > 0 ? `✅ <b>${stockCount} items in stock</b>` : '❌ <b>Out of Stock (0 items)</b>'}`;
      
      const buttons = [];
      if (stockCount > 0) {
        buttons.push([{ text: "🛒 Buy Now (Direct Payment)", callback_data: `buy_${prod.id}` }]);
        buttons.push([{ text: "💳 Pay with Wallet Balance", callback_data: `pay_wallet_${prod.id}` }]);
      } else {
        buttons.push([{ text: "📦 Request Pre-Order", callback_data: "submit_preorder" }]);
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

    // Wallet Instant Purchase + Award Purchase Commission to Referrer
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

      await awardReferralCommission(env, user, prod.price_bdt);

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

    // Payment Instructions
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

          const buyer = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(order.user_id).first();
          if (buyer) {
            await awardReferralCommission(env, buyer, order.amount);
          }

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
// Purchase Referral Commission Awarder (%)
// ====================================================================
async function awardReferralCommission(env, buyer, orderAmount) {
  if (!buyer || !buyer.referred_by || buyer.referred_by === 0) return;

  const referrerId = buyer.referred_by;
  const pctStr = await getSetting(env, "referral_commission_percent", "5");
  const pct = parseFloat(pctStr) || 5;

  const commission = parseFloat(((orderAmount * pct) / 100).toFixed(2));
  if (commission <= 0) return;

  await env.DB.prepare(
    "UPDATE users SET balance_bdt = balance_bdt + ?, total_commission_bdt = total_commission_bdt + ? WHERE user_id = ?"
  ).bind(commission, commission, referrerId).run();

  await sendTelegram(env, "sendMessage", {
    chat_id: referrerId,
    text: `🎉 <b>Referral Commission Earned!</b>\n\nA user you referred just completed a purchase!\n💰 You received a <b>${pct}%</b> commission: <b>৳${commission} BDT</b> credited to your wallet balance!`,
    parse_mode: "HTML"
  });
}

// ====================================================================
// Admin Interactive State Processor (Zero-Command)
// ====================================================================
async function handleAdminTextState(env, chatId, text, adminState) {
  const state = adminState.state;

  // Setting 1 USD = BDT Rate
  if (state === "awaiting_usd_rate") {
    const rate = parseFloat(text.replace(/[^0-9.]/g, "")) || 125;
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('usd_rate_bdt', ?)").bind(String(rate)).run();
    await clearAdminState(env, chatId);

    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `✅ <b>Exchange Rate Updated!</b>\nNew Exchange Rate: <b>1 USD = ৳${rate} BDT</b>`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "👑 Admin Panel", callback_data: "admin_panel" }]] }
    });
    return true;
  }

  // Setting Provider API URL
  if (state === "awaiting_api_url") {
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('provider_api_url', ?)").bind(text.trim()).run();
    await clearAdminState(env, chatId);

    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `✅ <b>Provider API URL Saved!</b>\nURL: <code>${escapeHTML(text)}</code>`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "🔗 API Settings", callback_data: "adm_api_sync_menu" }], [{ text: "👑 Admin Panel", callback_data: "admin_panel" }]] }
    });
    return true;
  }

  // Setting Provider API Key
  if (state === "awaiting_api_key") {
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('provider_api_key', ?)").bind(text.trim()).run();
    await clearAdminState(env, chatId);

    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `✅ <b>Provider API Key Saved!</b>`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "🔗 API Settings", callback_data: "adm_api_sync_menu" }], [{ text: "👑 Admin Panel", callback_data: "admin_panel" }]] }
    });
    return true;
  }

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

  // Update BDT Price
  if (state === "awaiting_price_bdt") {
    const prodId = adminState.data;
    const bdt = parseFloat(text.replace(/[^0-9.]/g, "")) || 500;
    await env.DB.prepare("UPDATE products SET price_bdt = ? WHERE id = ?").bind(bdt, prodId).run();
    await clearAdminState(env, chatId);
    await sendProductPriceCard(env, chatId, prodId, null, `✅ BDT Price updated to ৳${bdt} BDT!`);
    return true;
  }

  // Update USD Price
  if (state === "awaiting_price_usd") {
    const prodId = adminState.data;
    const usd = parseFloat(text.replace(/[^0-9.]/g, "")) || 4.5;
    await env.DB.prepare("UPDATE products SET price_usd = ? WHERE id = ?").bind(usd, prodId).run();
    await clearAdminState(env, chatId);
    await sendProductPriceCard(env, chatId, prodId, null, `✅ USD Price updated to $${usd} USD!`);
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
      text: `💰 <b>Add Product — Step 3/3</b>\n\nPlease enter the price in <b>BDT and USD</b> (e.g. <code>500, 4.5</code> or just BDT <code>500</code>):`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_panel" }]] }
    });
    return true;
  }

  // Adding Product - Step 3
  if (state === "awaiting_prod_price") {
    const data = JSON.parse(adminState.data || "{}");
    const rate = parseFloat(await getSetting(env, "usd_rate_bdt", "125")) || 125;
    let bdt = 500, usd = 4.5;
    if (text.includes(",")) {
      const parts = text.split(",");
      bdt = parseFloat(parts[0].trim()) || 500;
      usd = parseFloat(parts[1].trim()) || 4.5;
    } else {
      bdt = parseFloat(text.trim()) || 500;
      usd = parseFloat((bdt / rate).toFixed(2));
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

  // Update Referral Commission %
  if (state === "awaiting_ref_percent") {
    const pct = parseFloat(text.replace("%", "").trim()) || 5;
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('referral_commission_percent', ?)").bind(String(pct)).run();
    await clearAdminState(env, chatId);

    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `✅ <b>Referral Commission Updated!</b>\nReferrers will now earn <b>${pct}%</b> of every purchase made by their invites.`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "👑 Admin Panel", callback_data: "admin_panel" }]] }
    });
    return true;
  }

  // Update Support Contact Username
  if (state === "awaiting_support_contact") {
    let handle = text.trim();
    if (!handle.startsWith("@") && !handle.startsWith("http")) handle = `@${handle}`;
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('support_contact', ?)").bind(handle).run();
    await clearAdminState(env, chatId);

    await sendTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: `✅ <b>Support Contact Updated!</b>\nNew Support Handle: <code>${handle}</code>`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "👑 Admin Panel", callback_data: "admin_panel" }]] }
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

// Dedicated Price Card Helper Function
async function sendProductPriceCard(env, chatId, prodId, messageId = null, extraNotice = "") {
  const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
  if (!prod) return;

  const rate = await getSetting(env, "usd_rate_bdt", "125");

  let text = `💰 <b>Price Management: ${prod.name}</b>\n\n`;
  if (extraNotice) text += `${extraNotice}\n\n`;
  text += `• <b>Current BDT Price:</b> ৳${prod.price_bdt} BDT\n• <b>Current USD Price:</b> $${prod.price_usd} USD\n• <i>Store Exchange Rate: $1 = ৳${rate} BDT</i>\n\nSelect an option below to update:`;

  const buttons = [
    [{ text: "🇧🇩 Change BDT Price (৳)", callback_data: `adm_edit_bdt_${prod.id}` }, { text: "🇺🇸 Change USD Price ($)", callback_data: `adm_edit_usd_${prod.id}` }],
    [{ text: `⚡ Auto-Convert USD from BDT (Rate: ${rate})`, callback_data: `adm_autoconvert_${prod.id}` }],
    [{ text: "🔙 Price List", callback_data: "adm_change_price_menu" }, { text: "👑 Admin Panel", callback_data: "admin_panel" }]
  ];

  const payload = { chat_id: chatId, text, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
  if (messageId) {
    payload.message_id = messageId;
    await sendTelegram(env, "editMessageText", payload);
  } else {
    await sendTelegram(env, "sendMessage", payload);
  }
}

async function clearAdminState(env, userId) {
  await env.DB.prepare("DELETE FROM admin_states WHERE user_id = ?").bind(userId).run();
}

async function getSetting(env, key, defaultVal) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first();
  return (row && row.value) ? row.value : defaultVal;
}

function escapeHTML(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ====================================================================
// Reusable UI Functions (VEXORIX Layout with Real-time Quantity)
// ====================================================================

// 1. Home Dashboard
async function sendHomeDashboard(env, chatId, user, firstName, editMessageId = null) {
  const rate = parseFloat(await getSetting(env, "usd_rate_bdt", "125")) || 125;
  const bdtBal = user ? (user.balance_bdt || 0).toFixed(2) : "0.00";
  const usdBal = (parseFloat(bdtBal) / rate).toFixed(2);

  const welcome = `🛒 <b>Welcome to VEXORIX Store!</b>\n\nHey ${firstName}! 👋\n\nWe offer premium digital products at the best prices. Fast, secure, and fully automated delivery.\n\n<blockquote>🛒 <b>Shop</b> — Browse & buy products\n💰 <b>Deposit</b> — Add funds to your wallet\n👤 <b>Profile</b> — Balance, orders & settings\n🕒 <b>Support</b> — Get help</blockquote>\n\n📢 <b>Channel:</b> <a href="https://t.me/">Join Channel</a>\n👥 <b>Group:</b> <a href="https://t.me/">Join Group Chat</a>\n\n💰 <b>Balance:</b> $${usdBal} USDT (৳${bdtBal} BDT)\n\nChoose an option below to continue!`;

  const keyboard = [
    [{ text: "🛒 Shop", callback_data: "shop" }],
    [{ text: "👤 Profile", callback_data: "profile" }, { text: "💰 Deposit", callback_data: "deposit" }],
    [{ text: "🕒 Support", callback_data: "support" }, { text: "📦 Pre-Orders", callback_data: "preorder" }],
    [{ text: "👥 Refer & Earn", callback_data: "refer" }, { text: "🔗 Bot API", callback_data: "bot_api" }]
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

// 2. Direct Products List with REAL-TIME QUANTITY Display
async function sendProductsDirectly(env, chatId, editMessageId = null) {
  const { results: prods } = await env.DB.prepare(
    "SELECT p.*, (SELECT COUNT(*) FROM inventory i WHERE i.product_id = p.id AND i.is_sold = 0) as stock_qty FROM products p WHERE p.is_active = 1"
  ).all();

  const buttons = [];

  if (prods && prods.length > 0) {
    for (const p of prods) {
      const qtyText = p.stock_qty > 0 ? `Qty: ${p.stock_qty}` : "Out of Stock";
      buttons.push([{ text: `🔹 ${p.name} — $${p.price_usd} (${qtyText})`, callback_data: `prod_${p.id}` }]);
    }
  } else {
    buttons.push([{ text: "❌ No products currently in store", callback_data: "none" }]);
  }

  buttons.push([{ text: "🔙 Main Menu", callback_data: "home" }]);

  const text = `🛒 <b>Available Products & Live Stock:</b>\n\nSelect any product below to view description and instant buy options:`;
  const payload = { chat_id: chatId, text, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };

  if (editMessageId) {
    payload.message_id = editMessageId;
    await sendTelegram(env, "editMessageText", payload);
  } else {
    await sendTelegram(env, "sendMessage", payload);
  }
}

// 3. Pre-Order Menu
async function sendPreOrderMenu(env, chatId, editMessageId = null) {
  const text = `📦 <b>Pre-Orders & Custom Requests</b>\n\nLooking for an item that is out of stock, or need a custom subscription or bulk account?\n\nPlace a Pre-Order request and our administration team will source it for you promptly!`;
  const buttons = [
    [{ text: "📝 Submit New Pre-Order", callback_data: "submit_preorder" }],
    [{ text: "📋 My Pre-Orders History", callback_data: "my_preorders" }],
    [{ text: "🔙 Main Menu", callback_data: "home" }]
  ];
  const payload = { chat_id: chatId, text, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

// 4. Button-Driven Admin Dashboard
async function sendAdminDashboard(env, chatId, editMessageId = null) {
  const totalUsers = await env.DB.prepare("SELECT COUNT(*) as count FROM users").first();
  const totalOrders = await env.DB.prepare("SELECT COUNT(*) as count FROM orders").first();
  const completed = await env.DB.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'completed'").first();
  const pendingOrders = await env.DB.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'").first();
  const pendingPreorders = await env.DB.prepare("SELECT COUNT(*) as count FROM preorders WHERE status = 'pending'").first();
  const stock = await env.DB.prepare("SELECT COUNT(*) as count FROM inventory WHERE is_sold = 0").first();
  const rate = await getSetting(env, "usd_rate_bdt", "125");
  const refPct = await getSetting(env, "referral_commission_percent", "5");

  const report = `👑 <b>Store Administration Panel</b>\n\n📊 <b>Store Analytics:</b>\n• Total Users: <b>${totalUsers ? totalUsers.count : 0} members</b>\n• Total Orders: <b>${totalOrders ? totalOrders.count : 0}</b> (Pending: <b>${pendingOrders ? pendingOrders.count : 0}</b>)\n• Pending Pre-Orders: <b>${pendingPreorders ? pendingPreorders.count : 0}</b>\n• Completed Deliveries: <b>${completed ? completed.count : 0}</b>\n• In-Stock Items: <b>${stock ? stock.count : 0} items</b>\n• Exchange Rate: <b>1 USD = ৳${rate} BDT</b>\n• Referral Commission: <b>${refPct}%</b>\n\nSelect an administrative action below:`;

  const buttons = [
    [{ text: "➕ Add Stock", callback_data: "adm_stock_menu" }, { text: "💰 Change Product Price", callback_data: "adm_change_price_menu" }],
    [{ text: "➕ Add New Product", callback_data: "adm_add_product" }, { text: "📋 Manage Products & Stock", callback_data: "adm_manage_products" }],
    [{ text: "💱 Set 1$ = BDT Rate", callback_data: "adm_set_usd_rate" }, { text: "🔗 External Bot API Sync", callback_data: "adm_api_sync_menu" }],
    [{ text: "👥 Referral Commission %", callback_data: "adm_referral_settings" }, { text: "📞 Set Support Contact", callback_data: "adm_support_contact" }],
    [{ text: "⚙️ Update Payment Accounts", callback_data: "adm_payment_settings" }],
    [{ text: "📢 Send Broadcast Message", callback_data: "adm_broadcast" }],
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

// 5. Profile & Wallet
async function sendProfile(env, chatId, user, editMessageId = null) {
  const rate = parseFloat(await getSetting(env, "usd_rate_bdt", "125")) || 125;
  const bdtBal = user ? (user.balance_bdt || 0).toFixed(2) : "0.00";
  const usdBal = (parseFloat(bdtBal) / rate).toFixed(2);

  const profileText = `👤 <b>User Profile & Wallet</b>\n\n🆔 <b>User ID:</b> <code>${chatId}</code>\n👤 <b>Name:</b> ${user ? user.first_name : "Customer"}\n\n💰 <b>Wallet Balance:</b>\n• USD: <b>$${usdBal} USDT</b>\n• BDT: <b>৳${bdtBal} BDT</b>\n• <i>Exchange Rate: 1 USD = ৳${rate} BDT</i>\n\n👥 <b>Total Referrals:</b> ${user ? user.total_referrals : 0} members\n🎁 <b>Total Referral Earnings:</b> ৳${user ? (user.total_commission_bdt || 0).toFixed(2) : "0.00"} BDT`;
  const buttons = [
    [{ text: "💰 Deposit Funds", callback_data: "deposit" }],
    [{ text: "📦 Order History", callback_data: "my_orders" }],
    [{ text: "🔙 Main Menu", callback_data: "home" }]
  ];
  const payload = { chat_id: chatId, text: profileText, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

// 6. Deposit Funds
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

// 7. Order History
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

// 8. Refer & Earn (Purchase % Commission)
async function sendRefer(env, chatId, user, editMessageId = null) {
  const botInfo = await sendTelegram(env, "getMe", {});
  const botData = await botInfo.json();
  const botUsername = botData.result ? botData.result.username : "bot";

  const refLink = `https://t.me/${botUsername}?start=ref_${chatId}`;
  const pct = await getSetting(env, "referral_commission_percent", "5");

  const refText = `👥 <b>Refer & Earn Program</b>\n\nInvite friends and earn a lifetime <b>${pct}% commission</b> on every product purchase they complete in our store!\n\n🔗 <b>Your Unique Referral Link:</b>\n<code>${refLink}</code>\n\n📊 <b>Your Referral Statistics:</b>\n• Total Referrals: <b>${user ? user.total_referrals : 0} members</b>\n• Total Commission Earned: <b>৳${user ? (user.total_commission_bdt || 0).toFixed(2) : "0.00"} BDT</b>\n\n*(Share your link on channels, groups, and with your friends)*`;

  const buttons = [
    [{ text: "📤 Share Invite Link", url: `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent("Join the best Digital Products Store on Telegram!")}` }],
    [{ text: "🔙 Main Menu", callback_data: "home" }]
  ];

  const payload = { chat_id: chatId, text: refText, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
  if (editMessageId) { payload.message_id = editMessageId; await sendTelegram(env, "editMessageText", payload); }
  else { await sendTelegram(env, "sendMessage", payload); }
}

// 9. Support (Dynamic Contact)
async function sendSupport(env, chatId, editMessageId = null) {
  const contact = await getSetting(env, "support_contact", "@admin");
  const supText = `🕒 <b>Customer Support & Helpdesk</b>\n\nNeed assistance, custom requests, or have questions regarding your order? Feel free to contact our team.\n\n👤 <b>Support Contact:</b> ${contact}`;
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
