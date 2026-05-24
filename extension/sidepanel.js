const YOKE_BASE = "https://yoke.lol";
const frame = document.getElementById("yoke-frame");
let currentDomain = null;

// ── Icon picker ──
const ICONS = [
  { id: "bolt", label: "Bolt" },
  { id: "neon", label: "Neon" },
  { id: "glow", label: "Glow" },
  { id: "circuit", label: "Circuit" },
  { id: "nodes", label: "Nodes" },
  { id: "radar", label: "Radar" },
];

const settingsBtn = document.getElementById("settings-btn");
const settingsPanel = document.getElementById("settings-panel");
const iconGrid = document.getElementById("icon-grid");

// Build icon grid
ICONS.forEach(({ id, label }) => {
  const opt = document.createElement("div");
  opt.className = "icon-option";
  opt.dataset.icon = id;
  opt.innerHTML = `<img src="icons/${id}/icon128.png" alt="${label}"><span>${label}</span>`;
  opt.addEventListener("click", () => selectIcon(id));
  iconGrid.appendChild(opt);
});

function selectIcon(iconId) {
  document.querySelectorAll(".icon-option").forEach((el) => {
    el.classList.toggle("selected", el.dataset.icon === iconId);
  });
  chrome.runtime.sendMessage({ type: "SET_ICON", icon: iconId });
}

// Load current icon selection
chrome.runtime.sendMessage({ type: "GET_ICON" }, (res) => {
  const current = res?.icon || "bolt";
  document.querySelectorAll(".icon-option").forEach((el) => {
    el.classList.toggle("selected", el.dataset.icon === current);
  });
});

// Toggle settings
settingsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  settingsPanel.classList.toggle("open");
  settingsBtn.classList.toggle("active");
});

// Close settings when clicking elsewhere
document.addEventListener("click", (e) => {
  if (!settingsPanel.contains(e.target) && e.target !== settingsBtn) {
    settingsPanel.classList.remove("open");
    settingsBtn.classList.remove("active");
  }
});

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
