/* Uptime Monitor dashboard — reads data/status.json, renders cards + Chart.js trend */
(function () {
  "use strict";

  var DATA_URL = "data/status.json";
  var PALETTE = ["#3fb950", "#58a6ff", "#d29922", "#f778ba", "#bc8cff", "#39c5cf"];
  var chart = null;

  function fmtTime(iso) {
    try {
      return new Date(iso).toLocaleString();
    } catch (e) {
      return iso || "—";
    }
  }

  function groupByUrl(checks) {
    var map = {};
    checks.forEach(function (c) {
      if (!map[c.url]) map[c.url] = [];
      map[c.url].push(c);
    });
    Object.keys(map).forEach(function (url) {
      map[url].sort(function (a, b) { return a.timestamp < b.timestamp ? -1 : 1; });
    });
    return map;
  }

  function uptimePct(list) {
    if (!list.length) return null;
    var up = list.filter(function (c) { return c.status === "UP"; }).length;
    return (up / list.length) * 100;
  }

  function latest(list) {
    return list[list.length - 1];
  }

  function renderCards(grouped, order) {
    var wrap = document.getElementById("cards");
    wrap.innerHTML = "";
    order.forEach(function (url) {
      var list = grouped[url];
      var last = latest(list);
      var pct = uptimePct(list);
      var card = document.createElement("article");
      card.className = "card";
      card.innerHTML =
        '<div class="card-top"><div><p class="card-name"></p><p class="card-url mono"></p></div><span class="badge"></span></div>' +
        '<div class="card-stats">' +
        '<div class="stat"><p class="stat-label">Response</p><p class="stat-value mono" data-f="rt"></p></div>' +
        '<div class="stat"><p class="stat-label">Uptime</p><p class="stat-value" data-f="up"></p></div>' +
        '<div class="stat"><p class="stat-label">Checks</p><p class="stat-value mono" data-f="n"></p></div>' +
        "</div>";
      card.querySelector(".card-name").textContent = last.name || last.url;
      card.querySelector(".card-url").textContent = last.url;
      var badge = card.querySelector(".badge");
      badge.textContent = last.status;
      badge.classList.add(last.status === "UP" ? "up" : "down");
      card.querySelector('[data-f="rt"]').textContent =
        last.responseTimeMs !== null && last.responseTimeMs !== undefined
          ? last.responseTimeMs + " ms"
          : "—";
      card.querySelector('[data-f="up"]').textContent =
        pct === null ? "—" : pct.toFixed(1) + "%";
      card.querySelector('[data-f="n"]').textContent = String(list.length);
      wrap.appendChild(card);
    });
  }

  function renderTable(checks) {
    var body = document.getElementById("checks-body");
    body.innerHTML = "";
    var recent = checks.slice(-15).reverse();
    recent.forEach(function (c) {
      var tr = document.createElement("tr");
      var statusCls = c.status === "UP" ? "row-up" : "row-down";
      tr.innerHTML =
        "<td></td><td></td>" +
        '<td class="' + statusCls + '"></td>' +
        "<td class='mono'></td><td class='mono'></td>";
      tr.children[0].textContent = fmtTime(c.timestamp);
      tr.children[1].textContent = c.name || c.url;
      tr.children[2].textContent = c.status;
      tr.children[3].textContent =
        c.statusCode !== null && c.statusCode !== undefined ? String(c.statusCode) : "—";
      tr.children[4].textContent =
        c.responseTimeMs !== null && c.responseTimeMs !== undefined
          ? c.responseTimeMs + " ms"
          : "—";
      body.appendChild(tr);
    });
  }

  function renderChart(grouped, order, limit) {
    var canvas = document.getElementById("rt-chart");
    if (!canvas || typeof Chart === "undefined") return;
    // Use union of recent timestamps as labels (HH:MM).
    var perSite = order.map(function (url) { return grouped[url].slice(-limit); });
    var labels = perSite.length
      ? perSite[0].map(function (c) {
          var d = new Date(c.timestamp);
          return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        })
      : [];
    var datasets = perSite.map(function (list, i) {
      return {
        label: (list[0] && (list[0].name || list[0].url)) || order[i],
        data: list.map(function (c) { return c.responseTimeMs; }),
        borderColor: PALETTE[i % PALETTE.length],
        backgroundColor: PALETTE[i % PALETTE.length],
        tension: 0.25,
        pointRadius: 2,
      };
    });
    if (chart) chart.destroy();
    chart = new Chart(canvas, {
      type: "line",
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { labels: { color: "#e6edf3" } } },
        scales: {
          x: { ticks: { color: "#8b949e", maxTicksLimit: 8 } },
          y: {
            ticks: { color: "#8b949e" },
            title: { display: true, text: "ms", color: "#8b949e" },
          },
        },
      },
    });
  }

  function renderAll(checks, lastUpdated) {
    var notice = document.getElementById("empty-notice");
    var grouped = groupByUrl(checks);
    var order = Object.keys(grouped).sort();
    var limit = parseInt(document.getElementById("range-select").value, 10) || 20;

    if (!checks.length) {
      notice.hidden = false;
      document.getElementById("summary-line").textContent = "No data yet";
      document.getElementById("last-checked").textContent = "—";
      return;
    }
    notice.hidden = true;

    var allUp = order.every(function (url) { return latest(grouped[url]).status === "UP"; });
    var dot = document.getElementById("global-dot");
    dot.classList.toggle("up", allUp);
    dot.classList.toggle("down", !allUp);
    document.getElementById("summary-line").textContent = allUp
      ? "All systems operational"
      : "Attention: one or more sites down";

    var ts = lastUpdated || (checks.length && checks[checks.length - 1].timestamp);
    document.getElementById("last-checked").textContent = ts ? fmtTime(ts) : "—";
    document.getElementById("range-line").textContent =
      "Response time over the last " + limit + " checks per site · auto-updated every 30 min by GitHub Actions";

    renderCards(grouped, order);
    renderTable(checks);
    renderChart(grouped, order, limit);
  }

  function load() {
    fetch(DATA_URL, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        renderAll(data.checks || [], data.lastUpdated);
      })
      .catch(function () {
        document.getElementById("empty-notice").hidden = false;
        document.getElementById("summary-line").textContent = "Could not load data/status.json";
      });
  }

  document.getElementById("range-select").addEventListener("change", load);
  load();
})();
