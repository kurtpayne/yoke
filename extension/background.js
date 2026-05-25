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
