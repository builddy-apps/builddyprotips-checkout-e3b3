/**
 * Builddy Marketplace Scaffold — Express Server
 * Health check, API routes, marketplace, payments, error handler, graceful shutdown.
 *
 * Modification Points:
 *   // {{MIDDLEWARE_INSERTION_POINT}}  — Add custom middleware here
 *   // {{ROUTE_INSERTION_POINT}}       — Add custom API routes here
 */

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { initSchema, closeDb, create, getById, runQuery } from "./db.js";
import { rateLimiter, requireAuth, requestLogger, corsMiddleware, sanitizeInput } from "./middleware.js";
import authRoutes from "./routes/auth.js";
import apiRoutes from "./routes/api.js";
import marketplaceRoutes from "./routes/marketplace.js";
import paymentRoutes from "./routes/payments.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const STATIC_DIR = path.join(__dirname, "..", "frontend");
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean);

const app = express();

// {{MIDDLEWARE_INSERTION_POINT}}
// Stricter rate limiting for payment endpoints
const paymentRateLimiter = (req, res, next) => {
  const windowMs = 60 * 1000;
  const maxRequests = 10;
  const key = req.ip;
  if (!app._paymentLimiter) app._paymentLimiter = {};
  const now = Date.now();
  const record = app._paymentLimiter[key] || { count: 0, start: now };
  if (now - record.start > windowMs) { record.count = 0; record.start = now; }
  record.count++;
  app._paymentLimiter[key] = record;
  if (record.count > maxRequests) {
    return res.status(429).json({ success: false, error: "Too many requests to payment endpoints. Please wait." });
  }
  next();
};
app.use("/api/payments", paymentRateLimiter);

app.use(corsMiddleware(ALLOWED_ORIGINS));
app.use(requestLogger);
app.use(rateLimiter);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(sanitizeInput);

// Stripe webhook needs raw body — register before JSON parsing
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

app.use(express.static(STATIC_DIR));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), uptime: process.uptime(), auth: true, marketplace: true });
});

app.use("/api/auth", authRoutes);
app.use("/api", apiRoutes);
app.use("/api/marketplace", marketplaceRoutes);
app.use("/api/payments", paymentRoutes);

// {{ROUTE_INSERTION_POINT}}

// Product info endpoint — static product details for the checkout page
app.get("/api/product", (_req, res) => {
  res.json({
    success: true,
    data: {
      id: "builddy-pro-tips",
      name: "Builddy Pro Tips",
      tagline: "The essential guide for indie hackers and builders",
      price: 1.00,
      currency: "USD",
      description: "A comprehensive PDF guide packed with battle-tested strategies for shipping faster, growing your audience, and turning side projects into revenue. Over 50 pages of actionable advice from builders who've been there.",
      features: [
        "Ship your first app in 30 days with our proven framework",
        "Growth hacking tactics used by top indie hackers",
        "Pricing strategies that maximize conversion rates",
        "Copywriting templates for high-converting landing pages",
        "Automation workflows to save 10+ hours per week",
        "Mindset shifts that separate shippers from dreamers",
        "Bonus: Resource list with 100+ tools for solo founders"
      ],
      format: "PDF",
      pages: 52,
      image: "/product-mockup.png"
    }
  });
});

// Create an order record
app.post("/api/orders", (req, res) => {
  try {
    const { name, email, amount } = req.body;
    if (!name || !email) {
      return res.status(400).json({ success: false, error: "Name and email are required" });
    }
    const order = create("orders", {
      name,
      email,
      amount: amount || 1.00,
      status: "pending",
      stripe_session_id: null
    });
    res.status(201).json({ success: true, data: order });
  } catch (err) {
    console.error("[server] Order creation error:", err);
    res.status(500).json({ success: false, error: "Failed to create order" });
  }
});

// Check order status (for success screen)
app.get("/api/orders/:id", (req, res) => {
  try {
    const order = getById("orders", req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }
    res.json({ success: true, data: order });
  } catch (err) {
    console.error("[server] Order lookup error:", err);
    res.status(500).json({ success: false, error: "Failed to retrieve order" });
  }
});

app.get("/marketplace", (_req, res) => { res.sendFile(path.join(STATIC_DIR, "marketplace.html")); });
app.get("*", (_req, res) => { res.sendFile(path.join(STATIC_DIR, "index.html")); });

app.use((err, _req, res, _next) => {
  console.error("[server] Unhandled error:", err);
  if (err.type === "entity.parse.failed") return res.status(400).json({ success: false, error: "Invalid JSON" });
  res.status(err.statusCode || 500).json({ success: false, error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
});

let server = null;

function start() {
  initSchema();
  server = app.listen(PORT, () => {
    console.log(`[server] Running on http://localhost:${PORT}`);
    console.log(`[server] Marketplace and payments enabled`);
  });
}

function gracefulShutdown(signal) {
  console.log(`\n[server] ${signal}. Shutting down...`);
  if (server) {
    server.close(() => { closeDb(); process.exit(0); });
    setTimeout(() => { closeDb(); process.exit(1); }, 10_000);
  } else { closeDb(); process.exit(0); }
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

if (process.argv[1] === __filename || process.argv[1]?.endsWith("server.js")) start();

export { app, start };