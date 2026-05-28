// Share card system — payload encoding, OG tags, dynamic OG image, report card page
// Route handlers for /r/:payload.:sig and /og/:payload.:sig.svg

import type { Env } from "./helpers";
import { getBaseUrl } from "./helpers";
import { getHtmlSecurityHeaders } from "./spa";

// ─── Ox Mark Logo (base64 PNG) ───────────────────────────────────────
const OX_LOGO_DATA_URI = "data:image/png;base64,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";

// ─── Types ───────────────────────────────────────────────────────────

interface SharePayload {
  d: string;  // domain
  s: number;  // composite score
  g: string;  // grade
  a: number[]; // axis scores [security, reliability, trust, performance, visibility]
  t: number;  // unix timestamp (seconds)
}

// ─── Base64url helpers ───────────────────────────────────────────────

function base64urlEncode(data: Uint8Array): string {
  let b64 = "";
  const bytes = data;
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    const triplet = (b0 << 16) | (b1 << 8) | b2;
    b64 += "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"[(triplet >> 18) & 0x3f];
    b64 += "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"[(triplet >> 12) & 0x3f];
    b64 += i + 1 < len ? "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"[(triplet >> 6) & 0x3f] : "";
    b64 += i + 2 < len ? "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"[triplet & 0x3f] : "";
  }
  // Convert to URL-safe: + → -, / → _, strip =
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str: string): Uint8Array {
  // Restore standard base64
  let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const binaryStr = atob(b64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  return bytes;
}

function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

// ─── HMAC ────────────────────────────────────────────────────────────

const DEV_FALLBACK_SECRET = "yoke-dev-share-secret-do-not-use-in-production";

async function getHmacKey(env: Env): Promise<CryptoKey> {
  const secret = (env as Record<string, unknown>).SHARE_SECRET as string | undefined || DEV_FALLBACK_SECRET;
  return crypto.subtle.importKey(
    "raw",
    textToBytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signPayload(payload: string, env: Env): Promise<string> {
  const key = await getHmacKey(env);
  const sig = await crypto.subtle.sign("HMAC", key, textToBytes(payload));
  return base64urlEncode(new Uint8Array(sig));
}

async function verifyPayload(payload: string, signature: string, env: Env): Promise<boolean> {
  const key = await getHmacKey(env);
  try {
    const sigBytes = base64urlDecode(signature);
    return crypto.subtle.verify("HMAC", key, sigBytes, textToBytes(payload));
  } catch {
    return false;
  }
}

// ─── Payload parsing ─────────────────────────────────────────────────

function parseShareToken(token: string): { payload: string; signature: string; data: SharePayload } | null {
  // Token format: PAYLOAD.SIGNATURE (both base64url)
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx < 1) return null;
  const payload = token.substring(0, dotIdx);
  const signature = token.substring(dotIdx + 1);
  try {
    const jsonStr = bytesToText(base64urlDecode(payload));
    const data = JSON.parse(jsonStr) as SharePayload;
    if (!data.d || typeof data.s !== "number" || !data.g || !Array.isArray(data.a) || data.a.length !== 5) {
      return null;
    }
    return { payload, signature, data };
  } catch {
    return null;
  }
}

// ─── Signing endpoint ────────────────────────────────────────────────

export async function handleShareSign(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { payload?: string };
  if (!body.payload || typeof body.payload !== "string") {
    return new Response(JSON.stringify({ error: "payload is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
  // Validate the payload is well-formed before signing
  try {
    const jsonStr = bytesToText(base64urlDecode(body.payload));
    const data = JSON.parse(jsonStr);
    if (!data.d || typeof data.s !== "number" || !data.g) {
      throw new Error("Invalid payload shape");
    }
  } catch {
    return new Response(JSON.stringify({ error: "Invalid payload format" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
  const sig = await signPayload(body.payload, env);
  return new Response(JSON.stringify({ signature: sig }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

// ─── HTML helpers ────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#39;");
}

function gradeColor(grade: string): string {
  if (grade === "A") return "#3fb950";
  if (grade === "B") return "#7ee787";
  if (grade === "C") return "#d29922";
  if (grade === "D") return "#ffa198";
  return "#f85149";
}

function scoreColor(score: number): string {
  if (score >= 90) return "#3fb950";  // green (matches --success)
  if (score >= 80) return "#7ee787";  // light green
  if (score >= 70) return "#d29922";  // amber (matches --warning)
  if (score >= 60) return "#ffa198";  // light red
  return "#f85149";                   // red (matches --danger)
}

const AXIS_LABELS = ["Security", "Reliability", "Trust", "Performance", "Visibility"];

// ─── OG Image (SVG) ─────────────────────────────────────────────────

function generateOgSvg(data: SharePayload): string {
  const domain = esc(data.d);
  const score = data.s;
  const grade = data.g;
  const gc = gradeColor(grade);
  const sc = scoreColor(score);

  // 1200×630 SVG
  const bars = data.a.map((val, i) => {
    const y = 230 + i * 60;
    const barWidth = Math.max(4, (val / 100) * 460);
    const color = scoreColor(val);
    return `
      <text x="660" y="${y + 4}" fill="#8b949e" font-family="system-ui,-apple-system,sans-serif" font-size="16" text-anchor="end">${AXIS_LABELS[i]}</text>
      <rect x="680" y="${y - 12}" width="460" height="24" rx="4" fill="#21262d"/>
      <rect x="680" y="${y - 12}" width="${barWidth}" height="24" rx="4" fill="${color}" opacity="0.85"/>
      <text x="1152" y="${y + 4}" fill="#e6edf3" font-family="system-ui,-apple-system,sans-serif" font-size="15" text-anchor="end">${val}</text>
    `;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d1117"/>
      <stop offset="100%" stop-color="#161b22"/>
    </linearGradient>
    <linearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${gc}" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="${gc}" stop-opacity="0"/>
    </linearGradient>
    <filter id="invert">
      <feColorMatrix type="matrix" values="-1 0 0 0 1  0 -1 0 0 1  0 0 -1 0 1  0 0 0 1 0"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="200" fill="url(#glow)"/>

  <!-- Border -->
  <rect x="0.5" y="0.5" width="1199" height="629" rx="0" fill="none" stroke="#30363d" stroke-width="1"/>

  <!-- Yoke branding -->
  <image x="56" y="50" width="28" height="28" href="${OX_LOGO_DATA_URI}" filter="url(#invert)" opacity="0.7"/>
  <text x="92" y="72" fill="#8b949e" font-family="system-ui,-apple-system,sans-serif" font-size="18" font-weight="600" letter-spacing="2">YOKE</text>
  <text x="170" y="72" fill="#484f58" font-family="system-ui,-apple-system,sans-serif" font-size="14">DOMAIN INTELLIGENCE</text>

  <!-- Domain name -->
  <text x="60" y="146" fill="#e6edf3" font-family="system-ui,-apple-system,sans-serif" font-size="46" font-weight="700">${domain.length > 28 ? domain.substring(0, 28) + "…" : domain}</text>

  <!-- Divider -->
  <line x1="60" y1="175" x2="580" y2="175" stroke="#30363d" stroke-width="1"/>

  <!-- Score circle -->
  <circle cx="200" cy="370" r="120" fill="none" stroke="#21262d" stroke-width="8"/>
  <circle cx="200" cy="370" r="120" fill="none" stroke="${sc}" stroke-width="8" stroke-dasharray="${(score / 100) * 754} 754" stroke-linecap="round" transform="rotate(-90 200 370)" opacity="0.7"/>
  <circle cx="200" cy="370" r="100" fill="#0d1117" opacity="0.5"/>
  <text x="200" y="358" fill="${sc}" font-family="system-ui,-apple-system,sans-serif" font-size="72" font-weight="700" text-anchor="middle" dominant-baseline="middle">${score}</text>
  <text x="200" y="420" fill="#8b949e" font-family="system-ui,-apple-system,sans-serif" font-size="16" text-anchor="middle"></text>

  <!-- Grade badge -->
  <rect x="400" y="332" width="80" height="80" rx="16" fill="${gc}" opacity="0.15" stroke="${gc}" stroke-width="2"/>
  <text x="440" y="385" fill="${gc}" font-family="system-ui,-apple-system,sans-serif" font-size="48" font-weight="700" text-anchor="middle" dominant-baseline="middle">${esc(grade)}</text>

  <!-- Axis scores -->
  ${bars}

  <!-- Footer -->
  <text x="60" y="585" fill="#484f58" font-family="system-ui,-apple-system,sans-serif" font-size="13">yoke.lol — Free domain intelligence report</text>
  <text x="1140" y="585" fill="#484f58" font-family="system-ui,-apple-system,sans-serif" font-size="13" text-anchor="end">Analyzed ${new Date(data.t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</text>
</svg>`;
}

// ─── Report card page ────────────────────────────────────────────────

function generateReportPage(data: SharePayload, baseUrl: string, token: string): string {
  const domain = esc(data.d);
  const score = data.s;
  const grade = data.g;
  const gc = gradeColor(grade);
  const sc = scoreColor(score);
  const analyzedDate = new Date(data.t * 1000).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
  const ogImageUrl = `${baseUrl}/og/${esc(token)}.svg`;
  const shareUrl = `${baseUrl}/r/${esc(token)}`;

  const axisBarsHtml = data.a.map((val, i) => {
    const color = scoreColor(val);
    return `
      <div class="axis-row">
        <span class="axis-label">${AXIS_LABELS[i]}</span>
        <div class="axis-bar-track">
          <div class="axis-bar-fill" style="width:${Math.max(2, val)}%;background:${color}"></div>
        </div>
        <span class="axis-val" style="color:${color}">${val}</span>
      </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${domain} scored ${score}/100 (${esc(grade)}) — Yoke</title>
  <meta name="description" content="Security ${data.a[0]} · Reliability ${data.a[1]} · Trust ${data.a[2]} · Performance ${data.a[3]} · Visibility ${data.a[4]} — Free domain intelligence report"/>
  <meta property="og:type" content="website"/>
  <meta property="og:title" content="${domain} scored ${score}/100 (${esc(grade)}) — Yoke"/>
  <meta property="og:description" content="Security ${data.a[0]} · Reliability ${data.a[1]} · Trust ${data.a[2]} · Performance ${data.a[3]} · Visibility ${data.a[4]} — Free domain intelligence report"/>
  <meta property="og:image" content="${ogImageUrl}"/>
  <meta property="og:image:type" content="image/svg+xml"/>
  <meta property="og:image:width" content="1200"/>
  <meta property="og:image:height" content="630"/>
  <meta property="og:url" content="${shareUrl}"/>
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${domain} scored ${score}/100 (${esc(grade)}) — Yoke"/>
  <meta name="twitter:description" content="Security ${data.a[0]} · Reliability ${data.a[1]} · Trust ${data.a[2]} · Performance ${data.a[3]} · Visibility ${data.a[4]}"/>
  <meta name="twitter:image" content="${ogImageUrl}"/>
  <link rel="canonical" href="${shareUrl}"/>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml"/>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0d1117;color:#e6edf3;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px}
    .card{background:#161b22;border:1px solid #30363d;border-radius:16px;max-width:560px;width:100%;padding:40px;position:relative;overflow:hidden}
    .card::before{content:"";position:absolute;top:0;left:0;right:0;height:120px;background:linear-gradient(180deg,${gc}11 0%,transparent 100%);pointer-events:none}
    .brand{display:flex;align-items:center;gap:8px;margin-bottom:28px;position:relative}
    .brand-name{color:#8b949e;font-size:14px;font-weight:600;letter-spacing:2px}
    .brand-sub{color:#484f58;font-size:12px}
    .domain{font-size:28px;font-weight:700;color:#e6edf3;word-break:break-all;margin-bottom:8px;position:relative}
    .timestamp{font-size:13px;color:#484f58;margin-bottom:32px;position:relative}
    .score-section{display:flex;align-items:center;gap:32px;margin-bottom:32px;position:relative}
    .score-ring{position:relative;width:140px;height:140px;flex-shrink:0}
    .score-ring svg{width:140px;height:140px}
    .score-num{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center}
    .score-num .val{font-size:48px;font-weight:700;color:${sc};line-height:1}
    .score-num .unit{font-size:14px;color:#8b949e;margin-top:2px}
    .grade-badge{width:72px;height:72px;border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:700;color:${gc};background:${gc}1a;border:2px solid ${gc}33;flex-shrink:0}
    .axes{display:flex;flex-direction:column;gap:12px;margin-bottom:36px;position:relative}
    .axis-row{display:flex;align-items:center;gap:12px}
    .axis-label{width:100px;font-size:13px;color:#8b949e;text-align:right;flex-shrink:0}
    .axis-bar-track{flex:1;height:20px;background:#21262d;border-radius:4px;overflow:hidden}
    .axis-bar-fill{height:100%;border-radius:4px;transition:width 0.6s ease}
    .axis-val{width:32px;font-size:14px;font-weight:600;text-align:right;flex-shrink:0}
    .cta{display:block;text-align:center;padding:14px 24px;background:${gc};color:#0d1117;font-size:15px;font-weight:600;border-radius:10px;text-decoration:none;transition:opacity 0.15s;position:relative}
    .cta:hover{opacity:0.85}
    .footer{margin-top:24px;text-align:center;font-size:12px;color:#484f58}
    .footer a{color:#8b949e;text-decoration:none}
    .footer a:hover{text-decoration:underline}
    @media(max-width:480px){
      .card{padding:24px}
      .domain{font-size:22px}
      .score-section{gap:20px}
      .score-ring{width:110px;height:110px}
      .score-ring svg{width:110px;height:110px}
      .score-num .val{font-size:36px}
      .grade-badge{width:56px;height:56px;font-size:32px}
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">
      <img src="${OX_LOGO_DATA_URI}" alt="Yoke" width="22" height="22" style="filter:brightness(0) invert(1);opacity:0.7"/>
      <span class="brand-name">YOKE</span>
      <span class="brand-sub">DOMAIN INTELLIGENCE</span>
    </div>
    <div class="domain">${domain}</div>
    <div class="timestamp">Analyzed on ${esc(analyzedDate)}</div>
    <div class="score-section">
      <div class="score-ring">
        <svg viewBox="0 0 140 140">
          <circle cx="70" cy="70" r="58" fill="none" stroke="#21262d" stroke-width="8"/>
          <circle cx="70" cy="70" r="58" fill="none" stroke="${sc}" stroke-width="8" stroke-dasharray="${(score / 100) * 364.4} 364.4" stroke-linecap="round" transform="rotate(-90 70 70)" opacity="0.8"/>
        </svg>
        <div class="score-num">
          <div class="val">${score}</div>
          <div class="unit"></div>
        </div>
      </div>
      <div class="grade-badge">${esc(grade)}</div>
    </div>
    <div class="axes">${axisBarsHtml}</div>
    <a class="cta" href="${baseUrl}/${esc(data.d)}">🔍 Analyze ${domain} now</a>
  </div>
  <div class="footer">
    <a href="${baseUrl}">yoke.lol</a> — Free domain intelligence for everyone
  </div>
</body>
</html>`;
}

// ─── Bot detection ───────────────────────────────────────────────────

function isBotUA(ua: string): boolean {
  const lower = ua.toLowerCase();
  return (
    lower.includes("twitterbot") ||
    lower.includes("facebookexternalhit") ||
    lower.includes("facebot") ||
    lower.includes("linkedinbot") ||
    lower.includes("slackbot") ||
    lower.includes("slack-imgproxy") ||
    lower.includes("discordbot") ||
    lower.includes("telegrambot") ||
    lower.includes("whatsapp") ||
    lower.includes("signal") ||
    lower.includes("applebot") ||
    lower.includes("googlebot") ||
    lower.includes("bingbot") ||
    lower.includes("redditbot") ||
    lower.includes("pinterestbot") ||
    lower.includes("embedly") ||
    lower.includes("iframely") ||
    lower.includes("preview")
  );
}

// ─── Route handlers ──────────────────────────────────────────────────

const SHARE_PATH_RE = /^\/r\/(.+)$/;
const OG_IMAGE_PATH_RE = /^\/og\/(.+)\.svg$/;

export function matchSharePath(path: string): string | null {
  const m = SHARE_PATH_RE.exec(path);
  return m ? m[1] : null;
}

export function matchOgImagePath(path: string): string | null {
  const m = OG_IMAGE_PATH_RE.exec(path);
  return m ? m[1] : null;
}

/** Handle GET /r/:token — report card page or OG-only HTML for bots */
export async function handleSharePage(request: Request, env: Env, token: string): Promise<Response> {
  const parsed = parseShareToken(token);
  if (!parsed) {
    return new Response("Invalid share link", { status: 400, headers: { "Content-Type": "text/plain" } });
  }

  const valid = await verifyPayload(parsed.payload, parsed.signature, env);
  if (!valid) {
    return new Response("Invalid or tampered share link", { status: 400, headers: { "Content-Type": "text/plain" } });
  }

  const baseUrl = getBaseUrl(request, env);
  const ua = request.headers.get("User-Agent") || "";

  if (isBotUA(ua)) {
    // Minimal HTML with OG tags for crawlers
    const ogImageUrl = `${baseUrl}/og/${token}.svg`;
    const shareUrl = `${baseUrl}/r/${token}`;
    const d = parsed.data;
    const domain = esc(d.d);
    const html = `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<title>${domain} scored ${d.s}/100 (${esc(d.g)}) — Yoke</title>
<meta property="og:type" content="website"/>
<meta property="og:title" content="${domain} scored ${d.s}/100 (${esc(d.g)}) — Yoke"/>
<meta property="og:description" content="Security ${d.a[0]} · Reliability ${d.a[1]} · Trust ${d.a[2]} · Performance ${d.a[3]} · Visibility ${d.a[4]} — Free domain intelligence report"/>
<meta property="og:image" content="${esc(ogImageUrl)}"/>
<meta property="og:image:type" content="image/svg+xml"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta property="og:url" content="${esc(shareUrl)}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${domain} scored ${d.s}/100 (${esc(d.g)}) — Yoke"/>
<meta name="twitter:description" content="Security ${d.a[0]} · Reliability ${d.a[1]} · Trust ${d.a[2]} · Performance ${d.a[3]} · Visibility ${d.a[4]}"/>
<meta name="twitter:image" content="${esc(ogImageUrl)}"/>
<link rel="canonical" href="${esc(shareUrl)}"/>
</head><body></body></html>`;
    return new Response(html, {
      headers: {
        "Content-Type": "text/html;charset=UTF-8",
        "Cache-Control": "public, max-age=86400",
        ...getHtmlSecurityHeaders(baseUrl),
      },
    });
  }

  // Browser: full report card page
  const html = generateReportPage(parsed.data, baseUrl, token);
  return new Response(html, {
    headers: {
      "Content-Type": "text/html;charset=UTF-8",
      "Cache-Control": "public, max-age=86400",
      ...getHtmlSecurityHeaders(baseUrl),
    },
  });
}

/** Handle GET /og/:token.svg — dynamic OG image as SVG */
export async function handleOgImage(request: Request, env: Env, token: string): Promise<Response> {
  const parsed = parseShareToken(token);
  if (!parsed) {
    return new Response("Invalid token", { status: 400, headers: { "Content-Type": "text/plain" } });
  }

  const valid = await verifyPayload(parsed.payload, parsed.signature, env);
  if (!valid) {
    return new Response("Invalid token", { status: 400, headers: { "Content-Type": "text/plain" } });
  }

  const svg = generateOgSvg(parsed.data);
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=604800, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
