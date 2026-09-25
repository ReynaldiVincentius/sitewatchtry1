# Uptime Monitor

An automated website uptime and performance monitor built with vanilla JS and GitHub Actions — no server or paid services required.

## Live Demo

<!-- TODO: paste your GitHub Pages URL here after deploying, e.g. -->
<!-- https://reynaldivincentius.github.io/uptime-monitor/ -->

Live demo: `https://<YOUR-USERNAME>.github.io/<REPO>/` *(replace with your real Pages URL)*

## How It Works

Think of this as a miniature version of the monitoring systems used in IT support (like UptimeRobot or Nagios), rebuilt with free GitHub primitives:

1. **Watch list** — `sites.config.json` holds the 5 public sites being watched (name + URL). Adding a site is a one-line JSON edit.
2. **Scheduled probe** — every 30 minutes, the `Uptime check` GitHub Action wakes up a free Ubuntu runner, installs Node, and runs `node scripts/check-sites.js`. The script makes a real HTTPS request to each site and records the HTTP status code, response time in milliseconds, an UP/DOWN verdict (DOWN on timeout after 10s, network error, or HTTP ≥ 400), and an ISO timestamp.
3. **File-as-database** — results are appended to `data/status.json` in the repo itself (last 100 checks per site, older entries trimmed). The Action commits the file back with the default `GITHUB_TOKEN`, so history accumulates without any database or server.
4. **Read-only dashboard** — `index.html` + `script.js` fetch `data/status.json` on GitHub Pages (pure static hosting) and render status cards, uptime percentages computed from history, a Chart.js response-time trend, and a recent-checks table. No backend calls at view time.
5. **On-demand runs** — `workflow_dispatch` lets you trigger a check manually from the Actions tab for demos, plus `node scripts/check-sites.js` works locally.

## Tech Stack

- **Front end:** HTML5, CSS3, vanilla JavaScript, Chart.js via CDN (`https://cdn.jsdelivr.net/npm/chart.js`)
- **Automation:** Node.js 20 (built-in `https`/`http` only, no dependencies), GitHub Actions (cron `*/30 * * * *` + `workflow_dispatch`)
- **Storage:** `data/status.json` in-repo, committed by the Action bot

## IT Support Skills Demonstrated

- **Regular monitoring of uptime/performance** — 5 real sites probed every 30 minutes; dashboard shows current UP/DOWN badges, live response times, and per-site uptime % derived from stored history rather than hardcoded values.
- **Generating periodic reports from collected data** — the response-time chart (last 20/50/100 checks), recent-checks table, and "last checked" timestamp turn raw probe logs into a glanceable status report a support team could review each morning.
- **Automation to reduce manual checking** — scheduled Action + auto-commit + 100-per-site retention means nobody has to ping sites by hand or prune logs; manual runs and local runs cover demos and incident verification.

## Setup / Local Run

No install step — the checker uses Node built-ins only.

```bash
# 1. Run a real check (writes data/status.json)
node scripts/check-sites.js

# 2. View the dashboard (data loads via fetch, so use a static server)
python -m http.server 8000
# visit http://localhost:8000
```

To monitor different sites, edit `sites.config.json`:

```json
{ "sites": [{ "name": "Example", "url": "https://example.com" }] }
```

**Deploy:** push to GitHub, enable Pages (Settings → Pages → `main` / root), then run the `Uptime check` workflow once manually so `data/status.json` has real data immediately.

## Screenshot

<!-- TODO: add a screenshot after first deploy, e.g. docs/screenshot.png -->
![dashboard screenshot](docs/screenshot.png)

## What I'd Add Next

1. **Downtime alerts** — send email/Slack on DOWN (e.g. a second workflow step that posts to a Slack webhook only when a check reports DOWN, with the URL + timestamp).
2. **Monitor more sites + per-site thresholds** — extend `sites.config.json` with expected status codes and max-acceptable response times, and surface breaching sites in amber.
3. **Weekly PDF report** — a scheduled job that aggregates the week's uptime % and slowest responses into a one-page summary (committed to `reports/` or emailed to stakeholders).

## Project Structure

```
.
├── index.html                 # Dashboard (cards, chart, table, empty-state)
├── style.css                  # Dark ops theme, responsive
├── script.js                  # Fetches data/status.json, renders UI + Chart.js
├── sites.config.json          # Monitored URLs (edit me)
├── scripts/check-sites.js     # Real HTTP probes (Node built-ins only)
├── data/status.json           # Check history (auto-updated, last 100/site)
├── .github/workflows/check-sites.yml
└── README.md
```
