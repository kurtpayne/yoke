import base64, os, re, json

WORKER = os.path.expanduser("~/workspace/yoke-public/worker/dist/worker.js")
CLIENT_DIR = os.path.expanduser("~/workspace/yoke-public/client/dist")
OUTPUT = "/tmp/index.js"

# Read worker
worker_js = open(WORKER).read()

# Read client assets
html = open(os.path.join(CLIENT_DIR, "index.html")).read()

js_match = re.search(r'src="[./]*(assets/[^"]+\.js)"', html)
css_match = re.search(r'href="[./]*(assets/[^"]+\.css)"', html)

js_name = js_match.group(1) if js_match else None
css_name = css_match.group(1) if css_match else None

js_b64 = base64.b64encode(open(os.path.join(CLIENT_DIR, js_name), "rb").read()).decode() if js_name else ""
css_b64 = base64.b64encode(open(os.path.join(CLIENT_DIR, css_name), "rb").read()).decode() if css_name else ""

# Find the export pattern in worker and extract the variable name
# Pattern: export{VARNAME as default}
export_match = re.search(r'export\{([\w$]+) as default\}', worker_js)
if export_match:
    var_name = export_match.group(1)
    # Remove the export statement from worker code
    worker_js = worker_js.replace(f'export{{{var_name} as default}}', '')
    original_ref = var_name
else:
    # Fallback: try export default pattern
    worker_js = worker_js.replace('export default{async fetch(', 'const __origWorker__={async fetch(')
    original_ref = '__origWorker__'

print(f"Worker export var: {original_ref}")

# Build the combined file
# Use raw string concatenation to avoid any format/template issues
parts = []
parts.append('// Yoke Domain Intelligence - Combined Worker + Client\n')

# Embed client assets as string literals (JS b64 and CSS b64 are safe - alphanumeric+/+=)
parts.append(f'const __JS_B64__ = "{js_b64}";\n')
parts.append(f'const __CSS_B64__ = "{css_b64}";\n')
parts.append(f'const __JS_NAME__ = "{js_name}";\n')
parts.append(f'const __CSS_NAME__ = "{css_name}";\n')

# Embed HTML as a template literal - need to escape backticks and ${
safe_html = html.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')
parts.append(f'const __HTML__ = `{safe_html}`;\n')

