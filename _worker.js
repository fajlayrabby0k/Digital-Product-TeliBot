// ====================================================================
// VEXORIX Store Style Digital Product Selling Telegram Bot
// All-in-One Cloudflare Pages / Workers Single-File Backend
// Features:
// - Category -> Product Catalog Browsing
// - 5 Payment Methods (bKash, Nagad, Rocket, Binance Pay, BEP-20 USDT)
// - Refer & Earn System with unique referral links
// - User Profile & In-Bot Wallet Balance
// - Automated Digital Product Delivery on Admin Approval
// - Full-featured Admin Control Panel
// ====================================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ১. ব্রাউজার থেকে ১-ক্লিকে ডাটাবেজ টেবিল ও ডেমো ডাটা সেটআপ (/api/setup)
    if (url.pathname === "/api/setup") {
      try {
        if (!env.DB) {
          return new Response(JSON.stringify({ error: "D1 database binding 'DB' পাওয়া যায়নি। Pages Settings-এ DB চেক করুন।" }), {
            status: 500,
            headers: { "Content-Type": "application/json; charset=utf-8" }
          });
        }
        await setupDatabase(env.DB);
        return new Response(
          JSON.stringify({
            success: true,
            message: "অভিনন্দন! VEXORIX স্টাইল বটের সব ডাটাবেজ টেবিল, সেটিংস ও ডেমো প্রোডাক্ট সফলভাবে তৈরি হয়েছে।"
          }),
          { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } }
        );
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        });
      }
    }

    // ২. টেলিগ্রাম Webhook হ্যান্ডলার (POST রিকোয়েস্ট)
    if (request.method === "POST") {
      try {
        const update = await request.json();
        await handleUpdate(update, env);
      } catch (err) {
        console.error("Webhook Update Error:", err);
      }
      return new Response("OK", { status: 200 });
    }

    // ৩. ব্রাউজারে সাইট খুললে স্ট্যাটাস পেজ
    return new Response("🤖 VEXORIX Style Telegram Digital Shop Bot is Active and Running!", { status: 200 });
  }
};

// ====================================================================
// ডাটাবেজ স্কিমা সেটআপ
// ====================================================================
async function setupDatabase(db) {
  const schema = [
    // ইউজার ও ওয়ালেট টেবিল
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

    // ক্যাটাগরি টেবিল
    `CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      is_active INTEGER DEFAULT 1
    );`,

    // প্রোডাক্ট টেবিল
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

    // স্টক (লাইসেন্স কি / একাউন্ট / ফাইল লিংক)
    `CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
      item_data TEXT NOT NULL,
      is_sold INTEGER DEFAULT 0,
      order_id INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );`,

    // অর্ডার টেবিল
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

    // বট কনফিগ ও সেটিংস টেবিল
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );`,

    // ডেমো ক্যাটাগরি
    `INSERT OR IGNORE INTO categories (id, name) VALUES 
      (1, '🔥 Software & License Keys'),
      (2, '⚡ Premium Subscriptions & VPN'),
      (3, '💎 Social Media & Gaming Accounts');`,

    // ডেমো প্রোডাক্ট
    `INSERT OR IGNORE INTO products (id, category_id, name, description, price_bdt, price_usd) VALUES 
      (1, 1, 'Windows 11 Pro Retail Key', 'Lifetime Retail Online Activation Key (1 PC)', 500, 4.5),
      (2, 1, 'Internet Download Manager (IDM)', '1 Year Official Registration License', 750, 7.0),
      (3, 2, 'Telegram Premium 1 Month', 'Direct Gift link activation without login', 450, 4.0),
      (4, 2, 'NordVPN 1 Year Account', 'Premium Shared Login with warranty', 600, 5.5);`,

    // ডেমো স্টক
    `INSERT OR IGNORE INTO inventory (id, product_id, item_data) VALUES 
      (1, 1, 'W269N-WFGWX-YVC9B-4J6C9-T83GX'),
      (2, 1, 'VK7JG-NPHTM-C97JM-9MPGT-3V66T'),
      (3, 2, 'IDM-KEY-9821-3948-2831-9238'),
      (4, 3, 'https://t.me/giftcode/demo-telegram-premium-link-1234'),
      (5, 4, 'Email: norduser@gmail.com | Pass: NordPass#2026');`,

    // ডিফল্ট রেফারাল বোনাস (প্রতি রেফারে ৫ টাকা)
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('referral_bonus_bdt', '5');`
  ];

  for (const q of schema) {
    await db.prepare(q).run();
  }
}

