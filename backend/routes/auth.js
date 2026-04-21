/**
 * Builddy SaaS Scaffold — Auth Routes
 * JWT auth with access+refresh tokens, registration, login, token refresh,
 * password hashing via crypto.scrypt.
 */

import crypto from "crypto";
import { Router } from "express";
import { getDb, create, getOneWhere, getById, trackUsage } from "../db.js";
import { requireAuth } from "../middleware.js";

const router = Router();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const JWT_SECRET = process.env.JWT_SECRET || "builddy-saas-secret-change-in-production";
const ACCESS_TOKEN_EXPIRY = 900;    // 15 minutes
const REFRESH_TOKEN_EXPIRY = 604800; // 7 days
const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_LEN = 32;

// ---------------------------------------------------------------------------
// Password Hashing (scrypt)
// ---------------------------------------------------------------------------

function hashPassword(password) {
  const salt = crypto.randomBytes(SCRYPT_SALT_LEN).toString("hex");
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return `${salt}:${derived.toString("hex")}`;
}

function verifyPassword(password, stored) {
  try {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), derived);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// JWT Helpers (HMAC-SHA256)
// ---------------------------------------------------------------------------

function base64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function createToken(payload, expiresIn = ACCESS_TOKEN_EXPIRY) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + expiresIn };
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(fullPayload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(signingInput).digest();
  return `${signingInput}.${base64url(signature)}`;
}

export function verifyToken(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;
    const expectedSig = crypto.createHmac("sha256", JWT_SECRET)
      .update(`${headerB64}.${payloadB64}`).digest();
    const actualSig = Buffer.from(
      signatureB64.replace(/-/g, "+").replace(/_/g, "/"), "base64"
    );
    if (!crypto.timingSafeEqual(expectedSig, actualSig)) return null;
    const payload = JSON.parse(
      Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()
    );
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function createRefreshToken() {
  return crypto.randomBytes(48).toString("hex");
}

// ---------------------------------------------------------------------------
// Sanitize User
// ---------------------------------------------------------------------------

function sanitizeUser(user) {
  if (!user) return null;
  const { password, api_key, ...safe } = user;
  return safe;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// POST /register
router.post("/register", (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: "Password must be at least 8 characters" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: "Invalid email format" });
    }

    const existing = getOneWhere("users", { email });
    if (existing) {
      return res.status(409).json({ success: false, error: "Email already registered" });
    }

    const hashed = hashPassword(password);
    const apiKey = crypto.randomBytes(24).toString("hex");
    const user = create("users", { email, password: hashed, name: name || "", api_key: apiKey });
    create("subscriptions", { user_id: user.id, plan: "free", status: "active" });

    const accessToken = createToken({ userId: user.id, email: user.email, role: user.role });
    const refreshToken = createRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY * 1000).toISOString();
    create("refresh_tokens", { user_id: user.id, token: refreshToken, expires_at: expiresAt });

    trackUsage(user.id, "auth.register");
    res.status(201).json({
      success: true,
      data: { user: sanitizeUser(user), accessToken, refreshToken },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /login
router.post("/login", (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required" });
    }

    const user = getOneWhere("users", { email });
    if (!user || !verifyPassword(password, user.password)) {
      return res.status(401).json({ success: false, error: "Invalid email or password" });
    }

    const accessToken = createToken({ userId: user.id, email: user.email, role: user.role });
    const refreshToken = createRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY * 1000).toISOString();
    create("refresh_tokens", { user_id: user.id, token: refreshToken, expires_at: expiresAt });

    trackUsage(user.id, "auth.login");
    res.json({
      success: true,
      data: { user: sanitizeUser(user), accessToken, refreshToken },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /refresh
router.post("/refresh", (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, error: "Refresh token required" });
    }

    const db = getDb();
    const stored = db.prepare(
      `SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > datetime('now')`
    ).get(refreshToken);

    if (!stored) {
      return res.status(401).json({ success: false, error: "Invalid or expired refresh token" });
    }

    const user = getById("users", stored.user_id);
    if (!user) {
      return res.status(401).json({ success: false, error: "User not found" });
    }

    // Rotate refresh token
    db.prepare("DELETE FROM refresh_tokens WHERE id = ?").run(stored.id);
    const newRefreshToken = createRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY * 1000).toISOString();
    create("refresh_tokens", { user_id: user.id, token: newRefreshToken, expires_at: expiresAt });

    const accessToken = createToken({ userId: user.id, email: user.email, role: user.role });
    res.json({
      success: true,
      data: { user: sanitizeUser(user), accessToken, refreshToken: newRefreshToken },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /logout
router.post("/logout", requireAuth, (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const db = getDb();
      db.prepare("DELETE FROM refresh_tokens WHERE token = ?").run(refreshToken);
    }
    res.json({ success: true, message: "Logged out" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /me
router.get("/me", requireAuth, (req, res) => {
  try {
    const user = getById("users", req.user.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    const subscription = getOneWhere("subscriptions", { user_id: user.id });
    res.json({ success: true, data: { ...sanitizeUser(user), subscription } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
