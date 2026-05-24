// Icon sets available for the toolbar
const ICON_SETS = ["bolt", "neon", "glow", "circuit", "nodes", "radar"];

function getIconPaths(name) {
  return {
    "16": `icons/${name}/icon16.png`,
    "32": `icons/${name}/icon32.png`,
    "48": `icons/${name}/icon48.png`,
    "128": `icons/${name}/icon128.png`,
  };
}

// Apply saved icon on startup
chrome.storage.local.get("selectedIcon", (data) => {
  const icon = data.selectedIcon || "bolt";
  chrome.action.setIcon({ path: getIconPaths(icon) });
});

// Listen for icon change messages from sidepanel
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SET_ICON" && ICON_SETS.includes(msg.icon)) {
    chrome.storage.local.set({ selectedIcon: msg.icon });
    chrome.action.setIcon({ path: getIconPaths(msg.icon) });
    sendResponse({ ok: true });
  }
  if (msg.type === "GET_ICON") {
    chrome.storage.local.get("selectedIcon", (data) => {
      sendResponse({ icon: data.selectedIcon || "bolt" });
    });
    return true; // async response
  }
});

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

// Update the side panel when the user navigates to a new page
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    chrome.runtime.sendMessage({ type: "TAB_UPDATED", url: tab.url }).catch(() => {});
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (tab.url) {
    chrome.runtime.sendMessage({ type: "TAB_UPDATED", url: tab.url }).catch(() => {});
  }
});