// ====================================================================
// মূল বট আপডেট হ্যান্ডলার
// ====================================================================
async function handleUpdate(update, env) {
  // ১. ইউজার টেক্সট মেসেজ ও কমান্ড হ্যান্ডলার
  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat.id;
    const text = (msg.text || "").trim();
    const from = msg.from;
    const username = from.username ? `@${from.username}` : (from.first_name || "Customer");

    // ইউজার প্রোফাইল ডাটাবেজে সংরক্ষণ বা লোড করা
    let user = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(chatId).first();
    if (!user) {
      // রেফার কোড চেক করা (যেমন: /start ref_123456789)
      let referrerId = 0;
      if (text.startsWith("/start ref_")) {
        const refParts = text.split("ref_");
        if (refParts.length > 1) {
          referrerId = parseInt(refParts[1]) || 0;
          if (referrerId === chatId) referrerId = 0; // নিজের রেফার নিজে নয়
        }
      }

      await env.DB.prepare(
        "INSERT INTO users (user_id, username, first_name, referred_by) VALUES (?, ?, ?, ?)"
      ).bind(chatId, username, from.first_name || "", referrerId).run();

      user = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(chatId).first();

      // রেফারারকে বোনাস প্রদান ও নোটিফিকেশন
      if (referrerId > 0) {
        const refBonusRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'referral_bonus_bdt'").first();
        const bonusAmount = refBonusRow ? parseFloat(refBonusRow.value) : 5;

        await env.DB.prepare(
          "UPDATE users SET balance_bdt = balance_bdt + ?, total_referrals = total_referrals + 1 WHERE user_id = ?"
        ).bind(bonusAmount, referrerId).run();

        await sendTelegram(env, "sendMessage", {
          chat_id: referrerId,
          text: `🎉 **অভিনন্দন!**\nআপনার রেফারেল লিংকের মাধ্যমে একজন নতুন মেম্বার (${username}) যুক্ত হয়েছেন!\n💰 আপনার ওয়ালেটে **৳${bonusAmount} BDT** বোনাস যোগ করা হয়েছে।`,
          parse_mode: "Markdown"
        });
      }
    }

    // /start কমান্ড -> মূল হোম ড্যাশবোর্ড
    if (text.startsWith("/start")) {
      await sendHomeDashboard(env, chatId, user, username);
      return;
    }

    // /admin কমান্ড
    if (text === "/admin") {
      if (String(chatId) !== String(env.ADMIN_ID)) {
        await sendTelegram(env, "sendMessage", { chat_id: chatId, text: "⛔ দুঃখিত, আপনি এই বটের অ্যাডমিন নন।" });
        return;
      }
      await sendAdminDashboard(env, chatId);
      return;
    }

    // অ্যাডমিন কমান্ড: স্টক যোগ করা (/addstock <product_id> <item_data>)
    if (text.startsWith("/addstock") && String(chatId) === String(env.ADMIN_ID)) {
      const parts = text.split(" ");
      if (parts.length >= 3) {
        const prodId = parts[1];
        const itemData = parts.slice(2).join(" ");
        await env.DB.prepare("INSERT INTO inventory (product_id, item_data) VALUES (?, ?)").bind(prodId, itemData).run();
        await sendTelegram(env, "sendMessage", { chat_id: chatId, text: `✅ প্রোডাক্ট #${prodId} তে নতুন স্টক সফলভাবে যোগ করা হয়েছে!` });
      } else {
        await sendTelegram(env, "sendMessage", { chat_id: chatId, text: "⚠️ ফরম্যাট ভুল হয়েছে!\nব্যবহার করুন: `/addstock <প্রোডাক্ট_আইডি> <কি বা ডাটা>`\nউদাহরণ: `/addstock 1 ABCDE-12345-XYZ`", parse_mode: "Markdown" });
      }
      return;
    }

    // অ্যাডমিন কমান্ড: ব্রডকাস্ট মেসেজ পাঠানো (/broadcast <মেসেজ>)
    if (text.startsWith("/broadcast") && String(chatId) === String(env.ADMIN_ID)) {
      const bMsg = text.replace("/broadcast", "").trim();
      if (!bMsg) {
        await sendTelegram(env, "sendMessage", { chat_id: chatId, text: "⚠️ ব্যবহার: `/broadcast আপনার মেসেজ এখানে লিখুন`", parse_mode: "Markdown" });
        return;
      }
      const { results: allUsers } = await env.DB.prepare("SELECT user_id FROM users").all();
      let sentCount = 0;
      for (const u of allUsers) {
        try {
          await sendTelegram(env, "sendMessage", { chat_id: u.user_id, text: `📢 **জরুরি নোটিফিকেশন:**\n\n${bMsg}`, parse_mode: "Markdown" });
          sentCount++;
        } catch (e) {}
      }
      await sendTelegram(env, "sendMessage", { chat_id: chatId, text: `✅ মোট ${sentCount} জন ইউজারের কাছে নোটিফিকেশন পাঠানো হয়েছে!` });
      return;
    }

    // কাস্টমার TrxID / TxHash রিপ্লাই দিলে
    if (msg.reply_to_message && msg.reply_to_message.text && msg.reply_to_message.text.includes("অর্ডার আইডি:")) {
      const replyText = msg.reply_to_message.text;
      const match = replyText.match(/অর্ডার আইডি:\s*#(\d+)/);
      if (match) {
        const orderId = match[1];
        const trxId = text;

        await env.DB.prepare("UPDATE orders SET trx_id = ? WHERE id = ?").bind(trxId, orderId).run();

        await sendTelegram(env, "sendMessage", {
          chat_id: chatId,
          text: `✅ **ধন্যবাদ! আপনার ট্রানজেকশন তথ্য গ্রহণ করা হয়েছে।**\n\nঅর্ডার আইডি: #${orderId}\nTrxID/Hash: \`${trxId}\`\n\nএডমিন ভেরিফাই করলেই আপনার প্রোডাক্ট অটোমেটিক ইনবক্সে চলে আসবে।`,
          parse_mode: "Markdown"
        });

        // অ্যাডমিনকে নোটিফিকেশন ও অ্যাপ্রুভ বাটন
        const order = await env.DB.prepare(
          "SELECT o.*, p.name as product_name FROM orders o JOIN products p ON o.product_id = p.id WHERE o.id = ?"
        ).bind(orderId).first();

        if (order) {
          const adminNotice = `🚨 **নতুন পেমেন্ট রিকোয়েস্ট!**\n\nঅর্ডার আইডি: #${order.id}\nপণ্য: **${order.product_name}**\nমেথড: **${order.payment_method}**\nপরিমাণ: **${order.amount} ${order.currency}**\nTrxID / Hash: \`${trxId}\`\nকাস্টমার: ${order.username} (ID: \`${order.user_id}\`)`;
          
          const adminKeyboard = {
            inline_keyboard: [
              [
                { text: "✅ অনুমোদন (Approve)", callback_data: `admin_approve_${orderId}` },
                { text: "❌ বাতিল (Reject)", callback_data: `admin_reject_${orderId}` }
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

  // ২. বাটন ক্লিকের হ্যান্ডলার (Inline Keyboard Callbacks)
  if (update.callback_query) {
    const cb = update.callback_query;
    const data = cb.data;
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;

    let user = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(chatId).first();
    const username = cb.from.username ? `@${cb.from.username}` : (cb.from.first_name || "Customer");

    // হোম মেনু
    if (data === "home") {
      await sendHomeDashboard(env, chatId, user, username, messageId);
      return;
    }

    // ক্যাটাগরি তালিকা (প্রথমে ক্যাটাগরি শো করবে)
    if (data === "categories") {
      const { results } = await env.DB.prepare("SELECT * FROM categories WHERE is_active = 1").all();
      const buttons = results.map(c => [{ text: `📁 ${c.name}`, callback_data: `cat_${c.id}` }]);
      buttons.push([{ text: "🔙 প্রধান মেনু", callback_data: "home" }]);

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: "📂 **প্রোডাক্ট ক্যাটাগরি নির্বাচন করুন:**\n\nআপনি যে ধরনের প্রোডাক্ট খুঁজছেন, নিচের তালিকা থেকে সেই ক্যাটাগরিতে ক্লিক করুন:",
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: buttons }
      });
      return;
    }

    // নির্দিষ্ট ক্যাটাগরির প্রোডাক্টসমূহ
    if (data.startsWith("cat_")) {
      const catId = data.split("_")[1];
      const cat = await env.DB.prepare("SELECT * FROM categories WHERE id = ?").bind(catId).first();
      const { results } = await env.DB.prepare("SELECT * FROM products WHERE category_id = ? AND is_active = 1").all();

      const buttons = results.map(p => [{ text: `🔹 ${p.name} - ৳${p.price_bdt}`, callback_data: `prod_${p.id}` }]);
      buttons.push([{ text: "🔙 ক্যাটাগরি তালিকা", callback_data: "categories" }]);

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `📂 ক্যাটাগরি: **${cat ? cat.name : "প্রোডাক্টস"}**\n\nযে প্রোডাক্টটি কিনতে চান সেটিতে ক্লিক করুন:`,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: buttons }
      });
      return;
    }

    // প্রোডাক্টের বিস্তারিত বিবরণ ও স্টক
    if (data.startsWith("prod_")) {
      const prodId = data.split("_")[1];
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      const stock = await env.DB.prepare("SELECT COUNT(*) as count FROM inventory WHERE product_id = ? AND is_sold = 0").bind(prodId).first();

      const stockCount = stock ? stock.count : 0;
      const details = `📦 **${prod.name}**\n\n📝 **বিবরণ:**\n${prod.description}\n\n💵 **মূল্য:** ৳${prod.price_bdt} BDT / $${prod.price_usd} USD\n📊 **বর্তমান স্টক:** ${stockCount > 0 ? `✅ ${stockCount} টি এভেইলেবল` : '❌ স্টক শেষ'}`;
      
      const buttons = [];
      if (stockCount > 0) {
        buttons.push([{ text: "🛒 সরাসরি কিনুন (Direct Buy)", callback_data: `buy_${prod.id}` }]);
        buttons.push([{ text: "💳 ওয়ালেট ব্যালেন্স দিয়ে কিনুন", callback_data: `pay_wallet_${prod.id}` }]);
      } else {
        buttons.push([{ text: "❌ স্টক শেষ (Out of Stock)", callback_data: "none" }]);
      }
      buttons.push([{ text: "🔙 ব্যাক", callback_data: `cat_${prod.category_id}` }]);

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: details,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: buttons }
      });
      return;
    }

    // ওয়ালেট ব্যালেন্স দিয়ে তাৎক্ষণিক ক্রয়
    if (data.startsWith("pay_wallet_")) {
      const prodId = data.replace("pay_wallet_", "");
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();

      if (!user || user.balance_bdt < prod.price_bdt) {
        const notEnough = `❌ **অপর্যাপ্ত ব্যালেন্স!**\n\nএই প্রোডাক্টের মূল্য: ৳${prod.price_bdt} BDT\nআপনার বর্তমান ব্যালেন্স: ৳${user ? user.balance_bdt : 0} BDT\n\nঅনুগ্রহ করে 'অ্যাড মানি' অপশন থেকে ওয়ালেটে টাকা যোগ করুন অথবা সরাসরি পেমেন্ট করে কিনুন।`;
        const buttons = [
          [{ text: "➕ অ্যাড মানি / ডিপোজিট", callback_data: "deposit" }],
          [{ text: "🛒 সরাসরি কিনুন", callback_data: `buy_${prod.id}` }],
          [{ text: "🔙 ব্যাক", callback_data: `prod_${prod.id}` }]
        ];
        await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: notEnough, parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } });
        return;
      }

      // স্টক নেওয়া
      const item = await env.DB.prepare("SELECT * FROM inventory WHERE product_id = ? AND is_sold = 0 LIMIT 1").bind(prodId).first();
      if (!item) {
        await sendTelegram(env, "sendMessage", { chat_id: chatId, text: "❌ দুঃখিত, এই প্রোডাক্টের স্টক মুহূর্তে শেষ হয়ে গেছে!" });
        return;
      }

      // ব্যালেন্স কাটা, স্টক সোল্ড মার্ক ও অর্ডার কমপ্লিট করা
      await env.DB.prepare("UPDATE users SET balance_bdt = balance_bdt - ? WHERE user_id = ?").bind(prod.price_bdt, chatId).run();
      await env.DB.prepare("UPDATE inventory SET is_sold = 1 WHERE id = ?").bind(item.id).run();
      await env.DB.prepare(
        "INSERT INTO orders (user_id, username, product_id, payment_method, trx_id, amount, currency, status) VALUES (?, ?, ?, 'Wallet', 'WALLET-PURCHASE', ?, 'BDT', 'completed')"
      ).bind(chatId, username, prodId, prod.price_bdt).run();

      const successMsg = `🎉 **অর্ডার সফল হয়েছে!**\n\nপণ্য: **${prod.name}**\nকেটে নেওয়া হয়েছে: ৳${prod.price_bdt} BDT\n\n🔑 **আপনার ডিজিটাল প্রোডাক্ট / কোড:**\n\`${item.item_data}\`\n\nআমাদের স্টোর ব্যবহার করার জন্য ধন্যবাদ! ❤️`;
      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: successMsg,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "🛍️ আরও কেনাকাটা করুন", callback_data: "categories" }]] }
      });
      return;
    }

    // সরাসরি পেমেন্ট মেথড বাছাই (৫টি মেথড)
    if (data.startsWith("buy_")) {
      const prodId = data.split("_")[1];
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();

      const choosePay = `💳 **পেমেন্ট মেথড পছন্দ করুন:**\n\nপ্রোডাক্ট: **${prod.name}**\nমূল্য: **৳${prod.price_bdt} BDT** অথবা **$${prod.price_usd} USD**\n\nআপনি কোন মাধ্যমে পেমেন্ট করতে চান তা সিলেক্ট করুন:`;
      const buttons = [
        [{ text: "📱 বিকাশ (bKash)", callback_data: `pay_${prodId}_bKash` }, { text: "📱 নগদ (Nagad)", callback_data: `pay_${prodId}_Nagad` }],
        [{ text: "📱 রকেট (Rocket)", callback_data: `pay_${prodId}_Rocket` }],
        [{ text: "🟡 Binance Pay", callback_data: `pay_${prodId}_BinancePay` }, { text: "🌐 USDT (BEP-20)", callback_data: `pay_${prodId}_BEP20` }],
        [{ text: "🔙 ব্যাক", callback_data: `prod_${prodId}` }]
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

    // পেমেন্টের নাম্বার প্রদান ও নির্দেশ
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
      if (method === "bKash") instruction = `📱 **বিকাশ নাম্বার (Send Money):**\n\`${env.BKASH_NUM || "017XXXXXXXX"}\`\nটাকার পরিমাণ: **৳${amount}**`;
      else if (method === "Nagad") instruction = `📱 **নগদ নাম্বার (Send Money):**\n\`${env.NAGAD_NUM || "017XXXXXXXX"}\`\nটাকার পরিমাণ: **৳${amount}**`;
      else if (method === "Rocket") instruction = `📱 **রকেট নাম্বার:**\n\`${env.ROCKET_NUM || "017XXXXXXXX"}\`\nটাকার পরিমাণ: **৳${amount}**`;
      else if (method === "BinancePay") instruction = `🟡 **Binance Pay ID:**\n\`${env.BINANCE_PAY_ID || "12345678"}\`\nপরিমাণ: **$${amount} USDT**`;
      else if (method === "BEP20") instruction = `🌐 **USDT BEP-20 Wallet Address:**\n\`${env.BEP20_ADDRESS || "0x1234..."}\`\nপরিমাণ: **$${amount} USDT**`;

      const promptMsg = `📌 **অর্ডার আইডি: #${orderId}**\nপণ্য: **${prod.name}**\n\n${instruction}\n\n⚠️ **পেমেন্ট করার পর:**\nএই মেসেজটির উপর **Reply (উত্তর)** দিয়ে আপনার TrxID অথবা Transaction Hash টি লিখে পাঠান।`;

      await sendTelegram(env, "sendMessage", {
        chat_id: chatId,
        text: promptMsg,
        parse_mode: "Markdown"
      });
      return;
    }

    // রেফার অ্যান্ড আর্ন মেনু
    if (data === "refer") {
      const botInfo = await sendTelegram(env, "getMe", {});
      const botData = await botInfo.json();
      const botUsername = botData.result ? botData.result.username : "bot";

      const refLink = `https://t.me/${botUsername}?start=ref_${chatId}`;
      const refBonusRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'referral_bonus_bdt'").first();
      const bonus = refBonusRow ? refBonusRow.value : "5";

      const refText = `👥 **রেফার অ্যান্ড আর্ন প্রোগ্রাম (Refer & Earn)**\n\nআপনার রেফারেল লিংক ব্যবহার করে বন্ধুদের জয়েন করান এবং প্রতি রেফারে জিতে নিন **৳${bonus} BDT** ইনস্ট্যান্ট ব্যালেন্স!\n\n🔗 **আপনার রেফারাল লিংক:**\n\`${refLink}\`\n\n📊 **আপনার রেফারেল স্ট্যাটাস:**\n• মোট সফল রেফার: **${user ? user.total_referrals : 0} জন**\n• মোট অর্জিত বোনাস: **৳${(user ? user.total_referrals : 0) * parseFloat(bonus)} BDT**\n\n*(লিংকটি কপি করে আপনার বন্ধুদের এবং সোশ্যাল মিডিয়ায় শেয়ার করুন)*`;

      const buttons = [
        [{ text: "📤 লিংক শেয়ার করুন", url: `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent("এখানে সেরা ডিজিটাল প্রোডাক্ট পেয়ে যাবেন কম দামে!")}` }],
        [{ text: "🔙 প্রধান মেনু", callback_data: "home" }]
      ];

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: refText,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: buttons }
      });
      return;
    }

    // প্রোফাইল ও ওয়ালেট
    if (data === "profile") {
      const profileText = `👤 **ব্যবহারকারীর প্রোফাইল ও ওয়ালেট**\n\n🆔 আইডি: \`${chatId}\`\n👤 নাম: ${user ? user.first_name : "User"}\n\n💰 **বর্তমান ব্যালেন্স:**\n• BDT: **৳${user ? user.balance_bdt.toFixed(2) : "0.00"}**\n• USD: **$${user ? user.balance_usd.toFixed(2) : "0.00"}**\n\n👥 মোট রেফারেল: **${user ? user.total_referrals : 0} জন**`;
      
      const buttons = [
        [{ text: "➕ অ্যাড মানি / ডিপোজিট", callback_data: "deposit" }],
        [{ text: "📦 আমার অর্ডার হিস্ট্রি", callback_data: "my_orders" }],
        [{ text: "🔙 প্রধান মেনু", callback_data: "home" }]
      ];

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: profileText,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: buttons }
      });
      return;
    }

    // অ্যাড মানি / ডিপোজিট নির্দেশ
    if (data === "deposit") {
      const depText = `💳 **ওয়ালেটে টাকা অ্যাড করার নিয়ম:**\n\nনিচের যেকোনো মাধ্যমে টাকা পাঠিয়ে অ্যাডমিনের সাথে ট্রানজেকশন আইডি শেয়ার করুন:\n\n• বিকাশ: \`${env.BKASH_NUM || "017XXXXXXXX"}\`\n• নগদ: \`${env.NAGAD_NUM || "017XXXXXXXX"}\`\n• রকেট: \`${env.ROCKET_NUM || "017XXXXXXXX"}\`\n• Binance Pay: \`${env.BINANCE_PAY_ID || "12345678"}\`\n• BEP-20 (USDT): \`${env.BEP20_ADDRESS || "0x..."}\`\n\nপেমেন্ট সম্পন্ন করে অ্যাডমিনকে TrxID দিলে আপনার ব্যালেন্স যুক্ত করে দেওয়া হবে।`;
      const buttons = [
        [{ text: "📞 অ্যাডমিনের সাথে যোগাযোগ", callback_data: "support" }],
        [{ text: "🔙 প্রোফাইল", callback_data: "profile" }]
      ];
      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: depText, parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } });
      return;
    }

    // অ্যাডমিন অনুমোদন (Approve)
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
            text: `🎉 **অভিনন্দন! আপনার পেমেন্ট অনুমোদিত হয়েছে।**\n\nঅর্ডার আইডি: #${orderId}\n\n🔑 **আপনার ডিজিটাল প্রোডাক্ট / কোড:**\n\`${item.item_data}\`\n\nআমাদের সাথে থাকার জন্য ধন্যবাদ! ❤️`,
            parse_mode: "Markdown"
          });

          await sendTelegram(env, "editMessageText", {
            chat_id: chatId,
            message_id: messageId,
            text: `✅ **অর্ডার #${orderId} অনুমোদিত ও প্রোডাক্ট তাৎক্ষণিক ডেলিভারি দেওয়া হয়েছে!**`,
            parse_mode: "Markdown"
          });
        } else {
          await sendTelegram(env, "sendMessage", { chat_id: chatId, text: `⚠️ অর্ডার #${orderId} অ্যাপ্রুভ করা যায়নি। স্টকে কোনো আইটেম নেই!` });
        }
      }
      return;
    }

    // অ্যাডমিন বাতিল (Reject)
    if (data.startsWith("admin_reject_")) {
      const orderId = data.replace("admin_reject_", "");
      await env.DB.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").bind(orderId).run();
      const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first();

      if (order) {
        await sendTelegram(env, "sendMessage", {
          chat_id: order.user_id,
          text: `❌ **দুঃখিত! আপনার অর্ডার #${orderId} টি বাতিল করা হয়েছে।**\n\nআপনার পেমেন্ট ট্রানজেকশন মেলেনি।`
        });
      }

      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `❌ **অর্ডার #${orderId} বাতিল করা হয়েছে।**`
      });
      return;
    }

    // আমার অর্ডারসমূহ
    if (data === "my_orders") {
      const { results } = await env.DB.prepare(
        "SELECT o.*, p.name as product_name, i.item_data FROM orders o JOIN products p ON o.product_id = p.id LEFT JOIN inventory i ON o.id = i.order_id WHERE o.user_id = ? AND o.status = 'completed' ORDER BY o.id DESC LIMIT 5"
      ).bind(chatId).all();

      let orderText = "📦 **আপনার সফল অর্ডারসমূহ:**\n\n";
      if (!results || results.length === 0) {
        orderText += "আপনি এখনও কোনো প্রোডাক্ট সফলভাবে ক্রয় করেননি।";
      } else {
        results.forEach(o => {
          orderText += `🔹 **${o.product_name}**\nঅর্ডার: #${o.id} | মূল্য: ${o.amount} ${o.currency}\nকোড/লিংক: \`${o.item_data || "Delivered"}\`\n\n`;
        });
      }

      const buttons = [[{ text: "🔙 প্রধান মেনু", callback_data: "home" }]];
      await sendTelegram(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: orderText,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: buttons }
      });
      return;
    }

    // সাপোর্ট
    if (data === "support") {
      const supText = `📞 **কাস্টমার সাপোর্ট ও হেল্পলাইন**\n\nযেকোনো সমস্যায় আমাদের সাথে সরাসরি টেলিগ্রামে যোগাযোগ করুন।\n\nএডমিন আইডি: ${env.ADMIN_ID ? `@admin` : "Not Set"}`;
      const buttons = [[{ text: "🔙 প্রধান মেনু", callback_data: "home" }]];
      await sendTelegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: supText, reply_markup: { inline_keyboard: buttons } });
      return;
    }

    // অ্যাডমিন প্যানেল ভিউ
    if (data === "admin_panel") {
      if (String(chatId) === String(env.ADMIN_ID)) {
        await sendAdminDashboard(env, chatId, messageId);
      }
      return;
    }
  }
}

