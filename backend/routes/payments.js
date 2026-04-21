/**
 * Builddy PayLink — Payments Routes
 * One-time Stripe checkout session creation, webhook handler, order history.
 */

import { Router } from "express";
import crypto from "crypto";
import { getDb, getOneWhere, getById, create, update, trackUsage, createOrder, getOrderBySession, updateOrderStatus } from "../db.js";
import { requireAuth } from "../middleware.js";

const router = Router();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const STRIPE_API_BASE = "https://api.stripe.com/v1";
const APP_URL = process.env.APP_URL || "http://localhost:3000";
const PRODUCT_PRICE_CENTS = 100; // $1.00

// ---------------------------------------------------------------------------
// Stripe API Helper (using fetch, no SDK dependency)
// ---------------------------------------------------------------------------

async function stripeRequest(endpoint, body = {}) {
  if (!STRIPE_SECRET_KEY) throw new Error("Stripe secret key not configured");

  const formBody = Object.entries(body)
    .map(([key, val]) => `${encodeURIComponent(key)}=${encodeURIComponent(val)}`)
    .join("&");

  const response = await fetch(`${STRIPE_API_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formBody,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Stripe API error: ${response.status}`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Verify Webhook Signature
// ---------------------------------------------------------------------------

function verifyWebhookSignature(payload, sigHeader) {
  if (!STRIPE_WEBHOOK_SECRET) return true; // Skip in dev

  try {
    const parts = sigHeader.split(",");
    const timestamp = parts.find((p) => p.startsWith("t="))?.split("=")[1];
    const signature = parts.find((p) => p.startsWith("v1="))?.split("=")[1];

    if (!timestamp || !signature) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const expectedSig = crypto
      .createHmac("sha256", STRIPE_WEBHOOK_SECRET)
      .update(signedPayload)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(expectedSig, "hex"),
      Buffer.from(signature, "hex")
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// POST /checkout — Create Stripe Checkout Session (one-time $1 payment)
// ---------------------------------------------------------------------------

router.post("/checkout", requireAuth, async (req, res) => {
  try {
    const { buyer_name, buyer_email } = req.body;

    const successUrl = `${APP_URL}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${APP_URL}/?checkout=cancelled&session_id={CHECKOUT_SESSION_ID}`;

    const metadataParams = {};
    if (buyer_name) metadataParams["metadata[buyer_name]"] = buyer_name;
    if (buyer_email) metadataParams["metadata[buyer_email]"] = buyer_email;
    metadataParams["metadata[user_id]"] = req.user.userId.toString();

    const session = await stripeRequest("/checkout/sessions", {
      mode: "payment",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": PRODUCT_PRICE_CENTS,
      "line_items[0][price_data][product_data][name]": "Builddy Pro Tips",
      "line_items[0][price_data][product_data][description]": "The ultimate PDF guide for shipping your first app. Packed with real-world tips from indie makers.",
      "line_items[0][quantity]": 1,
      success_url: successUrl,
      cancel_url: cancelUrl,
      "payment_method_types[0]": "card",
      customer_email: buyer_email || req.user.email,
      client_reference_id: req.user.userId.toString(),
      ...metadataParams,
    });

    trackUsage(req.user.userId, "checkout.created");
    res.json({ success: true, data: { url: session.url, session_id: session.id } });
  } catch (err) {
    console.error("[payments] Checkout error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /checkout/guest — Create checkout without auth (for public paylink)
// ---------------------------------------------------------------------------

router.post("/checkout/guest", async (req, res) => {
  try {
    const { buyer_name, buyer_email } = req.body;
    if (!buyer_email) {
      return res.status(400).json({ success: false, error: "Email is required" });
    }

    const successUrl = `${APP_URL}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${APP_URL}/?checkout=cancelled&session_id={CHECKOUT_SESSION_ID}`;

    const session = await stripeRequest("/checkout/sessions", {
      mode: "payment",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": PRODUCT_PRICE_CENTS,
      "line_items[0][price_data][product_data][name]": "Builddy Pro Tips",
      "line_items[0][price_data][product_data][description]": "The ultimate PDF guide for shipping your first app. Packed with real-world tips from indie makers.",
      "line_items[0][quantity]": 1,
      success_url: successUrl,
      cancel_url: cancelUrl,
      "payment_method_types[0]": "card",
      customer_email: buyer_email,
      "metadata[buyer_name]": buyer_name || "",
      "metadata[buyer_email]": buyer_email,
    });

    res.json({ success: true, data: { url: session.url, session_id: session.id } });
  } catch (err) {
    console.error("[payments] Guest checkout error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /webhook — Stripe Webhook Handler
// ---------------------------------------------------------------------------

router.post("/webhook", (req, res) => {
  try {
    const sig = req.headers["stripe-signature"];
    const payload = typeof req.body === "string" ? req.body : JSON.stringify(req.body);

    if (!verifyWebhookSignature(payload, sig)) {
      return res.status(400).json({ success: false, error: "Invalid signature" });
    }

    const event = JSON.parse(payload);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const buyerName = session.metadata?.buyer_name || "Unknown";
        const buyerEmail = session.metadata?.buyer_email || session.customer_email || "";
        const userId = parseInt(session.client_reference_id) || 0;

        // Create order with paid status
        create("orders", {
          user_id: userId,
          stripe_session_id: session.id,
          amount_total: (session.amount_total || 0) / 100,
          currency: session.currency || "usd",
          status: "paid",
          metadata: JSON.stringify({
            buyer_name: buyerName,
            buyer_email: buyerEmail,
            payment_intent: session.payment_intent,
          }),
        });

        if (userId) trackUsage(userId, "purchases");
        console.log(`[payments] Order created for ${buyerEmail} — session ${session.id}`);
        break;
      }

      default:
        console.log(`[payments] Unhandled event: ${event.type}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error("[payments] Webhook error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /orders — Get order history (auth required)
// ---------------------------------------------------------------------------

router.get("/orders", requireAuth, (req, res) => {
  try {
    const db = getDb();
    const orders = db.prepare(
      "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC"
    ).all(req.user.userId);
    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /orders/verify/:sessionId — Verify a session and return order
// ---------------------------------------------------------------------------

router.get("/orders/verify/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) return res.status(400).json({ success: false, error: "Session ID required" });

    const order = getOneWhere("orders", { stripe_session_id: sessionId });
    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;