const DEFAULTS = {
  enabled: true,
  theme: 'charcoal',
  brightness: 90,
  contrast: 100,
  sepia: 10,
  siteSettings: {},
  useSystemTheme: false,
  scheduleEnabled: false,
  scheduleStart: '18:00',
  scheduleEnd: '06:00'
};

// Initialize settings on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(Object.keys(DEFAULTS), (res) => {
    const initSettings = {};
    for (let key in DEFAULTS) {
      if (res[key] === undefined) {
        initSettings[key] = DEFAULTS[key];
      }
    }
    if (Object.keys(initSettings).length > 0) {
      chrome.storage.sync.set(initSettings);
    }

    // Set initial badge status
    const isEnabled = res.enabled !== undefined ? res.enabled : DEFAULTS.enabled;
    updateBadge(isEnabled);
  });

  // Create context menu item to toggle the site status
  if (chrome.contextMenus) {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: "toggle-site-context",
        title: "Toggle NovaDark on this site",
        contexts: ["page"]
      });
    });
  }
});

// Handle command shortcuts (Alt+Shift+D)
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-dark-mode") {
    chrome.storage.sync.get("enabled", (data) => {
      const nextState = !data.enabled;
      chrome.storage.sync.set({ enabled: nextState }, () => {
        updateBadge(nextState);
      });
    });
  }
});

// Update extension icon badge
function updateBadge(enabled) {
  const text = enabled ? "ON" : "OFF";
  const color = enabled ? "#10B981" : "#EF4444"; // emerald green or red
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

// Keep badge synced on storage changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.enabled) {
    updateBadge(changes.enabled.newValue);
  }
});

// Context menu action handler
if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "toggle-site-context" && tab && tab.url) {
      try {
        const url = new URL(tab.url);
        const hostname = url.hostname;
        if (!hostname) return;

        chrome.storage.sync.get(["siteSettings"], (data) => {
          const siteSettings = data.siteSettings || {};
          const currentSetting = siteSettings[hostname];

          if (currentSetting === false) {
            siteSettings[hostname] = true;
          } else if (currentSetting === true) {
            siteSettings[hostname] = false;
          } else {
            // If default state, check if dark mode is active and set opposite
            siteSettings[hostname] = false;
          }

          chrome.storage.sync.set({ siteSettings }, () => {
            // Reload tab to apply or run scripting injection
            if (tab.id) {
              chrome.tabs.reload(tab.id);
            }
          });
        });
      } catch (e) {
        console.error("Invalid URL in context menu handler", e);
      }
    }
  });
}
