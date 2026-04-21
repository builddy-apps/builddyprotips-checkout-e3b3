/**
 * Builddy SaaS Scaffold — Generic API Routes
 * CRUD endpoints with pagination, filtering, sorting.
 */

import { Router } from "express";
import { getDb, getById, create, update, deleteRow, getWhere } from "../db.js";
import { requireAuth } from "../middleware.js";

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function parseFilters(query, allowedFilters = []) {
  const filters = {};
  for (const key of allowedFilters) {
    if (query[key] !== undefined && query[key] !== "") {
      filters[key] = query[key];
    }
  }
  return filters;
}

function parseSort(query, allowedSorts = ["id", "created_at", "updated_at"]) {
  const sortCol = query.sort_by || "id";
  const sortDir = query.sort_dir === "desc" ? "DESC" : "ASC";
  if (!allowedSorts.includes(sortCol)) return "id ASC";
  return `${sortCol} ${sortDir}`;
}

function paginateResults(db, sql, countSql, params, countParams, page, limit) {
  const total = db.prepare(countSql).get(...countParams);
  const rows = db.prepare(sql).all(...params);
  return {
    data: rows,
    pagination: {
      page,
      limit,
      total: total.count,
      pages: Math.ceil(total.count / limit),
    },
  };
}

// ---------------------------------------------------------------------------
// Generic CRUD Factory
// ---------------------------------------------------------------------------

/**
 * Create CRUD routes for a table.
 * @param {string} tableName - Database table name
 * @param {object} options - Configuration
 * @param {string[]} options.allowedFilters - Query params allowed as filters
 * @param {string[]} options.allowedSorts - Columns allowed for sorting
 * @param {boolean} options.userScoped - Filter by req.user.userId
 * @param {string} options.userCol - Column for user scoping (default: user_id)
 */
export function createCrudRoutes(tableName, options = {}) {
  const {
    allowedFilters = [],
    allowedSorts = ["id", "created_at", "updated_at"],
    userScoped = true,
    userCol = "user_id",
  } = options;

  const crudRouter = Router({ mergeParams: true });

  // LIST
  crudRouter.get("/", requireAuth, (req, res) => {
    try {
      const db = getDb();
      const { page, limit, offset } = parsePagination(req.query);
      const filters = parseFilters(req.query, allowedFilters);
      const order = parseSort(req.query, allowedSorts);

      const whereParts = [];
      const params = [];

      if (userScoped) {
        whereParts.push(`${userCol} = ?`);
        params.push(req.user.userId);
      }

      for (const [key, val] of Object.entries(filters)) {
        whereParts.push(`${key} = ?`);
        params.push(val);
      }

      const whereClause = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

      const result = paginateResults(
        db,
        `SELECT * FROM ${tableName} ${whereClause} ORDER BY ${order} LIMIT ? OFFSET ?`,
        `SELECT COUNT(*) as count FROM ${tableName} ${whereClause}`,
        [...params, limit, offset],
        params,
        page,
        limit
      );

      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET ONE
  crudRouter.get("/:id", requireAuth, (req, res) => {
    try {
      const item = getById(tableName, req.params.id);
      if (!item || (userScoped && item[userCol] !== req.user.userId)) {
        return res.status(404).json({ success: false, error: "Not found" });
      }
      res.json({ success: true, data: item });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // CREATE
  crudRouter.post("/", requireAuth, (req, res) => {
    try {
      const data = { ...req.body };
      if (userScoped) {
        data[userCol] = req.user.userId;
      }
      const item = create(tableName, data);
      res.status(201).json({ success: true, data: item });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // UPDATE
  crudRouter.put("/:id", requireAuth, (req, res) => {
    try {
      const existing = getById(tableName, req.params.id);
      if (!existing || (userScoped && existing[userCol] !== req.user.userId)) {
        return res.status(404).json({ success: false, error: "Not found" });
      }
      const safeData = { ...req.body };
      if (userScoped) delete safeData[userCol];
      const item = update(tableName, req.params.id, safeData);
      res.json({ success: true, data: item });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // DELETE
  crudRouter.delete("/:id", requireAuth, (req, res) => {
    try {
      const existing = getById(tableName, req.params.id);
      if (!existing || (userScoped && existing[userCol] !== req.user.userId)) {
        return res.status(404).json({ success: false, error: "Not found" });
      }
      deleteRow(tableName, req.params.id);
      res.json({ success: true, message: "Deleted successfully" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return crudRouter;
}

// ---------------------------------------------------------------------------
// Default Items Routes
// ---------------------------------------------------------------------------

router.use("/items", createCrudRoutes("items", {
  allowedFilters: ["name"],
  allowedSorts: ["id", "name", "created_at"],
  userScoped: true,
}));

export default router;
