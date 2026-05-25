import { normalizeDomain, fetchWithTimeout, getFromCache, setCache, boundedText, safeFetchWithRedirects } from "../helpers";

export async function getSocialAccounts(db: D1Database, rawDomain: string) {
  const domain = normalizeDomain(rawDomain);
  const cached = await getFromCache(db, domain, "social_accounts", 24 * 60 * 60 * 1000);
  if (cached) {
    const c = cached as { accounts: Array<{ platform: string; url: string; username: string | null; found_via: string }> };
    return { accounts: c.accounts, cached: true };
  }

  const accounts: Array<{ platform: string; url: string; username: string | null; found_via: string }> = [];

  // Normalized URL set for dedup — strip protocol, www, trailing slash, query, fragment
  const seenNormalized = new Set<string>();
  // Per-platform cap to avoid flooding
  const platformCount: Record<string, number> = {};
  const MAX_PER_PLATFORM = 3;

  function normalizeUrl(url: string): string {
    return url.toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/+$/, "")
      .replace(/[?#].*$/, "");
  }

  function addAccount(platform: string, url: string, username: string | null, foundVia: string): boolean {
    const normalized = normalizeUrl(url);
    if (seenNormalized.has(normalized)) return false;
    if ((platformCount[platform] ?? 0) >= MAX_PER_PLATFORM) return false;
    if (!username || ["share", "sharer", "intent", "dialog", "login", "signup", "hashtag", "search", "explore", "about", "help", "p", "watch", "status", "i", "reel", "stories", "reels"].includes(username.toLowerCase())) return false;
    seenNormalized.add(normalized);
    platformCount[platform] = (platformCount[platform] ?? 0) + 1;
    accounts.push({ platform, url, username, found_via: foundVia });
    return true;
  }

  // Platform patterns — each regex captures the username as group 1 from the FULL URL
  const platformPatterns: Array<{ platform: string; pattern: RegExp; selfDomain?: string }> = [
    { platform: "Twitter/X", pattern: /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]{1,15})(?:[/?#]|$)/gi, selfDomain: "x.com" },
    { platform: "GitHub", pattern: /https?:\/\/(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)(?:[/?#]|$)/gi, selfDomain: "github.com" },
    { platform: "LinkedIn", pattern: /https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/([a-zA-Z0-9_-]+)(?:[/?#]|$)/gi, selfDomain: "linkedin.com" },
    { platform: "Facebook", pattern: /https?:\/\/(?:www\.)?facebook\.com\/([a-zA-Z0-9._-]+)(?:[/?#]|$)/gi, selfDomain: "facebook.com" },
    { platform: "Instagram", pattern: /https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9._]+)(?:[/?#]|$)/gi, selfDomain: "instagram.com" },
    { platform: "YouTube", pattern: /https?:\/\/(?:www\.)?youtube\.com\/(?:@|c\/|channel\/|user\/)([a-zA-Z0-9_@-]+)(?:[/?#]|$)/gi, selfDomain: "youtube.com" },
    { platform: "TikTok", pattern: /https?:\/\/(?:www\.)?tiktok\.com\/@([a-zA-Z0-9._]+)(?:[/?#]|$)/gi, selfDomain: "tiktok.com" },
    { platform: "Mastodon", pattern: /https?:\/\/[a-zA-Z0-9.-]+\/@([a-zA-Z0-9_]+)(?:[/?#]|$)/gi },
    { platform: "Bluesky", pattern: /https?:\/\/bsky\.app\/profile\/([a-zA-Z0-9._-]+)(?:[/?#]|$)/gi, selfDomain: "bsky.app" },
    { platform: "Threads", pattern: /https?:\/\/(?:www\.)?threads\.net\/@([a-zA-Z0-9._]+)(?:[/?#]|$)/gi, selfDomain: "threads.net" },
    { platform: "Pinterest", pattern: /https?:\/\/(?:www\.)?pinterest\.com\/([a-zA-Z0-9_-]+)(?:[/?#]|$)/gi, selfDomain: "pinterest.com" },
    { platform: "Discord", pattern: /https?:\/\/(?:www\.)?discord\.(?:gg|com\/invite)\/([a-zA-Z0-9_-]+)(?:[/?#]|$)/gi, selfDomain: "discord.com" },
  ];

  // Determine the base domain being analyzed (to skip self-referencing links)
  const baseDomain = domain.replace(/^www\./, "").toLowerCase();

  // Strategy 1: Parse homepage HTML for social links
  try {
    const res = await safeFetchWithRedirects(`https://${domain}`, {
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36" },
    });
    if (res.ok) {
      const html = await boundedText(res);
      // Extract all hrefs
      const hrefRegex = /href=["']([^"']+)["']/gi;
      let hrefMatch: RegExpExecArray | null;
      const hrefs: string[] = [];
      while ((hrefMatch = hrefRegex.exec(html)) !== null) {
        hrefs.push(hrefMatch[1] ?? "");
      }
      for (const href of hrefs) {
        for (const pp of platformPatterns) {
          // Skip self-referencing links (e.g., github.com linking to github.com/*)
          if (pp.selfDomain && baseDomain.includes(pp.selfDomain.replace(/^www\./, ""))) continue;
          pp.pattern.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = pp.pattern.exec(href)) !== null) {
            const username = m[1] ?? null;
            const cleanUrl = href.split("?")[0]?.replace(/\/+$/, "") ?? href;
            addAccount(pp.platform, cleanUrl, username, "homepage");
          }
        }
      }
    }
  } catch { /* homepage fetch failed */ }

  // Strategy 2: Probe common URL patterns (only if few found via HTML)
  if (accounts.length < 3) {
    const baseName = domain.split(".")[0] ?? domain;
    const probeUrls: Array<{ platform: string; url: string; username: string }> = [
      { platform: "Twitter/X", url: `https://x.com/${baseName}`, username: baseName },
      { platform: "GitHub", url: `https://github.com/${baseName}`, username: baseName },
      { platform: "LinkedIn", url: `https://www.linkedin.com/company/${baseName}`, username: baseName },
      { platform: "Facebook", url: `https://www.facebook.com/${baseName}`, username: baseName },
      { platform: "Instagram", url: `https://www.instagram.com/${baseName}`, username: baseName },
    ];

    const probes = probeUrls.filter(p => !accounts.some(a => a.platform === p.platform)).map(async (probe) => {
      try {
        const res = await fetchWithTimeout(probe.url, { timeout: 5000, method: "HEAD", redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" } });
        if (res.ok || res.status === 200) {
          addAccount(probe.platform, probe.url, probe.username, "probe");
        }
      } catch { /* probe failed */ }
    });
    await Promise.allSettled(probes);
  }

  const result = { accounts };
  await setCache(db, domain, "social_accounts", result);
  return { ...result, cached: false };
}
