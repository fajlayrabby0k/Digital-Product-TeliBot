// ====================================================================
// SMART SUBS STORE - Complete All-in-One Cloudflare Worker
// Features: Force Join, Pre-Orders, % Profit Margin, Icons, VEXORIX API,
// Zero [API] Tag, Referral Program, Button-Driven Admin Panel.
// ====================================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. Setup Database & Register Bot Commands (No /home command)
    if (url.pathname === "/api/setup") {
      try {
        if (!env.DB) return new Response(JSON.stringify({ error: "D1 database binding 'DB' not found." }), { status: 500 });
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

    // 2. Mock External Provider API for instant testing
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
