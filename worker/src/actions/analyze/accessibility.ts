// ─── Accessibility Quick Scan ────────────────────────────────────────
// Basic WCAG compliance checks from static HTML analysis.
// No rendering required — these are heuristic checks on the DOM structure.

export interface AccessibilityCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  impact: "critical" | "serious" | "moderate" | "minor";
}

export interface AccessibilityResult {
  score: number;
  checks: AccessibilityCheck[];
  summary: { passed: number; warnings: number; failures: number };
}

// ─── ISO 639-1 language codes (common subset) ──────────────────────

const VALID_LANG_CODES = new Set([
  "aa","ab","af","ak","am","an","ar","as","av","ay","az","ba","be","bg","bh","bi","bm","bn","bo","br",
  "bs","ca","ce","ch","co","cr","cs","cu","cv","cy","da","de","dv","dz","ee","el","en","eo","es","et",
  "eu","fa","ff","fi","fj","fo","fr","fy","ga","gd","gl","gn","gu","gv","ha","he","hi","ho","hr","ht",
  "hu","hy","hz","ia","id","ie","ig","ii","ik","in","io","is","it","iu","ja","jv","ka","kg","ki","kj",
  "kk","kl","km","kn","ko","kr","ks","ku","kv","kw","ky","la","lb","lg","li","ln","lo","lt","lu","lv",
  "mg","mh","mi","mk","ml","mn","mo","mr","ms","mt","my","na","nb","nd","ne","ng","nl","nn","no","nr",
  "nv","ny","oc","oj","om","or","os","pa","pi","pl","ps","pt","qu","rm","rn","ro","ru","rw","sa","sc",
  "sd","se","sg","sh","si","sk","sl","sm","sn","so","sq","sr","ss","st","su","sv","sw","ta","te","tg",
  "th","ti","tk","tl","tn","to","tr","ts","tt","tw","ty","ug","uk","ur","uz","ve","vi","vo","wa","wo",
  "xh","yi","yo","za","zh","zu",
]);

function isValidLangCode(lang: string): boolean {
  // Accept codes like "en", "en-US", "zh-Hans-CN"
  const primary = lang.split("-")[0]?.toLowerCase();
  return !!primary && VALID_LANG_CODES.has(primary);
}

// ─── Generic link text patterns ─────────────────────────────────────

const GENERIC_LINK_TEXT = /^(click here|here|read more|learn more|more|link|this|go|details|info|see more|view more|continue|continue reading)$/i;

// ─── Main Analysis ──────────────────────────────────────────────────