// ====================================================================
// সহায়ক ফাংশনসমূহ (UI Helpers)
// ====================================================================

// মূল হোম ড্যাশবোর্ড পাঠানো
async function sendHomeDashboard(env, chatId, user, username, editMessageId = null) {
  const bdtBal = user ? (user.balance_bdt || 0).toFixed(2) : "0.00";
  const usdBal = user ? (user.balance_usd || 0).toFixed(2) : "0.00";
  const refs = user ? (user.total_referrals || 0) : 0;

  const welcome = `👋 স্বাগতম **${username}** আমাদের অফিসিয়াল ডিজিটাল স্টোরে!\n\n🆔 আইডি: \`${chatId}\`\n💰 ওয়ালেট ব্যালেন্স: **৳${bdtBal} BDT** | **$${usdBal} USD**\n👥 মোট রেফার: **${refs} জন**\n\nনিচের মেনু থেকে আপনার পছন্দের অপশনটি বেছে নিন 👇`;

  const keyboard = [
    [{ text: "🛍️ প্রোডাক্ট ক্যাটাগরি", callback_data: "categories" }],
    [{ text: "💳 ডিপোজিট / অ্যাড মানি", callback_data: "deposit" }, { text: "👤 প্রোফাইল ও ওয়ালেট", callback_data: "profile" }],
    [{ text: "👥 রেফার অ্যান্ড আর্ন", callback_data: "refer" }, { text: "📦 আমার অর্ডারসমূহ", callback_data: "my_orders" }],
    [{ text: "📞 হেল্পলাইন ও সাপোর্ট", callback_data: "support" }]
  ];

  if (String(chatId) === String(env.ADMIN_ID)) {
    keyboard.push([{ text: "👑 অ্যাডমিন প্যানেল", callback_data: "admin_panel" }]);
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

// অ্যাডমিন ড্যাশবোর্ড পাঠানো
async function sendAdminDashboard(env, chatId, editMessageId = null) {
  const totalUsers = await env.DB.prepare("SELECT COUNT(*) as count FROM users").first();
  const totalOrders = await env.DB.prepare("SELECT COUNT(*) as count FROM orders").first();
  const completed = await env.DB.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'completed'").first();
  const pending = await env.DB.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'").first();
  const stock = await env.DB.prepare("SELECT COUNT(*) as count FROM inventory WHERE is_sold = 0").first();

  const report = `👑 **VEXORIX অ্যাডমিন কন্ট্রোল প্যানেল**\n\n📊 **স্টোর পরিসংখ্যান:**\n• মোট ইউজার: ${totalUsers ? totalUsers.count : 0} জন\n• মোট অর্ডার: ${totalOrders ? totalOrders.count : 0} টি\n• সফল ডেলিভারি: ${completed ? completed.count : 0} টি\n• অপেক্ষমান (Pending): ${pending ? pending.count : 0} টি\n• অবিক্রিত স্টক: ${stock ? stock.count : 0} টি\n\n🛠️ **কুইক কমান্ড:**\n• স্টক যোগ করতে: \`/addstock <id> <key>\`\n• নোটিফিকেশন পাঠাতে: \`/broadcast <মেসেজ>\``;

  const buttons = [
    [{ text: "🛍️ প্রোডাক্ট লিস্ট ও স্টক দেখুন", callback_data: "categories" }],
    [{ text: "🔙 প্রধান মেনু", callback_data: "home" }]
  ];

  const payload = {
    chat_id: chatId,
    text: report,
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: buttons }
  };

  if (editMessageId) {
    payload.message_id = editMessageId;
    await sendTelegram(env, "editMessageText", payload);
  } else {
    await sendTelegram(env, "sendMessage", payload);
  }
}

// টেলিগ্রাম API রিকোয়েস্ট ফাংশন
async function sendTelegram(env, method, payload) {
  if (!env.BOT_TOKEN) return;
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`;
  return await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}
