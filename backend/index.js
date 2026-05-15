import express from "express";
import cors from "cors";
import pkg from "pg";
const { Pool } = pkg;
import { nanoid } from "nanoid";
import "dotenv/config";

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Database ───────────────────────────────────────────────────────────────
// Railway injects DATABASE_URL automatically when you add a Postgres service
const pool = new Pool({
  connectionString:
    process.env.NODE_ENV === "production"
      ? process.env.DATABASE_URL
      : "postgresql://postgres:postgres@localhost:5432/shorturl",
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS links (
      id         SERIAL PRIMARY KEY,
      slug       TEXT UNIQUE NOT NULL,
      url        TEXT NOT NULL,
      title      TEXT,
      clicks     INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log("✅ Database ready");
}

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Health check — Railway uses this ───────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "url-shortener-api",
    region: process.env.RAILWAY_REGION || "local",
    environment: process.env.RAILWAY_ENVIRONMENT || "development",
    uptime: Math.round(process.uptime()),
  });
});

// ─── API: Create a short link ────────────────────────────────────────────────
app.post("/api/links", async (req, res) => {
  const { url, title, customSlug } = req.body || {};

  if (!url) return res.status(400).json({ error: "url is required" });

  try {
    new URL(url); // validate URL
  } catch {
    return res.status(400).json({ error: "invalid URL" });
  }

  const slug = customSlug?.trim() || nanoid(6);

  try {
    const result = await pool.query(
      `INSERT INTO links (slug, url, title)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO NOTHING
       RETURNING *`,
      [slug, url, title || null],
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: "slug already taken" });
    }

    const link = result.rows[0];
    const shortUrl = `${process.env.RAILWAY_PUBLIC_DOMAIN || `http://localhost:${PORT}`}/r/${link.slug}`;
    res.status(201).json({ ...link, shortUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
});

// ─── API: List all links ─────────────────────────────────────────────────────
app.get("/api/links", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT *, 
        TO_CHAR(created_at, 'Mon DD, YYYY') AS created_pretty
       FROM links 
       ORDER BY created_at DESC 
       LIMIT 50`,
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
});

// ─── API: Get stats for one link ─────────────────────────────────────────────
app.get("/api/links/:slug/stats", async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM links WHERE slug = $1`, [
      req.params.slug,
    ]);
    if (result.rows.length === 0)
      return res.status(404).json({ error: "not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "database error" });
  }
});

// ─── Redirect: /r/:slug ──────────────────────────────────────────────────────
app.get("/r/:slug", async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE links SET clicks = clicks + 1 
       WHERE slug = $1 
       RETURNING url`,
      [req.params.slug],
    );

    if (result.rows.length === 0) {
      return res.status(404).send("Link not found");
    }
    console.log(`Redirecting /r/${req.params.slug} to ${result.rows[0].url}`);
    res.redirect(302, result.rows[0].url);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// ─── Delete a link ────────────────────────────────────────────────────────────
app.delete("/api/links/:slug", async (req, res) => {
  try {
    await pool.query(`DELETE FROM links WHERE slug = $1`, [req.params.slug]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "database error" });
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 API running on port ${PORT}`);
      console.log(`   Region:      ${process.env.RAILWAY_REGION || "local"}`);
      console.log(
        `   Environment: ${process.env.RAILWAY_ENVIRONMENT || "development"}`,
      );
    });
  })
  .catch((err) => {
    console.error("Failed to connect to database:", err.message);
    console.error("Set DATABASE_URL to a valid Postgres connection string");
    process.exit(1);
  });
