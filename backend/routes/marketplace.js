/**
 * Builddy Marketplace Scaffold — Marketplace Routes
 * Listing CRUD, search, categories, reviews, featured items.
 */

import { Router } from "express";
import { getDb, getById, create, update, deleteRow, trackUsage } from "../db.js";
import { requireAuth } from "../middleware.js";

const router = Router();

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

router.get("/categories", (_req, res) => {
  try {
    const db = getDb();
    const categories = db.prepare(
      "SELECT c.*, COUNT(l.id) as listing_count FROM categories c LEFT JOIN listings l ON c.id = l.category_id AND l.status = 'active' GROUP BY c.id ORDER BY c.name"
    ).all();
    res.json({ success: true, data: categories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/categories", requireAuth, (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ success: false, error: "Admin only" });
    const { name, description, icon } = req.body;
    if (!name) return res.status(400).json({ success: false, error: "Category name required" });
    const category = create("categories", { name, description: description || "", icon: icon || "" });
    res.status(201).json({ success: true, data: category });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Listings — List/Search with pagination and filters
// ---------------------------------------------------------------------------

router.get("/listings", (req, res) => {
  try {
    const db = getDb();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const conditions = ["l.status = 'active'"];
    const params = [];

    // Search
    if (req.query.search) {
      conditions.push("(l.title LIKE ? OR l.description LIKE ?)");
      const term = `%${req.query.search}%`;
      params.push(term, term);
    }

    // Category filter
    if (req.query.category_id) {
      conditions.push("l.category_id = ?");
      params.push(req.query.category_id);
    }

    // Price range
    if (req.query.min_price) { conditions.push("l.price >= ?"); params.push(parseFloat(req.query.min_price)); }
    if (req.query.max_price) { conditions.push("l.price <= ?"); params.push(parseFloat(req.query.max_price)); }

    // Sort
    const sortMap = { price: "l.price", created: "l.created_at", rating: "avg_rating", name: "l.title" };
    const sortCol = sortMap[req.query.sort_by] || "l.created_at";
    const sortDir = req.query.sort_dir === "asc" ? "ASC" : "DESC";

    const where = `WHERE ${conditions.join(" AND ")}`;

    const countResult = db.prepare(`SELECT COUNT(*) as count FROM listings l ${where}`).get(...params);
    const listings = db.prepare(`
      SELECT l.*, u.name as seller_name,
        COALESCE((SELECT AVG(r.rating) FROM reviews r WHERE r.listing_id = l.id), 0) as avg_rating,
        COALESCE((SELECT COUNT(*) FROM reviews r WHERE r.listing_id = l.id), 0) as review_count
      FROM listings l
      LEFT JOIN users u ON l.seller_id = u.id
      ${where}
      ORDER BY ${sortCol} ${sortDir}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    res.json({
      success: true,
      data: listings,
      pagination: { page, limit, total: countResult.count, pages: Math.ceil(countResult.count / limit) },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Featured Listings
// ---------------------------------------------------------------------------

router.get("/listings/featured", (_req, res) => {
  try {
    const db = getDb();
    const listings = db.prepare(`
      SELECT l.*, u.name as seller_name,
        COALESCE((SELECT AVG(r.rating) FROM reviews r WHERE r.listing_id = l.id), 0) as avg_rating
      FROM listings l
      LEFT JOIN users u ON l.seller_id = u.id
      WHERE l.featured = 1 AND l.status = 'active'
      ORDER BY l.created_at DESC LIMIT 10
    `).all();
    res.json({ success: true, data: listings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Get Single Listing
// ---------------------------------------------------------------------------

router.get("/listings/:id", (req, res) => {
  try {
    const db = getDb();
    const listing = db.prepare(`
      SELECT l.*, u.name as seller_name, u.email as seller_email,
        COALESCE((SELECT AVG(r.rating) FROM reviews r WHERE r.listing_id = l.id), 0) as avg_rating,
        COALESCE((SELECT COUNT(*) FROM reviews r WHERE r.listing_id = l.id), 0) as review_count
      FROM listings l
      LEFT JOIN users u ON l.seller_id = u.id
      WHERE l.id = ?
    `).get(req.params.id);
    if (!listing) return res.status(404).json({ success: false, error: "Listing not found" });
    res.json({ success: true, data: listing });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Create Listing
// ---------------------------------------------------------------------------

router.post("/listings", requireAuth, (req, res) => {
  try {
    const { title, description, price, category_id, image_url, metadata } = req.body;
    if (!title || price === undefined) return res.status(400).json({ success: false, error: "Title and price required" });
    const listing = create("listings", {
      seller_id: req.user.userId,
      title, description: description || "",
      price: parseFloat(price),
      category_id: category_id || null,
      image_url: image_url || "",
      metadata: metadata ? JSON.stringify(metadata) : "{}",
      status: "active",
      featured: 0,
    });
    trackUsage(req.user.userId, "listings.created");
    res.status(201).json({ success: true, data: listing });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Update Listing
// ---------------------------------------------------------------------------

router.put("/listings/:id", requireAuth, (req, res) => {
  try {
    const listing = getById("listings", req.params.id);
    if (!listing) return res.status(404).json({ success: false, error: "Not found" });
    if (listing.seller_id !== req.user.userId && req.user.role !== "admin") {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }
    const safeData = { ...req.body };
    delete safeData.seller_id;
    if (safeData.metadata) safeData.metadata = JSON.stringify(safeData.metadata);
    if (safeData.price) safeData.price = parseFloat(safeData.price);
    const updated = update("listings", req.params.id, safeData);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Delete Listing
// ---------------------------------------------------------------------------

router.delete("/listings/:id", requireAuth, (req, res) => {
  try {
    const listing = getById("listings", req.params.id);
    if (!listing) return res.status(404).json({ success: false, error: "Not found" });
    if (listing.seller_id !== req.user.userId && req.user.role !== "admin") {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }
    deleteRow("listings", req.params.id);
    res.json({ success: true, message: "Listing deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

router.get("/listings/:id/reviews", (req, res) => {
  try {
    const db = getDb();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const reviews = db.prepare(`
      SELECT r.*, u.name as reviewer_name
      FROM reviews r LEFT JOIN users u ON r.user_id = u.id
      WHERE r.listing_id = ? ORDER BY r.created_at DESC LIMIT ? OFFSET ?
    `).all(req.params.id, limit, (page - 1) * limit);
    res.json({ success: true, data: reviews });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/listings/:id/reviews", requireAuth, (req, res) => {
  try {
    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ success: false, error: "Rating (1-5) required" });
    const listing = getById("listings", req.params.id);
    if (!listing) return res.status(404).json({ success: false, error: "Listing not found" });
    const review = create("reviews", {
      listing_id: parseInt(req.params.id),
      user_id: req.user.userId,
      rating: parseInt(rating),
      comment: comment || "",
    });
    res.status(201).json({ success: true, data: review });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
