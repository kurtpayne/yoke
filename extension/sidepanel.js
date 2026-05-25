const YOKE_BASE = "https://yoke.lol";
const frame = document.getElementById("yoke-frame");
let currentDomain = null;

// ── Domain loading ──
function extractDomain(url) {
  try {
    const u = new URL(url);
    if (!u.hostname || u.protocol === "chrome:" || u.protocol === "chrome-extension:" || u.protocol === "about:") {
      return null;
    }
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function loadDomain(domain) {
  if (!domain || domain === currentDomain) return;
  currentDomain = domain;
  frame.src = `${YOKE_BASE}/${domain}`;
}

// Listen for tab updates from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "TAB_UPDATED" && msg.url) {
    const domain = extractDomain(msg.url);
    if (domain) loadDomain(domain);
  }
});

// On panel open, grab current tab
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]?.url) {
    const domain = extractDomain(tabs[0].url);
    if (domain) {
      loadDomain(domain);
    } else {
      frame.src = YOKE_BASE;
    }
  } else {
    frame.src = YOKE_BASE;
  }
});
