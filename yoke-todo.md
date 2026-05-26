# Yoke TODO

## Active
- **Ensure PageSpeed works** — ✅ Fixed! Workers Paid plan ($5/mo) resolved subrequest limit. Score 82 confirmed for yoke.lol. Clean up debug endpoint + redeploy trigger comments.

## Next Up
- **Finish CLI** — testing, review, polish, documentation, CONTRIBUTING.md section, `/cli` landing page, link in footer
- **Implement DKIM** — prevent spoofing on yoke.lol domain (no email sending needed)
- **Add "cached results" banner** — show "Cached results from {timestamp}" in API response, web UI, and CLI when serving cached data
- **Display `info` severity findings in UI** — client filters out `info` findings in Performance tab, so neutral PageSpeed finding doesn't render
- **Pending checks indicator** — when streaming shows "25/26 checks", cycle through names of pending checks with fade animation ("Waiting on PageSpeed…" → "Waiting on WHOIS…")
- **LinkedIn launch post** — Wed May 28, 10am PT

## Backlog
- Longitudinal scoring / historical trends
- Tab analytics-driven features
