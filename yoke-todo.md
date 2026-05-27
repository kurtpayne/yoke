# Yoke TODO

## Done (May 26)
- ~~**PageSpeed**~~ ✅ Workers Paid plan ($5/mo) resolved subrequest limit
- ~~**Pending checks indicator**~~ ✅ Animated label cycling through pending check names
- ~~**Colored check indicators**~~ ✅ Green/red/grey circles as checks complete during streaming
- ~~**Cached results banner**~~ ✅ API returns cached_at, web UI + CLI show banner, repositioned above tabs
- ~~**DKIM/SPF/DMARC**~~ ✅ All configured on yoke.lol
- ~~**Debug cleanup**~~ ✅ Removed /api/debug/pagespeed, redeploy comments, debug logs
- ~~**CLI QA**~~ ✅ 8 bugs fixed (P0 panic, P1 json/LCP/URL bugs, P2 UX issues), 23 tests
- ~~**CLI code review**~~ ✅ 3 P1 fixes (unbounded io.ReadAll, unchecked NewRequest, README docs)
- ~~**BGP false positives**~~ ✅ Anycast-aware thresholds for CDN providers (CF, AWS, GCP, etc.)
- ~~**Self-scan detection**~~ ✅ Robots/sitemap self-detection via ASSETS.fetch when scanning yoke.lol
- ~~**CI smoke test**~~ ✅ Fixed broken smoke test (cloudflare.com timeout → example.com)
- ~~**AI cache purge**~~ ✅ Stale email auth hallucination resolved

## Pre-Launch
- **LinkedIn launch post** — Tue June 23, 10am PT
- **Display `info` severity findings in UI** — client filters out `info` findings, so neutral PageSpeed finding doesn't render

## Nice-to-Have
- `/cli` landing page on yoke.lol
- Footer link to CLI docs
- Goreleaser Homebrew tap config
- Install script checksum verification

## Backlog
- Longitudinal scoring / historical trends
- Tab analytics-driven features
- IDN/punycode domain handling
- HTTP integration tests for CLI
- `--verbose`/`--debug` flag for CLI self-hosting
