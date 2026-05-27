// Server-rendered admin dashboard — zero client JS, admin-only
// Shows OUR operational data, not user data. No IPs, no PII.
import { getUsageStats } from "./usage-tracking";
import { CORS_HEADERS } from "./helpers";

function num(n: number | undefined | null): string {
  return (n ?? 0).toLocaleString();
}

function gradeColor(grade: string): string {
  switch (grade) {
    case "A": return "#22c55e";
    case "B": return "#84cc16";
    case "C": return "#f59e0b";
    case "D": return "#f97316";
    case "F": return "#ef4444";
    default: return "#737373";
  }
}

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

  const recentDays = sortedDays.slice(-14);
  const ss = stats.score_stats;
  const es = stats.error_stats;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Yoke Admin Dashboard</title>
<style>
  :root { --bg: #0a0a0a; --surface: #141414; --border: #262626; --text: #e5e5e5; --muted: #737373; --accent: #f59e0b; --cyan: #00d2eb; --green: #22c55e; --red: #ef4444; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); padding: 2rem; max-width: 1200px; margin: 0 auto; }
  h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.25rem; }
  h2 { font-size: 1.1rem; font-weight: 600; color: var(--cyan); margin: 2rem 0 0.75rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
  .subtitle { color: var(--muted); font-size: 0.85rem; margin-bottom: 1.5rem; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 0.875rem; }
  .card-label { font-size: 0.7rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .card-value { font-size: 1.5rem; font-weight: 700; margin-top: 0.15rem; font-variant-numeric: tabular-nums; }
  .card-value.accent { color: var(--accent); }
  .card-value.cyan { color: var(--cyan); }
  .card-value.green { color: var(--green); }
  .card-sub { font-size: 0.7rem; color: var(--muted); margin-top: 0.15rem; }
  .chart { display: flex; align-items: flex-end; gap: 2px; height: 80px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 0.75rem; }
  .bar { flex: 1; border-radius: 2px 2px 0 0; min-width: 4px; position: relative; transition: opacity 0.15s; }
  .bar:hover { opacity: 0.8; }
  .bar-label { position: absolute; bottom: calc(100% + 4px); left: 50%; transform: translateX(-50%); font-size: 9px; color: var(--muted); white-space: nowrap; display: none; }
  .bar:hover .bar-label { display: block; }
  table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; font-size: 0.8rem; }
  th, td { padding: 0.4rem 0.6rem; text-align: right; border-bottom: 1px solid var(--border); }
  th { background: var(--bg); color: var(--muted); font-weight: 500; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.03em; position: sticky; top: 0; }
  td:first-child, th:first-child { text-align: left; }
  tr:last-child td { border-bottom: none; }
  .mono { font-family: "SF Mono", "Fira Code", monospace; font-size: 0.75rem; }
  .hits { font-variant-numeric: tabular-nums; }
  .zero { color: var(--muted); opacity: 0.4; }
  .nav { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
  .nav a { color: var(--muted); text-decoration: none; font-size: 0.8rem; padding: 0.25rem 0.75rem; border: 1px solid var(--border); border-radius: 4px; }
  .nav a.active { color: var(--accent); border-color: var(--accent); }
  .nav a:hover { border-color: var(--muted); }
  .pct-bar { display: inline-block; height: 10px; border-radius: 2px; margin-right: 0.5rem; vertical-align: middle; opacity: 0.7; }
  .row-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  @media (max-width: 768px) { .row-pair { grid-template-columns: 1fr; } }
  .grade-bar { display: flex; height: 24px; border-radius: 4px; overflow: hidden; gap: 1px; margin-top: 0.5rem; }
  .grade-seg { display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: #111; }
  .mini-table { width: 100%; }
  .mini-table td { padding: 0.3rem 0.5rem; font-size: 0.8rem; border-bottom: 1px solid var(--border); }
  .mini-table tr:last-child td { border-bottom: none; }
  .err-msg { color: var(--red); font-size: 0.75rem; word-break: break-all; }
  .err-time { color: var(--muted); font-size: 0.7rem; white-space: nowrap; }
  footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.75rem; text-align: center; }
  footer a { color: var(--cyan); text-decoration: none; }
</style>
</head>
<body>
<h1>⚡ Yoke Admin Dashboard</h1>
<p class="subtitle">Operational metrics · Last ${days} days · No user data</p>

<div class="nav">
  <a href="/usage?days=7" ${days === 7 ? 'class="active"' : ''}>7d</a>
  <a href="/usage?days=14" ${days === 14 ? 'class="active"' : ''}>14d</a>
  <a href="/usage?days=30" ${days === 30 ? 'class="active"' : ''}>30d</a>
  <a href="/usage?days=90" ${days === 90 ? 'class="active"' : ''}>90d</a>
</div>

<!-- ═══ API TRAFFIC ═══ -->
<h2>📡 API Traffic</h2>
<div class="cards">
  <div class="card">
    <div class="card-label">Total Hits</div>
    <div class="card-value accent">${num(stats.total)}</div>
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
    <div class="card-value">${sortedDays.length ? num(Math.round(stats.total / sortedDays.length)) : "—"}</div>
  </div>
</div>

<div class="chart">
  ${sortedDays.map(d => {
    const h = dayTotals[d];
    const pct = Math.max((h / maxDaily) * 100, 2);
    return `<div class="bar" style="height:${pct}%;background:var(--accent)"><span class="bar-label">${d.slice(5)} · ${h}</span></div>`;
  }).join("")}
</div>

<div style="margin-top:1rem">
<table>
  <thead><tr><th>Endpoint</th><th>Hits</th><th>%</th><th></th></tr></thead>
  <tbody>
    ${endpoints.map(([ep, total]) => {
      const pct = stats.total ? ((total / stats.total) * 100) : 0;
      return `<tr><td class="mono">${ep}</td><td class="hits">${num(total)}</td><td class="hits">${pct.toFixed(1)}%</td><td><span class="pct-bar" style="width:${Math.max(pct, 1)}px;background:var(--accent)"></span></td></tr>`;
    }).join("")}
  </tbody>
</table>
</div>

<!-- ═══ SCORING INTELLIGENCE ═══ -->
${ss ? `
<h2>🎯 Scoring Intelligence</h2>
<div class="cards">
  <div class="card">
    <div class="card-label">Total Scores</div>
    <div class="card-value cyan">${num(ss.total_scores)}</div>
  </div>
  <div class="card">
    <div class="card-label">Unique Domains</div>
    <div class="card-value cyan">${num(ss.unique_domains)}</div>
  </div>
  <div class="card">
    <div class="card-label">Avg Composite</div>
    <div class="card-value" style="color:${ss.avg_composite >= 80 ? 'var(--green)' : ss.avg_composite >= 60 ? 'var(--accent)' : 'var(--red)'}">${ss.avg_composite}/100</div>
  </div>
  <div class="card">
    <div class="card-label">Daily Snapshots</div>
    <div class="card-value">${num(stats.daily_snapshot_count)}</div>
    <div class="card-sub">longitudinal</div>
  </div>
</div>

${Object.keys(ss.grade_breakdown).length > 0 ? `
<div class="row-pair">
  <div>
    <div style="font-size:0.8rem;color:var(--muted);margin-bottom:0.25rem">Grade Distribution</div>
    <div class="grade-bar">
      ${["A","B","C","D","F"].map(g => {
        const cnt = ss.grade_breakdown[g] || 0;
        const pct = ss.total_scores ? (cnt / ss.total_scores * 100) : 0;
        if (pct < 1) return "";
        return `<div class="grade-seg" style="flex:${pct};background:${gradeColor(g)}">${g} ${Math.round(pct)}%</div>`;
      }).join("")}
    </div>
  </div>
  <div>
    <div style="font-size:0.8rem;color:var(--muted);margin-bottom:0.25rem">Archetype Breakdown</div>
    <table class="mini-table"><tbody>
      ${Object.entries(ss.archetype_breakdown).map(([arch, cnt]) => {
        const pct = ss.total_scores ? (cnt / ss.total_scores * 100) : 0;
        return `<tr><td>${arch}</td><td class="hits">${num(cnt)}</td><td class="hits">${pct.toFixed(0)}%</td></tr>`;
      }).join("")}
    </tbody></table>
  </div>
</div>
` : ""}

${ss.daily_scores.length > 0 ? `
<div style="margin-top:1rem">
  <div style="font-size:0.8rem;color:var(--muted);margin-bottom:0.25rem">Scores / Day (volume + avg)</div>
  <div class="chart">
    ${(() => {
      const maxCnt = Math.max(...ss.daily_scores.map(d => d.count), 1);
      return ss.daily_scores.map(d => {
        const pct = Math.max((d.count / maxCnt) * 100, 3);
        return `<div class="bar" style="height:${pct}%;background:var(--cyan)"><span class="bar-label">${d.date.slice(5)} · ${d.count} scores · avg ${d.avg}</span></div>`;
      }).join("");
    })()}
  </div>
</div>
` : ""}
` : ""}

<!-- ═══ TAB ENGAGEMENT ═══ -->
${stats.tab_views && Object.keys(stats.tab_views).length > 0 ? `
<h2>📊 Tab Engagement <span style="font-size:0.7rem;color:var(--muted);font-weight:400">(7d)</span></h2>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:0.5rem">
  ${Object.entries(stats.tab_views).map(([tab, cnt]) => `
    <div class="card" style="text-align:center;padding:0.6rem">
      <div class="card-label">${tab}</div>
      <div style="font-size:1.2rem;font-weight:700;color:var(--text);margin-top:0.1rem">${num(cnt)}</div>
    </div>
  `).join("")}
</div>
` : ""}

<!-- ═══ API ERRORS ═══ -->
${es && es.total > 0 ? `
<h2>🔴 API Errors</h2>
<div class="cards">
  <div class="card">
    <div class="card-label">Total Errors</div>
    <div class="card-value" style="color:var(--red)">${num(es.total)}</div>
  </div>
  ${Object.entries(es.by_api).slice(0, 4).map(([api, cnt]) => `
  <div class="card">
    <div class="card-label">${api}</div>
    <div class="card-value" style="color:var(--red)">${num(cnt)}</div>
  </div>
  `).join("")}
</div>
${es.recent.length > 0 ? `
<table>
  <thead><tr><th>Time</th><th>API</th><th>Error</th></tr></thead>
  <tbody>
    ${es.recent.map(r => `<tr>
      <td class="err-time">${new Date(r.ts).toISOString().slice(0,16).replace("T"," ")}</td>
      <td class="mono">${r.api}</td>
      <td class="err-msg">${r.error}</td>
    </tr>`).join("")}
  </tbody>
</table>
` : ""}
` : ""}

<!-- ═══ DAILY BREAKDOWN ═══ -->
${recentDays.length > 0 ? `
<h2>📅 Daily Breakdown <span style="font-size:0.7rem;color:var(--muted);font-weight:400">(last ${recentDays.length}d)</span></h2>
<div style="overflow-x:auto">
<table>
  <thead><tr><th>Endpoint</th>${recentDays.map(d => `<th>${d.slice(5)}</th>`).join("")}</tr></thead>
  <tbody>
    ${endpoints.map(([ep]) => `<tr>
      <td class="mono">${ep}</td>
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
` : ""}

<footer>
  <a href="/api/usage">JSON API</a> · <a href="/status">Status</a> · <a href="/api/cleanup">Run Cleanup</a> · All data is aggregated — no IPs, no PII
</footer>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-store", ...CORS_HEADERS },
  });
}
