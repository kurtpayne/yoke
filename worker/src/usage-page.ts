// Server-rendered usage analytics dashboard — zero client JS, admin-only
import { getUsageStats } from "./usage-tracking";
import { CORS_HEADERS } from "./helpers";

export async function renderUsagePage(db: D1Database, days = 30): Promise<Response> {
  const stats = await getUsageStats(db, days);

  // Build daily totals for the sparkline chart
  const dayTotals: Record<string, number> = {};
  for (const row of stats.by_day) {
    dayTotals[row.day] = (dayTotals[row.day] || 0) + row.hits;
  }
  const sortedDays = Object.keys(dayTotals).sort();
  const maxDaily = Math.max(...Object.values(dayTotals), 1);

  // All known endpoints sorted by total hits
  const endpoints = Object.entries(stats.by_endpoint).sort((a, b) => b[1] - a[1]);

  // Per-endpoint per-day breakdown for the table
  const endpointDays: Record<string, Record<string, number>> = {};
  for (const row of stats.by_day) {
    if (!endpointDays[row.endpoint]) endpointDays[row.endpoint] = {};
    endpointDays[row.endpoint][row.day] = row.hits;
  }

  // Last 14 days for the detailed table
  const recentDays = sortedDays.slice(-14);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Yoke Usage Dashboard</title>
<style>
  :root { --bg: #0a0a0a; --surface: #141414; --border: #262626; --text: #e5e5e5; --muted: #737373; --accent: #f59e0b; --green: #22c55e; --red: #ef4444; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); padding: 2rem; max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.25rem; }
  .subtitle { color: var(--muted); font-size: 0.85rem; margin-bottom: 2rem; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; }
  .card-label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .card-value { font-size: 1.75rem; font-weight: 700; margin-top: 0.25rem; font-variant-numeric: tabular-nums; }
  .card-value.accent { color: var(--accent); }
  .section { margin-bottom: 2rem; }
  .section-title { font-size: 1rem; font-weight: 600; margin-bottom: 0.75rem; color: var(--muted); }
  .chart { display: flex; align-items: flex-end; gap: 2px; height: 80px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 0.75rem; }
  .bar { flex: 1; background: var(--accent); border-radius: 2px 2px 0 0; min-width: 4px; position: relative; transition: opacity 0.15s; }
  .bar:hover { opacity: 0.8; }
  .bar-label { position: absolute; bottom: calc(100% + 4px); left: 50%; transform: translateX(-50%); font-size: 9px; color: var(--muted); white-space: nowrap; display: none; }
  .bar:hover .bar-label { display: block; }
  table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; font-size: 0.85rem; }
  th, td { padding: 0.5rem 0.75rem; text-align: right; border-bottom: 1px solid var(--border); }
  th { background: var(--bg); color: var(--muted); font-weight: 500; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.03em; position: sticky; top: 0; }
  td:first-child, th:first-child { text-align: left; }
  tr:last-child td { border-bottom: none; }
  .endpoint-name { font-family: "SF Mono", "Fira Code", monospace; font-size: 0.8rem; }
  .hits { font-variant-numeric: tabular-nums; }
  .zero { color: var(--muted); opacity: 0.4; }
  .nav { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
  .nav a { color: var(--muted); text-decoration: none; font-size: 0.8rem; padding: 0.25rem 0.75rem; border: 1px solid var(--border); border-radius: 4px; }
  .nav a.active { color: var(--accent); border-color: var(--accent); }
  .nav a:hover { border-color: var(--muted); }
  .pct-bar { display: inline-block; height: 10px; background: var(--accent); border-radius: 2px; margin-right: 0.5rem; vertical-align: middle; opacity: 0.7; }
  footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.75rem; text-align: center; }
</style>
</head>
<body>
<h1>⚡ Yoke Usage Dashboard</h1>
<p class="subtitle">Endpoint hit counters · Last ${days} days · Admin only</p>

<div class="nav">
  <a href="/usage?days=7" ${days === 7 ? 'class="active"' : ''}>7d</a>
  <a href="/usage?days=14" ${days === 14 ? 'class="active"' : ''}>14d</a>
  <a href="/usage?days=30" ${days === 30 ? 'class="active"' : ''}>30d</a>
  <a href="/usage?days=90" ${days === 90 ? 'class="active"' : ''}>90d</a>
</div>

<div class="cards">
  <div class="card">
    <div class="card-label">Total Hits</div>
    <div class="card-value accent">${stats.total.toLocaleString()}</div>
  </div>
  <div class="card">
    <div class="card-label">Endpoints</div>
    <div class="card-value">${endpoints.length}</div>
  </div>
  <div class="card">
    <div class="card-label">Active Days</div>
    <div class="card-value">${sortedDays.length}</div>
  </div>
  <div class="card">
    <div class="card-label">Avg / Day</div>
    <div class="card-value">${sortedDays.length ? Math.round(stats.total / sortedDays.length).toLocaleString() : "—"}</div>
  </div>
</div>

<div class="section">
  <div class="section-title">Daily Volume</div>
  <div class="chart">
    ${sortedDays.map(d => {
      const h = dayTotals[d];
      const pct = Math.max((h / maxDaily) * 100, 2);
      return `<div class="bar" style="height:${pct}%"><span class="bar-label">${d.slice(5)} · ${h}</span></div>`;
    }).join("")}
  </div>
</div>

<div class="section">
  <div class="section-title">By Endpoint</div>
  <table>
    <thead>
      <tr>
        <th>Endpoint</th>
        <th>Hits</th>
        <th>% of Total</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      ${endpoints.map(([ep, total]) => {
        const pct = stats.total ? ((total / stats.total) * 100) : 0;
        return `<tr>
          <td class="endpoint-name">${ep}</td>
          <td class="hits">${total.toLocaleString()}</td>
          <td class="hits">${pct.toFixed(1)}%</td>
          <td><span class="pct-bar" style="width:${Math.max(pct, 1)}px"></span></td>
        </tr>`;
      }).join("")}
    </tbody>
  </table>
</div>

${recentDays.length > 0 ? `
<div class="section">
  <div class="section-title">Daily Breakdown (Last ${recentDays.length} Days)</div>
  <div style="overflow-x:auto">
  <table>
    <thead>
      <tr>
        <th>Endpoint</th>
        ${recentDays.map(d => `<th>${d.slice(5)}</th>`).join("")}
      </tr>
    </thead>
    <tbody>
      ${endpoints.map(([ep]) => `<tr>
        <td class="endpoint-name">${ep}</td>
        ${recentDays.map(d => {
          const v = endpointDays[ep]?.[d] || 0;
          return `<td class="hits ${v === 0 ? "zero" : ""}">${v || "·"}</td>`;
        }).join("")}
      </tr>`).join("")}
      <tr style="font-weight:600">
        <td>Total</td>
        ${recentDays.map(d => `<td class="hits">${dayTotals[d] || 0}</td>`).join("")}
      </tr>
    </tbody>
  </table>
  </div>
</div>
` : ""}

<footer>
  <a href="/api/usage" style="color:var(--accent);text-decoration:none">JSON API</a> · Data resets with D1 cache prune · <a href="/status" style="color:var(--muted);text-decoration:none">Status</a>
</footer>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-store", ...CORS_HEADERS },
  });
}
