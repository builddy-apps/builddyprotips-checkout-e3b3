/**
 * Builddy SaaS Scaffold — Frontend App
 * Auth client, API client, router, dark mode, toast notifications.
 *
 * Modification Points:
 *   // {{API_METHODS_INSERTION_POINT}}  — Add custom API methods here
 *   // {{RENDER_INSERTION_POINT}}       — Add custom page renderers here
 */

(function () {
  "use strict";

  const API_BASE = "/api";
  const TOKEN_KEY = "builddy_access_token";
  const REFRESH_KEY = "builddy_refresh_token";
  const USER_KEY = "builddy_user";

  // --- Toast ---
  function showToast(msg, type = "info", dur = 4000) {
    const c = document.getElementById("toastContainer");
    const colors = { success: "bg-green-500", error: "bg-red-500", info: "bg-blue-500", warning: "bg-yellow-500 text-black" };
    const t = document.createElement("div");
    t.className = `${colors[type] || colors.info} text-white px-4 py-3 rounded-lg shadow-lg toast-enter`;
    t.innerHTML = `<span>${msg}</span>`;
    c.appendChild(t);
    setTimeout(() => { t.classList.add("toast-exit"); setTimeout(() => t.remove(), 300); }, dur);
  }

  // --- Auth ---
  const Auth = {
    getToken: () => localStorage.getItem(TOKEN_KEY),
    getRefreshToken: () => localStorage.getItem(REFRESH_KEY),
    getUser: () => { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } },
    setTokens: (a, r) => { localStorage.setItem(TOKEN_KEY, a); if (r) localStorage.setItem(REFRESH_KEY, r); },
    setUser: (u) => localStorage.setItem(USER_KEY, JSON.stringify(u)),
    clear: () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(REFRESH_KEY); localStorage.removeItem(USER_KEY); },
    isAuthenticated: () => { try { const p=JSON.parse(atob((Auth.getToken()||"").split(".")[1].replace(/-/g,"+").replace(/_/g,"/"))); return p.exp > Date.now()/1000; } catch { return false; } },
    login: async (email, pw) => {
      const r = await fetch(`${API_BASE}/auth/login`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({email,password:pw}) });
      const d = await r.json(); if (!r.ok||!d.success) throw new Error(d.error||"Login failed");
      Auth.setTokens(d.data.accessToken, d.data.refreshToken); Auth.setUser(d.data.user); return d.data;
    },
    register: async ({email,password,name}) => {
      const r = await fetch(`${API_BASE}/auth/register`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({email,password,name}) });
      const d = await r.json(); if (!r.ok||!d.success) throw new Error(d.error||"Registration failed");
      Auth.setTokens(d.data.accessToken, d.data.refreshToken); Auth.setUser(d.data.user); return d.data;
    },
    refresh: async () => {
      const rt = Auth.getRefreshToken(); if (!rt) { Auth.clear(); return null; }
      try {
        const r = await fetch(`${API_BASE}/auth/refresh`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({refreshToken:rt}) });
        const d = await r.json(); if (!r.ok||!d.success) { Auth.clear(); return null; }
        Auth.setTokens(d.data.accessToken, d.data.refreshToken); Auth.setUser(d.data.user); return d.data.accessToken;
      } catch { Auth.clear(); return null; }
    },
    logout: async () => { try { await fetch(`${API_BASE}/auth/logout`, { method:"POST", headers:{"Content-Type":"application/json","Authorization":`Bearer ${Auth.getToken()}`}, body:JSON.stringify({refreshToken:Auth.getRefreshToken()}) }); } catch {} Auth.clear(); },
  };

  // --- API Client ---
  async function apiFetch(endpoint, options = {}) {
    const token = Auth.getToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const config = { headers, ...options };
    if (config.body && typeof config.body === "object") config.body = JSON.stringify(config.body);
    let response = await fetch(`${API_BASE}${endpoint}`, config);
    if (response.status === 401) {
      const newToken = await Auth.refresh();
      if (newToken) { config.headers["Authorization"] = `Bearer ${newToken}`; response = await fetch(`${API_BASE}${endpoint}`, config); }
      else { Auth.clear(); window.location.href = "/login"; throw new Error("Session expired"); }
    }
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  const api = {
    getItems: (page=1) => apiFetch(`/items?page=${page}`),
    getItem: (id) => apiFetch(`/items/${id}`),
    createItem: (data) => apiFetch("/items", { method: "POST", body: data }),
    updateItem: (id, data) => apiFetch(`/items/${id}`, { method: "PUT", body: data }),
    deleteItem: (id) => apiFetch(`/items/${id}`, { method: "DELETE" }),
    getProfile: () => apiFetch("/auth/me"),
    health: () => apiFetch("/health"),
    // {{API_METHODS_INSERTION_POINT}}
    fetchProductInfo: () => apiFetch("/product"),
    createCheckoutSession: (name, email) => apiFetch("/payments/checkout", { method: "POST", body: { name, email } }),
    checkOrderStatus: (orderId) => apiFetch(`/orders/${orderId}`),
  };

  // --- Router ---
  const pages = {};
  let currentPage = "dashboard";
  function registerPage(name, renderer) { pages[name] = renderer; }
  async function navigateTo(page) {
    currentPage = page;
    document.getElementById("pageTitle").textContent = page.charAt(0).toUpperCase() + page.slice(1);
    document.querySelectorAll(".nav-link").forEach((l) => {
      const active = l.dataset.page === page;
      l.className = active ? "nav-link flex items-center gap-3 px-3 py-2 rounded-lg text-white bg-blue-600 dark:bg-blue-500 font-medium"
        : "nav-link flex items-center gap-3 px-3 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700";
    });
    if (pages[page]) await pages[page](); else renderDashboard();
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("sidebarOverlay").classList.add("hidden");
  }

  // --- Product Page Helpers ---
  let productData = null;

  function renderProductInfo(data) {
    productData = data;
    const main = document.getElementById("mainContent");
    const bullets = [
      "How to ship your first app in 30 days or less",
      "The exact tools and stack the pros use to build fast",
      "Pricing strategies that maximize your recurring revenue",
      "Growth hacks to get your first 100 paying customers",
      "Common mistakes that kill indie projects (and how to avoid them)",
      "A step-by-step launch checklist used by top creators"
    ];
    const reviews = [
      { name: "Sarah K.", role: "Indie Hacker", stars: 5, text: "This guide literally changed how I approach building products. Shipped in 3 weeks!" },
      { name: "Marcus T.", role: "Solo Founder", stars: 5, text: "Worth every penny. The launch checklist alone saved me hours of guesswork." },
      { name: "Priya R.", role: "Full-Stack Dev", stars: 4, text: "Practical, no-fluff advice. I immediately applied the pricing section to my SaaS." }
    ];
    const faqs = [
      { q: "What format is the guide?", a: "It's a beautifully designed PDF you can read on any device — desktop, tablet, or phone." },
      { q: "Is there a money-back guarantee?", a: "Yes! If you're not satisfied within 30 days, we'll refund you no questions asked." },
      { q: "How do I access it after purchase?", a: "You'll get an instant download link right after payment, plus an email with the file." },
      { q: "Will I get future updates?", a: "Absolutely. Buy once and get all future editions for free." }
    ];
    main.innerHTML = `<div class="max-w-5xl mx-auto animate-fade-in">
      <div id="heroSection" class="flex flex-col md:flex-row items-center gap-10 md:gap-16 py-10 opacity-0" style="transform:translateY(20px);transition:opacity 600ms,transform 600ms">
        <div class="flex-shrink-0">
          <div id="mockup3d" class="w-56 h-72 rounded-xl shadow-mockup bg-gradient-to-br from-primary-600 to-primary-900 flex flex-col items-center justify-center text-white p-6 text-center cursor-pointer" style="perspective:800px;transform:rotateY(-15deg) rotateX(5deg);transition:transform 300ms ease">
            <div class="text-4xl mb-3">📘</div>
            <p class="font-bold text-lg leading-tight">Builddy<br>Pro Tips</p>
            <p class="text-xs mt-2 opacity-70">The Complete Guide</p>
          </div>
        </div>
        <div class="flex-1 text-center md:text-left">
          <h1 class="text-4xl md:text-5xl font-extrabold mb-4 bg-gradient-to-r from-primary-600 to-accent-600 bg-clip-text text-transparent">Builddy Pro Tips</h1>
          <p class="text-lg text-gray-600 dark:text-gray-400 mb-2">The definitive guide for indie hackers and solo creators who want to ship faster, sell smarter, and grow their digital products.</p>
          <p class="text-gray-500 dark:text-gray-500 mb-6">42 pages of actionable strategies, checklists, and real-world examples — distilled from 50+ creator interviews.</p>
          <div class="flex items-center justify-center md:justify-start gap-3">
            <span class="text-4xl font-bold text-primary-600">$1</span>
            <span class="text-gray-400 line-through text-lg">$19</span>
            <span class="px-2 py-0.5 bg-accent-500 text-white text-xs font-bold rounded-full">94% OFF</span>
          </div>
        </div>
      </div>

      <div id="learnSection" class="py-12 bg-surface dark:bg-surface-dark rounded-2xl mt-8 p-8">
        <h2 class="text-2xl font-bold mb-6 text-center">What you'll learn</h2>
        <ul class="max-w-xl mx-auto space-y-3">
          ${bullets.map((b,i) => `<li class="bullet-item flex items-start gap-3 opacity-0" style="transform:translateY(12px);transition:opacity 400ms ${i*100}ms,transform 400ms ${i*100}ms"><span class="text-accent-500 font-bold mt-0.5">✓</span><span>${esc(b)}</span></li>`).join("")}
        </ul>
      </div>

      <div class="py-12">
        <h2 class="text-2xl font-bold mb-6 text-center">What others are saying</h2>
        <div class="flex gap-4 overflow-x-auto snap-x snap-mandatory md:grid md:grid-cols-3 md:overflow-visible pb-4">
          ${reviews.map(r => `<div class="snap-center flex-shrink-0 w-72 md:w-auto border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-card bg-white dark:bg-surface-elevated">
            <div class="flex items-center gap-1 mb-2">${"<span class='text-amber-400'>★</span>".repeat(r.stars)}${"<span class='text-gray-300'>☆</span>".repeat(5-r.stars)}</div>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">"${esc(r.text)}"</p>
            <p class="font-semibold text-sm">${esc(r.name)}</p><p class="text-xs text-gray-500">${esc(r.role)}</p>
          </div>`).join("")}
        </div>
      </div>

      <div id="checkoutSection" class="py-12">
        <div class="flex flex-col lg:flex-row gap-8">
          <div class="flex-1 bg-white dark:bg-surface-elevated rounded-xl shadow-card border border-gray-200 dark:border-gray-700 p-6">
            <h3 class="text-xl font-bold mb-4">Checkout</h3>
            <form id="checkoutForm" class="space-y-4">
              <div><label class="block text-sm font-medium mb-1">Full Name <span class="text-red-500">*</span></label><input id="coName" type="text" required placeholder="Jane Smith" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
              <div><label class="block text-sm font-medium mb-1">Email <span class="text-red-500">*</span></label><input id="coEmail" type="email" required placeholder="you@example.com" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
              <div><label class="block text-sm font-medium mb-1">Payment Method <span class="text-red-500">*</span></label>
                <div class="space-y-2">
                  <label class="flex items-center gap-2 cursor-pointer"><input type="radio" name="payMethod" value="card" class="accent-primary-600" checked /> <span>Credit / Debit Card</span></label>
                  <label class="flex items-center gap-2 cursor-pointer"><input type="radio" name="payMethod" value="paypal" class="accent-primary-600" /> <span>PayPal</span></label>
                </div>
              </div>
              <div id="checkoutError" class="text-red-500 text-sm hidden"></div>
              <button type="submit" id="checkoutBtn" class="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-lg shadow-glow transition-colors text-lg">Pay $1 — Get Instant Access</button>
            </form>
          </div>
          <div class="lg:w-72 bg-white dark:bg-surface-elevated rounded-xl shadow-card border border-gray-200 dark:border-gray-700 p-6 self-start">
            <h4 class="font-bold mb-3">Order Summary</h4>
            <div class="flex justify-between text-sm mb-1"><span class="text-gray-500">Builddy Pro Tips PDF</span><span>$1.00</span></div>
            <div class="border-t border-gray-200 dark:border-gray-700 my-3"></div>
            <div class="flex justify-between font-bold"><span>Total</span><span>$1.00</span></div>
            <p class="text-xs text-gray-500 mt-3">🔒 Secure checkout. Instant delivery.</p>
          </div>
        </div>
      </div>

      <div class="py-12">
        <h2 class="text-2xl font-bold mb-6 text-center">Frequently Asked Questions</h2>
        <div id="faqContainer" class="max-w-2xl mx-auto space-y-2">
          ${faqs.map((f,i) => `<div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <button class="faq-toggle w-full text-left px-5 py-4 font-medium flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors" data-faq="${i}">
              <span>${esc(f.q)}</span><span class="faq-arrow transition-transform duration-200">▾</span>
            </button>
            <div class="faq-answer max-h-0 overflow-hidden transition-all duration-300 px-5 text-sm text-gray-600 dark:text-gray-400" data-faq-answer="${i}">${esc(f.a)}</div>
          </div>`).join("")}
        </div>
      </div>
    </div>`;

    requestAnimationFrame(() => {
      const hero = document.getElementById("heroSection");
      if (hero) { hero.style.opacity = "1"; hero.style.transform = "translateY(0)"; }
    });

    initMockupHover();
    initBulletObserver();
    initFaqToggles();
    document.getElementById("checkoutForm")?.addEventListener("submit", handleCheckoutSubmit);
  }

  function initMockupHover() {
    const m = document.getElementById("mockup3d");
    if (!m) return;
    m.addEventListener("mouseenter", () => { m.style.transform = "rotateY(0deg) rotateX(0deg) scale(1.05)"; });
    m.addEventListener("mouseleave", () => { m.style.transform = "rotateY(-15deg) rotateX(5deg) scale(1)"; });
  }

  function initBulletObserver() {
    const items = document.querySelectorAll(".bullet-item");
    if (!items.length) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.style.opacity = "1"; e.target.style.transform = "translateY(0)"; obs.unobserve(e.target); } });
    }, { threshold: 0.2 });
    items.forEach(i => obs.observe(i));
  }

  function initFaqToggles() {
    document.querySelectorAll(".faq-toggle").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = btn.dataset.faq;
        const ans = document.querySelector(`[data-faq-answer="${idx}"]`);
        const arrow = btn.querySelector(".faq-arrow");
        const isOpen = ans.style.maxHeight && ans.style.maxHeight !== "0px";
        if (isOpen) { ans.style.maxHeight = "0px"; arrow.style.transform = "rotate(0deg)"; }
        else { ans.style.maxHeight = ans.scrollHeight + "px"; arrow.style.transform = "rotate(180deg)"; }
      });
    });
  }

  async function handleCheckoutSubmit(e) {
    e.preventDefault();
    const errEl = document.getElementById("checkoutError");
    const btn = document.getElementById("checkoutBtn");
    errEl.classList.add("hidden");
    const name = document.getElementById("coName").value.trim();
    const email = document.getElementById("coEmail").value.trim();
    const payMethod = document.querySelector('input[name="payMethod"]:checked');
    if (!name) { errEl.textContent = "Name is required."; errEl.classList.remove("hidden"); return; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errEl.textContent = "Please enter a valid email address."; errEl.classList.remove("hidden"); return; }
    if (!payMethod) { errEl.textContent = "Please select a payment method."; errEl.classList.remove("hidden"); return; }
    btn.disabled = true; btn.textContent = "Processing...";
    try {
      const result = await api.createCheckoutSession(name, email);
      if (result.data?.redirectUrl) { window.location.href = result.data.redirectUrl; return; }
      if (result.data?.orderId || result.data?.id) { showSuccessScreen(result.data); }
      else { showToast("Something went wrong. Please try again.", "error"); }
    } catch (err) { errEl.textContent = err.message; errEl.classList.remove("hidden"); showToast(err.message, "error"); }
    finally { btn.disabled = false; btn.textContent = "Pay $1 — Get Instant Access"; }
  }

  function showSuccessScreen(orderData) {
    const main = document.getElementById("mainContent");
    main.innerHTML = `<div id="successOverlay" class="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex items-center justify-center animate-fade-in">
      <div class="text-center max-w-md mx-auto p-8">
        <div id="confettiContainer" class="absolute inset-0 pointer-events-none overflow-hidden"></div>
        <div class="text-6xl mb-4 relative z-10">🎉</div>
        <h2 class="text-3xl font-bold mb-2 relative z-10">You're in!</h2>
        <p class="text-gray-600 dark:text-gray-400 mb-6 relative z-10">Your purchase of <strong>Builddy Pro Tips</strong> is confirmed. Check your email for the file, or download it now.</p>
        <a id="downloadBtn" href="#" class="inline-block px-8 py-3 bg-accent-600 hover:bg-accent-700 text-white font-bold rounded-lg shadow-glow transition-colors text-lg relative z-10">⬇ Download PDF</a>
        <p class="text-xs text-gray-400 mt-4 relative z-10">Order #${esc(String(orderData?.orderId || orderData?.id || "—"))}</p>
      </div>
    </div>`;
    launchConfetti();
  }

  function launchConfetti() {
    const container = document.getElementById("confettiContainer");
    if (!container) return;
    const colors = ["#4f6ef7","#20c997","#fcc419","#ff6b6b","#fff"];
    for (let i = 0; i < 60; i++) {
      const piece = document.createElement("div");
      const c = colors[Math.floor(Math.random() * colors.length)];
      piece.style.cssText = `position:absolute;width:${6+Math.random()*6}px;height:${6+Math.random()*6}px;background:${c};border-radius:${Math.random()>0.5?"50%":"2px"};left:${Math.random()*100}%;top:-20px;opacity:0.9;`;
      container.appendChild(piece);
      const dur = 1500 + Math.random() * 2000;
      const drift = (Math.random() - 0.5) * 200;
      piece.animate([
        { transform: "translateY(0) translateX(0) rotate(0deg)", opacity: 1 },
        { transform: `translateY(${window.innerHeight+40}px) translateX(${drift}px) rotate(${Math.random()*720}deg)`, opacity: 0 }
      ], { duration: dur, delay: Math.random() * 800, easing: "cubic-bezier(0.25,0.46,0.45,0.94)", fill: "forwards" });
    }
  }

  // --- Page Renderers ---
  async function renderDashboard() {
    const main = document.getElementById("mainContent");
    try {
      const result = await api.fetchProductInfo();
      renderProductInfo(result.data || {});
    } catch {
      try {
        const result = await api.getItems();
        const items = result.data || [];
        main.innerHTML = `<div class="animate-fade-in">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div class="bg-white dark:bg-gray-800 p-6 rounded-xl shadow border border-gray-200 dark:border-gray-700"><p class="text-sm text-gray-500">Total Items</p><p class="text-3xl font-bold mt-1">${result.pagination?.total||items.length}</p></div>
            <div class="bg-white dark:bg-gray-800 p-6 rounded-xl shadow border border-gray-200 dark:border-gray-700"><p class="text-sm text-gray-500">Plan</p><p class="text-3xl font-bold mt-1">Free</p></div>
            <div class="bg-white dark:bg-gray-800 p-6 rounded-xl shadow border border-gray-200 dark:border-gray-700"><p class="text-sm text-gray-500">Status</p><p class="text-3xl font-bold mt-1 text-green-500">Active</p></div>
          </div>
          <div class="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700">
            <div class="p-4 border-b border-gray-200 dark:border-gray-700"><h3 class="font-semibold">Recent Items</h3></div>
            <div class="divide-y divide-gray-200 dark:divide-gray-700">
              ${items.length===0?'<p class="p-4 text-gray-500 text-center">No items yet</p>':items.map(i=>`<div class="p-4 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700/50"><div><p class="font-medium">${esc(i.name)}</p><p class="text-sm text-gray-500">ID: ${i.id}</p></div><button onclick="window.__deleteItem(${i.id})" class="text-red-400 hover:text-red-600 p-2">&#128465;</button></div>`).join("")}
            </div></div></div>`;
      } catch (err) { main.innerHTML = `<div class="text-center py-20"><p class="text-red-500 text-lg">${esc(err.message)}</p></div>`; }
    }
  }

  async function renderSettings() {
    const main = document.getElementById("mainContent");
    try {
      const p = await api.getProfile();
      main.innerHTML = `<div class="max-w-2xl animate-fade-in"><div class="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 p-6">
        <h3 class="text-lg font-semibold mb-4">Profile Settings</h3>
        <div class="space-y-4">
          <div><label class="block text-sm font-medium mb-1">Name</label><input id="settingsName" type="text" value="${esc(p.data.name||"")}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
          <div><label class="block text-sm font-medium mb-1">Email</label><input type="email" value="${esc(p.data.email)}" disabled class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-600 cursor-not-allowed" /></div>
          <button id="saveSettingsBtn" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">Save Changes</button>
        </div></div></div>`;
      document.getElementById("saveSettingsBtn")?.addEventListener("click", () => showToast("Settings saved!","success"));
    } catch (err) { main.innerHTML = `<div class="text-center py-20"><p class="text-red-500">${esc(err.message)}</p></div>`; }
  }

  async function renderBilling() {
    document.getElementById("mainContent").innerHTML = `<div class="max-w-2xl animate-fade-in"><div class="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 p-6">
      <h3 class="text-lg font-semibold mb-4">Billing & Subscription</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="border border-blue-500 rounded-xl p-6 text-center bg-blue-50 dark:bg-blue-900/20"><p class="text-lg font-bold">Free</p><p class="text-2xl font-bold mt-2">$0/mo</p><p class="text-sm text-gray-500 mt-2">Current plan</p></div>
        <div class="border border-gray-300 dark:border-gray-600 rounded-xl p-6 text-center hover:border-blue-500 cursor-pointer"><p class="text-lg font-bold">Pro</p><p class="text-2xl font-bold mt-2">$19/mo</p><button class="mt-3 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm">Upgrade</button></div>
      </div></div></div>`;
  }

  async function renderApiKeys() {
    const main = document.getElementById("mainContent");
    main.innerHTML = `<div class="max-w-2xl animate-fade-in"><div class="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 p-6">
      <h3 class="text-lg font-semibold mb-4">API Keys</h3>
      <div class="flex items-center gap-3 bg-gray-100 dark:bg-gray-700 p-3 rounded-lg mb-4"><code class="flex-1 text-sm font-mono truncate" id="apiKeyDisplay">Loading...</code><button id="copyKeyBtn" class="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">Copy</button></div>
      <button id="regenKeyBtn" class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm">Regenerate Key</button>
    </div></div>`;
    try { const p = await api.getProfile(); document.getElementById("apiKeyDisplay").textContent = p.data.api_key || "No key"; } catch {}
    document.getElementById("copyKeyBtn")?.addEventListener("click", () => { navigator.clipboard.writeText(document.getElementById("apiKeyDisplay").textContent).then(() => showToast("Copied!","success")); });
  }

  registerPage("dashboard", renderDashboard);
  registerPage("settings", renderSettings);
  registerPage("billing", renderBilling);
  registerPage("apikeys", renderApiKeys);
  // {{RENDER_INSERTION_POINT}}
  // Custom page renderers registered above in renderProductInfo flow.

  // --- Dark Mode ---
  function initDarkMode() {
    const toggle = document.getElementById("darkToggle"), icon = document.getElementById("darkIcon");
    if (localStorage.getItem("builddy-dark")==="false") { document.documentElement.classList.remove("dark"); icon.textContent="\u2600"; }
    toggle.addEventListener("click", () => { const d=document.documentElement.classList.toggle("dark"); localStorage.setItem("builddy-dark",d); icon.textContent=d?"\u263E":"\u2600"; });
  }

  function esc(s) { const d=document.createElement("div"); d.textContent=s; return d.innerHTML; }
  window.__deleteItem = async (id) => { if(!confirm("Delete?")) return; try { await api.deleteItem(id); showToast("Deleted","success"); navigateTo("dashboard"); } catch(e) { showToast(e.message,"error"); } };

  async function init() {
    initDarkMode();
    document.querySelectorAll(".nav-link").forEach((l) => l.addEventListener("click", (e) => { e.preventDefault(); navigateTo(l.dataset.page); }));
    document.getElementById("menuToggle")?.addEventListener("click", () => { document.getElementById("sidebar").classList.toggle("open"); document.getElementById("sidebarOverlay").classList.toggle("hidden"); });
    document.getElementById("sidebarOverlay")?.addEventListener("click", () => { document.getElementById("sidebar").classList.remove("open"); document.getElementById("sidebarOverlay").classList.add("hidden"); });
    document.getElementById("logoutBtn")?.addEventListener("click", async () => { await Auth.logout(); window.location.reload(); });

    if (Auth.isAuthenticated()) {
      const u = Auth.getUser();
      if (u) { document.getElementById("userName").textContent = u.name||u.email||"User"; document.getElementById("userEmail").textContent = u.email||""; document.getElementById("userAvatar").textContent = (u.name||u.email||"U")[0].toUpperCase(); }
      navigateTo("dashboard");
    } else {
      document.getElementById("mainContent").innerHTML = `<div class="flex flex-col items-center justify-center py-20 animate-fade-in"><div class="text-6xl mb-4">&#128274;</div><p class="text-gray-500 text-lg mb-4">Please log in</p><a href="/login" class="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">Login</a></div>`;
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  window.BuilddyApp = { api, Auth, showToast, navigateTo, registerPage };
})();