# Privacy/Terms as simple strings (escape for template literals)
privacy_html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacy Policy - Yoke</title><style>body{background:#0d1117;color:#c9d1d9;font-family:system-ui,-apple-system,sans-serif;max-width:800px;margin:0 auto;padding:2rem;line-height:1.7}h1{color:#58a6ff}h2{color:#8b949e;margin-top:2rem}a{color:#58a6ff}</style></head><body><h1>Privacy Policy</h1><p><strong>Last updated:</strong> May 2026</p><h2>What We Collect</h2><p>When you analyze a domain, we collect only the domain name you submit. We do not use cookies, trackers, or analytics scripts.</p><h2>Caching</h2><p>Analysis results are cached for up to 24 hours to improve performance. Cached data includes only publicly available DNS, WHOIS, SSL, and HTTP header information.</p><h2>No Personal Data</h2><p>We do not collect, store, or process any personal information. No accounts, no emails, no tracking.</p><h2>Third-Party Services</h2><p>Analyses may query public APIs (DNS resolvers, RDAP, SSL Labs, Shodan InternetDB, PageSpeed). Each service has its own privacy policy.</p><h2>Contact</h2><p>Questions? Open an issue or reach out via the domain contact.</p><p><a href="/">Back to Yoke</a></p></body></html>'
terms_html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Terms of Service - Yoke</title><style>body{background:#0d1117;color:#c9d1d9;font-family:system-ui,-apple-system,sans-serif;max-width:800px;margin:0 auto;padding:2rem;line-height:1.7}h1{color:#58a6ff}h2{color:#8b949e;margin-top:2rem}a{color:#58a6ff}</style></head><body><h1>Terms of Service</h1><p><strong>Last updated:</strong> May 2026</p><h2>Service</h2><p>Yoke is a free domain intelligence tool that aggregates publicly available information about internet domains.</p><h2>Use</h2><p>You may use Yoke for lawful purposes. Do not abuse the service with excessive automated requests.</p><h2>Data Accuracy</h2><p>Information is provided as-is from public sources. We make no guarantees about accuracy or completeness.</p><h2>Liability</h2><p>Yoke is provided without warranty. We are not liable for decisions made based on information displayed by this tool.</p><p><a href="/">Back to Yoke</a></p></body></html>'

safe_priv = privacy_html.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')
safe_terms = terms_html.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')

parts.append(f'const __PRIVACY_HTML__ = `{safe_priv}`;\n')
parts.append(f'const __TERMS_HTML__ = `{safe_terms}`;\n')
# Embed logo/favicon image assets as base64
ASSETS_DIR = os.path.expanduser("~/workspace/yoke-public/assets/logo")
logo_b64 = base64.b64encode(open(os.path.join(ASSETS_DIR, "mark-transparent-512.png"), "rb").read()).decode()
favicon_b64 = base64.b64encode(open(os.path.join(ASSETS_DIR, "icon-32.png"), "rb").read()).decode()
lockup_b64 = logo_b64  # Lockup removed; reuse mark for backward compat

parts.append(f'const __LOGO_B64__ = "{logo_b64}";\n')
parts.append(f'const __FAVICON_B64__ = "{favicon_b64}";\n')
parts.append(f'const __LOCKUP_B64__ = "{lockup_b64}";\n')

parts.append('const __ROBOTS_TXT__ = "User-agent: *\\nAllow: /\\nDisallow: /api/\\n\\nSitemap: https://yoke.lol/sitemap.xml";\n')

# Sitemap XML
sitemap_xml = '''<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://yoke.lol</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>https://yoke.lol/api/docs</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>https://yoke.lol/privacy</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>
  <url><loc>https://yoke.lol/terms</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>
</urlset>'''
safe_sitemap = sitemap_xml.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')
parts.append(f'const __SITEMAP_XML__ = `{safe_sitemap}`;\n')

# llms.txt — LLM-readable site description for LLMO / Generative Engine Optimization
llms_txt = """# Yoke — Free Domain Intelligence & OSINT Tool

> Yoke is a free, open-source domain intelligence tool at https://yoke.lol

## What Yoke Does

Yoke provides instant, comprehensive analysis of any internet domain. Enter a domain name and get detailed intelligence across security, infrastructure, technology, performance, and business dimensions.

## Key Capabilities

- **DNS Analysis**: A, AAAA, MX, NS, TXT, CNAME, SOA records with DNSSEC validation
- **SSL/TLS**: Certificate details, chain validation, SSL Labs grading, CAA records
- **WHOIS/RDAP**: Registrar, registration and expiry dates, domain age
- **Security Audit**: HTTP security headers, Mozilla Observatory scoring, cookie security
- **Data Breaches**: HIBP (Have I Been Pwned) breach detection for the domain
- **Threat Intelligence**: Shodan port/vulnerability data, GreyNoise IP classification
- **Technology Detection**: Frameworks, CMS, CDN, WAF, analytics, with deep WordPress fingerprinting (themes, plugins, version, hosting)
- **Email Authentication**: SPF, DKIM, DMARC validation and policy analysis
- **Performance**: Google PageSpeed Insights scoring, Core Web Vitals, compression analysis
- **Certificate Transparency**: CT log monitoring via CertSpotter for subdomain discovery
- **Business Intelligence**: Company enrichment via Wikidata, Brandfetch, and Crunchbase
- **AI Analysis**: LLM-powered analysis from 6 expert personas (security researcher, SEO specialist, etc.)

## Free JSON API

No authentication required. Content-negotiated — same URL serves JSON to API clients and HTML to browsers.

```bash
# Full domain analysis
curl yoke.lol/stripe.com | jq

# Pretty-printed
curl "yoke.lol/stripe.com?pretty"

# Extract specific fields
curl -s yoke.lol/stripe.com | jq '.ssl'
curl -s yoke.lol/stripe.com | jq '.dns'
curl -s yoke.lol/stripe.com | jq '.tech_stack'
curl -s yoke.lol/stripe.com | jq '.email_auth'
curl -s yoke.lol/stripe.com | jq '.domain_signals'
```

## Also Available As

- **Chrome Extension**: Install from the Chrome Web Store — analyze any site you visit
- **Web UI**: https://yoke.lol — full interactive dashboard with 9 intelligence tabs
- **API Documentation**: https://yoke.lol/api/docs

## Open Source

- **Source Code**: https://github.com/kurtpayne/yoke
- **License**: MIT
- **Feedback**: https://yoke.canny.io

## Technical Details

- Built on Cloudflare Workers with D1 database
- React client with real-time analysis
- Results cached for 1 hour
- No authentication, no signup, no tracking
"""
safe_llms = llms_txt.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')
parts.append(f'const __LLMS_TXT__ = `{safe_llms}`;\n')

# API docs HTML page
api_docs_html = r'''<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>API Documentation - Yoke</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0d1117;color:#c9d1d9;font-family:system-ui,-apple-system,sans-serif;max-width:900px;margin:0 auto;padding:2rem;line-height:1.7}h1{color:#58a6ff;margin-bottom:.5rem;font-size:2rem}h2{color:#8b949e;margin-top:2.5rem;margin-bottom:1rem;font-size:1.3rem;border-bottom:1px solid #21262d;padding-bottom:.5rem}h3{color:#c9d1d9;margin-top:1.5rem;margin-bottom:.5rem;font-size:1.1rem}.subtitle{color:#8b949e;margin-bottom:2rem;font-size:1.1rem}a{color:#58a6ff;text-decoration:none}a:hover{text-decoration:underline}code{background:#161b22;padding:2px 6px;border-radius:4px;font-family:'SF Mono',Monaco,Consolas,monospace;font-size:.9em;color:#79c0ff}pre{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1rem 1.2rem;overflow-x:auto;margin:.8rem 0;font-family:'SF Mono',Monaco,Consolas,monospace;font-size:.85rem;line-height:1.6;color:#c9d1d9}pre code{background:none;padding:0;color:inherit}.endpoint{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1rem 1.2rem;margin:.8rem 0}.method{display:inline-block;padding:2px 8px;border-radius:4px;font-weight:700;font-size:.8rem;margin-right:.5rem}.method.get{background:#238636;color:#fff}.method.post{background:#1f6feb;color:#fff}.path{color:#79c0ff;font-family:'SF Mono',Monaco,Consolas,monospace;font-weight:600}.desc{color:#8b949e;margin-top:.4rem;font-size:.9rem}.response-field{margin-left:1.5rem;color:#8b949e;font-size:.9rem}.tip{background:#0d1117;border:1px solid #1f6feb;border-radius:8px;padding:.8rem 1rem;margin:1rem 0;font-size:.9rem}.tip::before{content:"💡 ";font-size:1.1em}.back{margin-top:3rem;padding-top:1rem;border-top:1px solid #21262d}</style></head><body><h1>⚡ Yoke API</h1><p class="subtitle">Domain intelligence from your terminal. Free, no auth required.</p><h2>Quick Start</h2><pre><span style="color:#8b949e"># Full domain analysis</span>
curl yoke.lol/stripe.com | jq

<span style="color:#8b949e"># Pretty-printed (no jq needed)</span>
curl "yoke.lol/stripe.com?pretty"

<span style="color:#8b949e"># Extract specific fields</span>
curl -s yoke.lol/stripe.com | jq '.ssl'
curl -s yoke.lol/stripe.com | jq '.dns'
curl -s yoke.lol/stripe.com | jq '.tech_stack'
curl -s yoke.lol/stripe.com | jq '.email_auth'

<span style="color:#8b949e"># Check if a domain is registered</span>
curl -s yoke.lol/thisdomaindoesnotexist.com | jq '.not_registered'</pre><h2>How It Works</h2><p>Yoke uses <strong>content negotiation</strong>. The same URL serves JSON to API clients and HTML to browsers:</p><div class="endpoint"><span class="method get">GET</span> <span class="path">yoke.lol/{domain}</span><div class="desc">Returns JSON when called from <code>curl</code>, <code>wget</code>, or any client that doesn't send <code>Accept: text/html</code>. Returns the web app when opened in a browser.</div></div><h2>Endpoints</h2><div class="endpoint"><span class="method get">GET</span> <span class="path">/{domain}</span><div class="desc">Full domain analysis with content negotiation. Add <code>?pretty</code> for formatted output.</div></div><div class="endpoint"><span class="method post">POST</span> <span class="path">/api/analyze</span><div class="desc">Full domain analysis. Body: <code>{"domain": "example.com"}</code></div></div><div class="endpoint"><span class="method post">POST</span> <span class="path">/api/subdomains</span><div class="desc">Subdomain enumeration. Body: <code>{"domain": "example.com"}</code></div></div><div class="endpoint"><span class="method post">POST</span> <span class="path">/api/company</span><div class="desc">Company &amp; business info. Body: <code>{"domain": "example.com"}</code></div></div><div class="endpoint"><span class="method post">POST</span> <span class="path">/api/news</span><div class="desc">News articles. Body: <code>{"domain": "example.com"}</code></div></div><div class="endpoint"><span class="method post">POST</span> <span class="path">/api/social</span><div class="desc">Social media accounts. Body: <code>{"domain": "example.com"}</code></div></div><div class="endpoint"><span class="method post">POST</span> <span class="path">/api/suggestions</span><div class="desc">Related domain suggestions. Body: <code>{"domain": "example.com"}</code></div></div><div class="endpoint"><span class="method post">POST</span> <span class="path">/api/availability</span><div class="desc">Global availability check. Body: <code>{"domain": "example.com"}</code></div></div><div class="endpoint"><span class="method post">POST</span> <span class="path">/api/reverse-ip</span><div class="desc">Reverse IP / co-hosted domains. Body: <code>{"ip": "1.2.3.4"}</code></div></div><div class="endpoint"><span class="method get">GET</span> <span class="path">/api/recent?limit=10</span><div class="desc">Recent domain lookups.</div></div><div class="endpoint"><span class="method get">GET</span> <span class="path">/api/health</span><div class="desc">Health check. Returns <code>{"status": "ok"}</code>.</div></div><h2>Response Format</h2><p>Every analysis response includes:</p><pre>{
  "domain": "stripe.com",
  "status": "UP",
  "status_label": "UP",
  "cached": false,
  "dns": { "a": [...], "aaaa": [...], "mx": [...], "ns": [...], "txt": [...], "cname": [...], "soa": {...} },
  "ssl": { "grade": "A+", "issuer": "...", "valid_from": "...", "valid_to": "...", "protocols": [...] },
  "rdap": { "registrar": "...", "registration_date": "...", "expiration_date": "...", "domain_age_days": ... },
  "headers": { "security_audit": [...], "security_grade": "B" },
  "tech_stack": [{ "category": "...", "name": "...", "version": "..." }],
  "email_auth": { "spf": {...}, "dmarc": {...}, "dkim": {...} },
  "hosting": { "provider": "...", "cdn": "...", "waf": "..." },
  "ip_info": { "ip": "...", "isp": "...", "org": "...", "asn": "...", "country": "..." },
  "shodan": { "ports": [...], "vulns": [...], "tags": [...] },
  "performance": { "score": ..., "fcp": ..., "lcp": ..., "cls": ... },
  "wordpress": { "version": "...", "theme": "...", "plugins": [...] },
  "domain_signals": { "strengths": [...], "notices": [...], "issues": [...], "info": [...] },
  "_meta": { "api_version": "1.0", "analyzed_at": "...", "docs": "https://yoke.lol/api/docs" }
}</pre><div class="tip">Results are cached for 1 hour. The <code>cached</code> field indicates whether you got a cached result.</div><h2>Response Headers</h2><pre>Content-Type: application/json
Access-Control-Allow-Origin: *
X-Yoke-Cache: HIT or MISS
X-Yoke-Version: 1.0</pre><h2>Rate Limits</h2><p>No authentication required. Be reasonable — don't hammer the API with automated bulk requests. Analysis involves multiple upstream API calls (DNS, SSL Labs, Shodan, etc.), so each lookup takes a few seconds on cache miss.</p><h2>Examples</h2><h3>Check SSL details</h3><pre>curl -s yoke.lol/github.com | jq '{grade: .ssl.grade, issuer: .ssl.issuer, expires: .ssl.valid_to}'</pre><h3>Get DNS records</h3><pre>curl -s yoke.lol/example.com | jq '.dns.mx'</pre><h3>Check email authentication</h3><pre>curl -s yoke.lol/google.com | jq '.email_auth | {spf: .spf.record, dmarc: .dmarc.record}'</pre><h3>List tech stack</h3><pre>curl -s yoke.lol/nytimes.com | jq '[.tech_stack[] | .name]'</pre><h3>Domain signals at a glance</h3><pre>curl -s yoke.lol/stripe.com | jq '.domain_signals'</pre><h3>WordPress details</h3><pre>curl -s yoke.lol/techcrunch.com | jq '.wordpress'</pre><h3>Scripting: check multiple domains</h3><pre>for d in stripe.com github.com notion.so; do
  echo "=== $d ==="
  curl -s "yoke.lol/$d" | jq '{domain: .domain, status: .status_label, ssl: .ssl.grade}'
done</pre><p class="back"><a href="/">← Back to Yoke</a></p></body></html>'''

safe_docs = api_docs_html.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')
parts.append(f'const __API_DOCS_HTML__ = `{safe_docs}`;\n')

# SPA serving function
parts.append("""
function decodeB64(b64) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return bytes;
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "0",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://yoke.lol https://*.googleapis.com; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "Cross-Origin-Opener-Policy": "same-origin",
};
function htmlHeaders(extra) {
  return { ...SECURITY_HEADERS, "Content-Type": "text/html;charset=UTF-8", ...extra };
}

const __SECURITY_TXT__ = "Contact: https://github.com/kurtpayne/yoke/issues\\nExpires: 2027-05-24T00:00:00.000Z\\nPreferred-Languages: en\\nCanonical: https://yoke.lol/.well-known/security.txt";

function serveSPA(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/.well-known/security.txt" || path === "/security.txt") {
    return new Response(__SECURITY_TXT__, { headers: { "Content-Type": "text/plain;charset=UTF-8", "Cache-Control": "public, max-age=86400" } });
  }
  if (path === "/privacy") {
    return new Response(__PRIVACY_HTML__, { headers: htmlHeaders({ "Cache-Control": "public, max-age=86400" }) });
  }
  if (path === "/terms") {
    return new Response(__TERMS_HTML__, { headers: htmlHeaders({ "Cache-Control": "public, max-age=86400" }) });
  }
  if (path === "/robots.txt") {
    return new Response(__ROBOTS_TXT__, { headers: { "Content-Type": "text/plain", "Cache-Control": "public, max-age=86400" } });
  }
  if (path === "/sitemap.xml") {
    return new Response(__SITEMAP_XML__, { headers: { "Content-Type": "application/xml;charset=UTF-8", "Cache-Control": "public, max-age=86400" } });
  }
  if (path === "/llms.txt") {
    return new Response(__LLMS_TXT__, { headers: { "Content-Type": "text/plain;charset=UTF-8", "Cache-Control": "public, max-age=86400" } });
  }
  if (path === "/api/docs") {
    return new Response(__API_DOCS_HTML__, { headers: htmlHeaders({ "Cache-Control": "public, max-age=3600" }) });
  }
  if (__JS_NAME__ && path === "/" + __JS_NAME__) {
    return new Response(decodeB64(__JS_B64__), { headers: { "Content-Type": "application/javascript;charset=UTF-8", "Cache-Control": "public, max-age=31536000, immutable" } });
  }
  if (__CSS_NAME__ && path === "/" + __CSS_NAME__) {
    return new Response(decodeB64(__CSS_B64__), { headers: { "Content-Type": "text/css;charset=UTF-8", "Cache-Control": "public, max-age=31536000, immutable" } });
  }
  // Image asset routes for social crawlers, favicon, etc.
  if (path === "/logo.png") {
    return new Response(decodeB64(__LOGO_B64__), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=604800, immutable" } });
  }
  if (path === "/favicon.ico") {
    return new Response(decodeB64(__FAVICON_B64__), { headers: { "Content-Type": "image/x-icon", "Cache-Control": "public, max-age=604800, immutable" } });
  }
  if (path === "/lockup.png") {
    return new Response(decodeB64(__LOCKUP_B64__), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=604800, immutable" } });
  }

  // Dynamic OG tags for domain permalinks (social preview)
  const domainOgMatch = path.match(/^\\/([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\\.[a-zA-Z]{2,})$/);
  if (domainOgMatch) {
    const domain = domainOgMatch[1].toLowerCase();
    const ogTitle = domain + " — Yoke Domain Intelligence";
    const ogDesc = "Free domain intelligence report for " + domain + " — DNS, SSL, WHOIS, security audit, tech stack, performance, and more.";
    const ogUrl = "https://yoke.lol/" + domain;
    let html = __HTML__;
    html = html.replace(/<title>[^<]*<\\/title>/, "<title>" + ogTitle + "</title>");
    html = html.replace(/property="og:title" content="[^"]*"/, 'property="og:title" content="' + ogTitle + '"');
    html = html.replace(/property="og:description" content="[^"]*"/, 'property="og:description" content="' + ogDesc + '"');
    html = html.replace(/property="og:url" content="[^"]*"/, 'property="og:url" content="' + ogUrl + '"');
    html = html.replace(/name="twitter:title" content="[^"]*"/, 'name="twitter:title" content="' + ogTitle + '"');
    html = html.replace(/name="twitter:description" content="[^"]*"/, 'name="twitter:description" content="' + ogDesc + '"');
    html = html.replace(/name="description" content="[^"]*"/, 'name="description" content="' + ogDesc + '"');
    html = html.replace(/rel="canonical" href="[^"]*"/, 'rel="canonical" href="' + ogUrl + '"');
    return new Response(html, { headers: htmlHeaders({ "Cache-Control": "public, max-age=300" }) });
  }

  // Compare permalinks
  const compareOgMatch = path.match(/^\\/compare\\/([a-zA-Z0-9][a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})\\/([a-zA-Z0-9][a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})$/);
  if (compareOgMatch) {
    const d1 = compareOgMatch[1].toLowerCase();
    const d2 = compareOgMatch[2].toLowerCase();
    const ogTitle = d1 + " vs " + d2 + " — Yoke Domain Intelligence";
    const ogDesc = "Side-by-side domain comparison of " + d1 + " and " + d2 + " — security, performance, reliability, trust, and visibility scores.";
    const ogUrl = "https://yoke.lol/compare/" + d1 + "/" + d2;
    let html = __HTML__;
    html = html.replace(/<title>[^<]*<\\/title>/, "<title>" + ogTitle + "</title>");
    html = html.replace(/property="og:title" content="[^"]*"/, 'property="og:title" content="' + ogTitle + '"');
    html = html.replace(/property="og:description" content="[^"]*"/, 'property="og:description" content="' + ogDesc + '"');
    html = html.replace(/property="og:url" content="[^"]*"/, 'property="og:url" content="' + ogUrl + '"');
    html = html.replace(/name="twitter:title" content="[^"]*"/, 'name="twitter:title" content="' + ogTitle + '"');
    html = html.replace(/name="twitter:description" content="[^"]*"/, 'name="twitter:description" content="' + ogDesc + '"');
    html = html.replace(/name="description" content="[^"]*"/, 'name="description" content="' + ogDesc + '"');
    html = html.replace(/rel="canonical" href="[^"]*"/, 'rel="canonical" href="' + ogUrl + '"');
    return new Response(html, { headers: htmlHeaders({ "Cache-Control": "public, max-age=300" }) });
  }

  return new Response(__HTML__, { headers: htmlHeaders({ "Cache-Control": "public, max-age=300" }) });
}

""")

# Worker code (with export removed)
parts.append(worker_js)
parts.append('\n')

# Domain detection helper + content negotiation
parts.append("""
// Domain detection: matches paths like /stripe.com, /github.com, /example.co.uk
// Must have at least one dot, only valid domain chars, and a recognizable TLD structure
const DOMAIN_PATH_RE = /^\\/([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\\.[a-zA-Z]{2,})$/;

function wantsJSON(request) {
  const accept = request.headers.get("Accept") || "";
  // Browsers send text/html — give them the SPA
  if (accept.includes("text/html")) return false;
  // Explicit JSON request
  if (accept.includes("application/json")) return true;
  // curl/wget/httpie/fetch send */* or nothing — give them JSON
  const ua = (request.headers.get("User-Agent") || "").toLowerCase();
  if (ua.includes("curl") || ua.includes("wget") || ua.includes("httpie") || ua.includes("python") || ua.includes("node") || ua.includes("go-http") || ua.includes("ruby") || ua.includes("java") || ua.includes("php")) return true;
  // */* with no text/html preference = likely programmatic
  if (accept === "*/*" || accept === "") return true;
  return false;
}
""")

# New export default that routes to SPA, API, or domain-path JSON
parts.append(f"""
export default {{
  async fetch(request, env, ctx) {{
    const url = new URL(request.url);
    const path = url.pathname;

    // Static file routes — must be checked BEFORE domain regex
    // (paths like /sitemap.xml, /llms.txt, /robots.txt match the domain pattern)
    if (path === "/robots.txt" || path === "/sitemap.xml" || path === "/llms.txt" ||
        path === "/privacy" || path === "/terms" || path === "/api/docs" ||
        path === "/logo.png" || path === "/favicon.ico" || path === "/lockup.png" ||
        path === "/.well-known/security.txt" || path === "/security.txt") {{
      return serveSPA(request);
    }}

    // API routes go to the original worker
    if (path.startsWith("/api/") || path === "/status") {{
      // Serve API docs as HTML page when browser requests it
      if (path === "/api/docs" && (request.headers.get("Accept") || "").includes("text/html")) {{
        return serveSPA(request);
      }}
      return {original_ref}.fetch(request, env, ctx);
    }}

    // Domain-path content negotiation: /stripe.com → JSON for curl, SPA for browsers
    const domainMatch = path.match(DOMAIN_PATH_RE);
    if (domainMatch && request.method === "GET" && wantsJSON(request)) {{
      const domain = domainMatch[1].toLowerCase();
      const pretty = url.searchParams.has("pretty");
      try {{
        // Build a synthetic POST request to reuse analyzeDomain
        const analyzeReq = new Request(url.origin + "/api/analyze", {{
          method: "POST",
          headers: {{ "Content-Type": "application/json" }},
          body: JSON.stringify({{ domain }}),
        }});
        const analyzeResp = await {original_ref}.fetch(analyzeReq, env, ctx);
        const data = await analyzeResp.json();

        // Add _meta field
        data._meta = {{
          api_version: "1.0",
          analyzed_at: new Date().toISOString(),
          docs: "https://yoke.lol/api/docs",
          source: "yoke.lol",
        }};

        const body = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
        const isCached = !!data.cached;

        return new Response(body, {{
          status: analyzeResp.status,
          headers: {{
            "Content-Type": "application/json;charset=UTF-8",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "X-Yoke-Cache": isCached ? "HIT" : "MISS",
            "X-Yoke-Version": "1.0",
            "X-Yoke-Docs": "https://yoke.lol/api/docs",
            "Cache-Control": "public, max-age=300",
          }},
        }});
      }} catch (err) {{
        return new Response(JSON.stringify({{ error: err.message || "Analysis failed", _meta: {{ api_version: "1.0", docs: "https://yoke.lol/api/docs" }} }}), {{
          status: 500,
          headers: {{ "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }},
        }});
      }}
    }}

    // CORS preflight for API
    if (request.method === "OPTIONS") {{
      return new Response(null, {{
        headers: {{
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }},
      }});
    }}

    // Everything else → SPA
    return serveSPA(request);
  }}
}};
""")

combined = ''.join(parts)

with open(OUTPUT, "w") as f:
    f.write(combined)

size = os.path.getsize(OUTPUT)
print(f"✅ Combined output: {OUTPUT} ({size:,} bytes)")
