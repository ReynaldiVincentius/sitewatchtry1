/* ============================================================
 * check-sites.js — real uptime/performance checks
 *
 * Reads sites.config.json, performs one HTTPS(S) GET per site,
 * records { url, name, statusCode, responseTimeMs, status, timestamp },
 * appends to data/status.json, keeping the last 100 checks per site.
 *
 * UP   = responded within 10s with HTTP status < 400
 * DOWN = timeout, network error, or HTTP status >= 400
 *
 * Node built-ins only (https, http, fs, path). No API keys.
 * Run:  node scripts/check-sites.js
 * ============================================================ */
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const TIMEOUT_MS = 10_000;
const KEEP_PER_SITE = 100;

const ROOT = path.join(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "sites.config.json");
const DATA_PATH = path.join(ROOT, "data", "status.json");

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.sites) || parsed.sites.length === 0) {
    throw new Error("sites.config.json must contain a non-empty \"sites\" array");
  }
  return parsed.sites.map((s) => ({
    name: String(s.name || s.url),
    url: String(s.url),
  }));
}

function loadHistory() {
  try {
    const raw = fs.readFileSync(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.checks)) return parsed;
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  return { checks: [] };
}

function checkOne(site) {
  return new Promise((resolve) => {
    const started = Date.now();
    let mod;
    try {
      const u = new URL(site.url);
      mod = u.protocol === "http:" ? http : https;
    } catch (err) {
      resolve({
        url: site.url,
        name: site.name,
        statusCode: null,
        responseTimeMs: Date.now() - started,
        status: "DOWN",
        error: "invalid-url",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const req = mod.get(
      site.url,
      { timeout: TIMEOUT_MS, headers: { "User-Agent": "uptime-monitor/1.0" } },
      (res) => {
        // Drain body so 'end' fires; we only need status + timing.
        res.resume();
        res.on("end", () => {
          const ms = Date.now() - started;
          const code = res.statusCode || 0;
          resolve({
            url: site.url,
            name: site.name,
            statusCode: code,
            responseTimeMs: ms,
            status: code >= 200 && code < 400 ? "UP" : "DOWN",
            timestamp: new Date().toISOString(),
          });
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("timeout after " + TIMEOUT_MS + "ms"));
    });

    req.on("error", (err) => {
      resolve({
        url: site.url,
        name: site.name,
        statusCode: null,
        responseTimeMs: Date.now() - started,
        status: "DOWN",
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    });
  });
}

function trimHistory(checks) {
  const byUrl = new Map();
  for (const c of checks) {
    if (!byUrl.has(c.url)) byUrl.set(c.url, []);
    byUrl.get(c.url).push(c);
  }
  const out = [];
  for (const [, list] of byUrl) {
    // Keep chronological order, last KEEP_PER_SITE entries.
    list.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
    out.push(...list.slice(-KEEP_PER_SITE));
  }
  out.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
  return out;
}

async function main() {
  const sites = loadConfig();
  console.log(`Checking ${sites.length} site(s)...`);

  const results = [];
  for (const site of sites) {
    const r = await checkOne(site);
    results.push(r);
    const detail =
      r.statusCode !== null && r.statusCode !== undefined
        ? `HTTP ${r.statusCode}`
        : `ERROR (${r.error || "request failed"})`;
    console.log(
      `  [${r.status}] ${r.name} (${r.url}) — ${detail} in ${r.responseTimeMs}ms`
    );
  }

  const history = loadHistory();
  history.checks = trimHistory([...history.checks, ...results]);
  history.lastUpdated = new Date().toISOString();
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(history, null, 2) + "\n");

  const up = results.filter((r) => r.status === "UP").length;
  console.log(
    `Done: ${up}/${results.length} UP. Appended ${results.length} check(s) to data/status.json (kept last ${KEEP_PER_SITE} per site).`
  );

  // Non-zero exit if everything is down (surfaces failures in Action logs).
  if (up === 0 && results.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("check-sites.js failed:", err.message);
  process.exitCode = 1;
});