export function analyzeAccessibility(html: string): AccessibilityResult {
  const checks: AccessibilityCheck[] = [];
  const lowerHtml = html.toLowerCase();

  // 1. Language attribute
  const htmlTagMatch = lowerHtml.match(/<html[^>]*>/);
  if (htmlTagMatch) {
    const langMatch = htmlTagMatch[0].match(/lang\s*=\s*["']([^"']+)["']/);
    if (langMatch && langMatch[1]) {
      if (isValidLangCode(langMatch[1])) {
        checks.push({ name: "Language attribute", status: "pass", detail: `<html lang="${langMatch[1]}"> is set and valid`, impact: "serious" });
      } else {
        checks.push({ name: "Language attribute", status: "warn", detail: `<html lang="${langMatch[1]}"> — unrecognized language code`, impact: "serious" });
      }
    } else {
      checks.push({ name: "Language attribute", status: "fail", detail: "No lang attribute on <html> element. Screen readers cannot determine page language.", impact: "serious" });
    }
  } else {
    checks.push({ name: "Language attribute", status: "fail", detail: "No <html> tag found — page may not be valid HTML", impact: "serious" });
  }

  // 2. Viewport meta tag
  const hasViewport = /<meta[^>]*name\s*=\s*["']viewport["'][^>]*>/i.test(html);
  if (hasViewport) {
    // Check for user-scalable=no
    const viewportMatch = html.match(/<meta[^>]*name\s*=\s*["']viewport["'][^>]*content\s*=\s*["']([^"']+)["']/i);
    const viewportContent = viewportMatch?.[1] ?? "";
    if (/user-scalable\s*=\s*no/i.test(viewportContent) || /maximum-scale\s*=\s*1([^0-9]|$)/i.test(viewportContent)) {
      checks.push({ name: "Viewport meta", status: "warn", detail: "Viewport disables or limits user zoom — impacts users who need to enlarge content", impact: "serious" });
    } else {
      checks.push({ name: "Viewport meta", status: "pass", detail: "Viewport meta tag present and allows user scaling", impact: "moderate" });
    }
  } else {
    checks.push({ name: "Viewport meta", status: "fail", detail: "No viewport meta tag — page may not render properly on mobile devices", impact: "moderate" });
  }

  // 3. Heading hierarchy
  const headingMatches = [...html.matchAll(/<h([1-6])[^>]*>/gi)];
  const headingLevels = headingMatches.map(m => parseInt(m[1]!, 10));
  if (headingLevels.length === 0) {
    checks.push({ name: "Heading hierarchy", status: "fail", detail: "No headings found. Headings help screen reader users navigate page structure.", impact: "serious" });
  } else {
    const hasH1 = headingLevels.includes(1);
    // Check for skipped levels (e.g., h1 → h3 with no h2)
    let skipped = false;
    const sortedUnique = [...new Set(headingLevels)].sort();
    for (let i = 1; i < sortedUnique.length; i++) {
      if ((sortedUnique[i]! - sortedUnique[i - 1]!) > 1) {
        skipped = true;
        break;
      }
    }
    const h1Count = headingLevels.filter(l => l === 1).length;

    if (!hasH1) {
      checks.push({ name: "Heading hierarchy", status: "fail", detail: `No <h1> found. ${headingLevels.length} headings present (h${sortedUnique.join(", h")}).`, impact: "serious" });
    } else if (skipped) {
      checks.push({ name: "Heading hierarchy", status: "warn", detail: `Heading levels skip: h${sortedUnique.join(" → h")}. Skipping levels confuses screen reader navigation.`, impact: "moderate" });
    } else if (h1Count > 1) {
      checks.push({ name: "Heading hierarchy", status: "warn", detail: `Multiple <h1> tags found (${h1Count}). Best practice is a single h1 per page.`, impact: "minor" });
    } else {
      checks.push({ name: "Heading hierarchy", status: "pass", detail: `Valid hierarchy: h${sortedUnique.join(" → h")} (${headingLevels.length} headings total)`, impact: "serious" });
    }
  }

  // 4. Image alt text
  const imgTags = [...html.matchAll(/<img[^>]*>/gi)];
  if (imgTags.length > 0) {
    let withAlt = 0;
    let decorative = 0;
    for (const tag of imgTags) {
      const tagStr = tag[0];
      if (/alt\s*=\s*["'][^"']+["']/i.test(tagStr)) {
        withAlt++;
      } else if (/alt\s*=\s*["']\s*["']/i.test(tagStr)) {
        decorative++; // empty alt="" is intentional for decorative images
      }
    }
    const missingAlt = imgTags.length - withAlt - decorative;
    const pct = Math.round(((withAlt + decorative) / imgTags.length) * 100);

    if (missingAlt === 0) {
      checks.push({ name: "Image alt text", status: "pass", detail: `All ${imgTags.length} images have alt attributes (${withAlt} descriptive, ${decorative} decorative)`, impact: "critical" });
    } else if (pct >= 80) {
      checks.push({ name: "Image alt text", status: "warn", detail: `${missingAlt} of ${imgTags.length} images missing alt text (${pct}% have it)`, impact: "critical" });
    } else {
      checks.push({ name: "Image alt text", status: "fail", detail: `${missingAlt} of ${imgTags.length} images missing alt text (only ${pct}% have it)`, impact: "critical" });
    }
  } else {
    checks.push({ name: "Image alt text", status: "pass", detail: "No images found on page", impact: "critical" });
  }

  // 5. Form labels
  // Find inputs that should have labels (exclude hidden, submit, button, image types)
  const inputTags = [...html.matchAll(/<input[^>]*>/gi)];
  const labelableInputs = inputTags.filter(tag => {
    const t = tag[0].toLowerCase();
    return !(/type\s*=\s*["'](hidden|submit|button|image|reset)["']/i.test(t));
  });
  const selectTags = [...html.matchAll(/<select[^>]*>/gi)];
  const textareaTags = [...html.matchAll(/<textarea[^>]*>/gi)];
  const totalFormElements = labelableInputs.length + selectTags.length + textareaTags.length;

  if (totalFormElements > 0) {
    let labeled = 0;
    const allFormTags = [...labelableInputs, ...selectTags, ...textareaTags];
    for (const tag of allFormTags) {
      const tagStr = tag[0];
      // Check for aria-label, aria-labelledby, title, or placeholder (less ideal)
      if (/aria-label\s*=\s*["'][^"']+["']/i.test(tagStr) ||
          /aria-labelledby\s*=\s*["'][^"']+["']/i.test(tagStr) ||
          /title\s*=\s*["'][^"']+["']/i.test(tagStr)) {
        labeled++;
      } else {
        // Check for associated <label for="id">
        const idMatch = tagStr.match(/id\s*=\s*["']([^"']+)["']/i);
        if (idMatch && idMatch[1]) {
          const labelForRegex = new RegExp(`<label[^>]*for\\s*=\\s*["']${idMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, "i");
          if (labelForRegex.test(html)) {
            labeled++;
          }
        }
      }
    }
    const pct = Math.round((labeled / totalFormElements) * 100);
    if (labeled === totalFormElements) {
      checks.push({ name: "Form labels", status: "pass", detail: `All ${totalFormElements} form elements have associated labels`, impact: "critical" });
    } else if (pct >= 70) {
      checks.push({ name: "Form labels", status: "warn", detail: `${totalFormElements - labeled} of ${totalFormElements} form elements lack labels (${pct}% labeled)`, impact: "critical" });
    } else {
      checks.push({ name: "Form labels", status: "fail", detail: `${totalFormElements - labeled} of ${totalFormElements} form elements lack labels (only ${pct}% labeled)`, impact: "critical" });
    }
  }
  // No form elements = skip this check (don't penalize pages without forms)

  // 6. Link text quality
  const linkMatches = [...html.matchAll(/<a[^>]*>(.*?)<\/a>/gis)];
  if (linkMatches.length > 0) {
    let genericCount = 0;
    const genericExamples: string[] = [];
    for (const m of linkMatches) {
      // Strip HTML tags from link text
      const text = (m[1] ?? "").replace(/<[^>]+>/g, "").trim();
      if (text && GENERIC_LINK_TEXT.test(text)) {
        genericCount++;
        if (genericExamples.length < 3) genericExamples.push(text.toLowerCase());
      }
    }
    if (genericCount === 0) {
      checks.push({ name: "Link text quality", status: "pass", detail: `${linkMatches.length} links checked — all have descriptive text`, impact: "moderate" });
    } else if (genericCount <= 3) {
      checks.push({ name: "Link text quality", status: "warn", detail: `${genericCount} link(s) with generic text ("${genericExamples.join('", "')}") — unhelpful for screen readers`, impact: "moderate" });
    } else {
      checks.push({ name: "Link text quality", status: "fail", detail: `${genericCount} links with generic text like "${genericExamples.join('", "')}". Screen readers read these out of context.`, impact: "moderate" });
    }
  }

  // 7. ARIA landmarks
  const hasMain = /<main[^>]*>/i.test(html) || /role\s*=\s*["']main["']/i.test(html);
  const hasNav = /<nav[^>]*>/i.test(html) || /role\s*=\s*["']navigation["']/i.test(html);
  const hasHeader = /<header[^>]*>/i.test(html) || /role\s*=\s*["']banner["']/i.test(html);
  const hasFooter = /<footer[^>]*>/i.test(html) || /role\s*=\s*["']contentinfo["']/i.test(html);
  const landmarkCount = [hasMain, hasNav, hasHeader, hasFooter].filter(Boolean).length;
  const landmarkNames = [hasMain && "main", hasNav && "nav", hasHeader && "header", hasFooter && "footer"].filter(Boolean);

  if (landmarkCount >= 3) {
    checks.push({ name: "ARIA landmarks", status: "pass", detail: `${landmarkCount} landmarks found: ${landmarkNames.join(", ")}`, impact: "moderate" });
  } else if (landmarkCount >= 1) {
    const missing = ["main", "nav", "header", "footer"].filter(l => !landmarkNames.includes(l));
    checks.push({ name: "ARIA landmarks", status: "warn", detail: `Only ${landmarkCount} landmark(s): ${landmarkNames.join(", ")}. Missing: ${missing.join(", ")}`, impact: "moderate" });
  } else {
    checks.push({ name: "ARIA landmarks", status: "fail", detail: "No ARIA landmarks found (<main>, <nav>, <header>, <footer>, or role= equivalents)", impact: "moderate" });
  }

  // 8. Skip navigation link
  // Look for a link to #main, #content, #main-content near the top of the page
  const topHtml = html.slice(0, 3000).toLowerCase();
  const hasSkipNav = /href\s*=\s*["']#(main|content|main-content|maincontent|skip|skip-to-content)["']/i.test(topHtml);
  if (hasSkipNav) {
    checks.push({ name: "Skip navigation", status: "pass", detail: "Skip navigation link found near top of page", impact: "moderate" });
  } else {
    checks.push({ name: "Skip navigation", status: "warn", detail: "No skip navigation link found. Keyboard users must tab through all navigation links.", impact: "moderate" });
  }

  // 9. Color contrast & Focus indicators — not checked (requires rendering)
  checks.push({ name: "Color contrast", status: "warn", detail: "Not checked — requires visual rendering. Test with browser DevTools or axe.", impact: "serious" });

  // ─── Calculate score ──────────────────────────────────────────────
  const passed = checks.filter(c => c.status === "pass").length;
  const warnings = checks.filter(c => c.status === "warn").length;
  const failures = checks.filter(c => c.status === "fail").length;

  // Weighted scoring: critical=4, serious=3, moderate=2, minor=1
  const impactWeight: Record<string, number> = { critical: 4, serious: 3, moderate: 2, minor: 1 };
  let totalWeight = 0;
  let earnedWeight = 0;
  for (const check of checks) {
    // Skip the "not checked" items from scoring
    if (check.detail.startsWith("Not checked")) continue;
    const w = impactWeight[check.impact] ?? 1;
    totalWeight += w;
    if (check.status === "pass") earnedWeight += w;
    else if (check.status === "warn") earnedWeight += w * 0.5;
    // fail = 0
  }

  const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;

  return { score, checks, summary: { passed, warnings, failures } };
}
