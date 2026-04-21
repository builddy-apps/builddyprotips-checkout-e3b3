/**
 * Builddy SaaS Scaffold — Middleware Module
 * Rate limiting (sliding window), JWT auth, request logger, CORS, input sanitization.
 */

import crypto from "crypto";
import { verifyToken } from "./routes/auth.js";

// ---------------------------------------------------------------------------
// Rate Limiting — Sliding Window (in-memory, per-IP)
// ---------------------------------------------------------------------------

const rateLimitWindows = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 100; // 100 requests per minute

function cleanupRateLimit() {
  const now = Date.now();
  for (const [key, entry] of rateLimitWindows) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (entry.timestamps.length === 0) {
      rateLimitWindows.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupRateLimit, 300_000).unref();

export function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const now = Date.now();

  if (!rateLimitWindows.has(ip)) {
    rateLimitWindows.set(ip, { timestamps: [] });
  }

  const entry = rateLimitWindows.get(ip);
  entry.timestamps = entry.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  entry.timestamps.push(now);

  const remaining = RATE_LIMIT_MAX - entry.timestamps.length;
  res.setHeader("X-RateLimit-Limit", RATE_LIMIT_MAX);
  res.setHeader("X-RateLimit-Remaining", Math.max(0, remaining));

  if (entry.timestamps.length > RATE_LIMIT_MAX) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({
      success: false,
      error: "Too many requests. Please try again later.",
    });
  }

  next();
}

// ---------------------------------------------------------------------------
// JWT Auth Middleware
// ---------------------------------------------------------------------------

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  const token = authHeader.split(" ")[1];
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ success: false, error: "Invalid or expired token" });
  }

  req.user = payload;
  next();
}

// ---------------------------------------------------------------------------
// Optional Auth — sets req.user if token present, but doesn't block
// ---------------------------------------------------------------------------

export function optionalAuth(req, _res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    const payload = verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  }
  next();
}

// ---------------------------------------------------------------------------
// Request Logger
// ---------------------------------------------------------------------------

export function requestLogger(req, res, next) {
  const start = Date.now();
  const requestId = crypto.randomBytes(4).toString("hex");

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? "WARN" : "INFO";
    console.log(
      `[${level}] [${requestId}] ${req.method} ${req.originalUrl} ` +
      `${res.statusCode} ${duration}ms - ${req.ip}`
    );
  });

  next();
}

// ---------------------------------------------------------------------------
// CORS with Origin Restriction
// ---------------------------------------------------------------------------

export function corsMiddleware(allowedOrigins = []) {
  const DEFAULT_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
  ];
  const origins = [...DEFAULT_ORIGINS, ...allowedOrigins];

  return function cors(req, res, next) {
    const origin = req.headers.origin;
    if (origin && origins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    } else if (!origin) {
      // Same-origin or server-to-server
      res.setHeader("Access-Control-Allow-Origin", "*");
    }

    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-Id");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Max-Age", "86400");

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// Input Sanitization
// ---------------------------------------------------------------------------

const SANITIZE_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /javascript\s*:/gi,
  /on\w+\s*=/gi,
];

function sanitizeValue(value) {
  if (typeof value === "string") {
    let clean = value;
    for (const pattern of SANITIZE_PATTERNS) {
      clean = clean.replace(pattern, "");
    }
    return clean.trim();
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === "object") {
    const sanitized = {};
    for (const [key, val] of Object.entries(value)) {
      sanitized[key] = sanitizeValue(val);
    }
    return sanitized;
  }
  return value;
}

export function sanitizeInput(req, _res, next) {
  try {
    if (req.body && typeof req.body === "object") {
      req.body = sanitizeValue(req.body);
    }
    if (req.query && typeof req.query === "object") {
      req.query = sanitizeValue(req.query);
    }
    if (req.params && typeof req.params === "object") {
      req.params = sanitizeValue(req.params);
    }
    next();
  } catch (err) {
    next(err);
  }
}
