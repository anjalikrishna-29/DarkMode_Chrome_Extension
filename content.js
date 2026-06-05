(function () {
  let settings = {
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

  // Determine current hostname
  const hostname = window.location.hostname;

  // Initialize
  init();

  function init() {
    // Load settings from local storage
    chrome.storage.local.get(settings, (data) => {
      settings = { ...settings, ...data };
      applyDarkMode();
      // Start observer on HTML tag to protect our classes/styles from inline script overrides
      startHTMLObserver();
    });

    // Listen for changes from local storage (sent by popup)
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      let changed = false;
      for (let key in changes) {
        if (settings[key] !== undefined) {
          settings[key] = changes[key].newValue;
          changed = true;
        }
      }
      if (changed) {
        applyDarkMode();
      }
    });

    // Watch for DOM changes to mark background images
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startImageObserver);
    } else {
      startImageObserver();
    }
  }

  // Returns true if dark mode should be active based on all settings
  function shouldBeActive() {
    // 1. Check if disabled on this specific site
    if (settings.siteSettings && settings.siteSettings[hostname] === false) {
      return false;
    }
    // 2. Check if explicitly enabled on this specific site (takes precedence over global toggle)
    if (settings.siteSettings && settings.siteSettings[hostname] === true) {
      return true;
    }
    // 3. Check global toggle
    if (!settings.enabled) {
      return false;
    }
    // 4. Check system theme match
    if (settings.useSystemTheme) {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (!systemDark) return false;
    }
    // 5. Check schedule
    if (settings.scheduleEnabled) {
      return isTimeInSchedule(settings.scheduleStart, settings.scheduleEnd);
    }

    return true;
  }

  function isTimeInSchedule(startStr, endStr) {
    if (!startStr || !endStr) return false;
    const now = new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);

    const startMin = startH * 60 + startM;
    const endMin = endH * 60 + endM;

    if (startMin < endMin) {
      // Schedule is within the same day (e.g. 09:00 to 17:00)
      return currentMin >= startMin && currentMin <= endMin;
    } else {
      // Schedule spans overnight (e.g. 18:00 to 06:00)
      return currentMin >= startMin || currentMin <= endMin;
    }
  }

  // Detects if the website already has a native dark theme (to prevent double-inverting)
  function isPageAlreadyDark() {
    const body = document.body;
    if (!body) return false;

    const bodyBg = window.getComputedStyle(body).backgroundColor;
    if (!bodyBg || bodyBg === 'rgba(0, 0, 0, 0)' || bodyBg === 'transparent') {
      const htmlBg = window.getComputedStyle(document.documentElement).backgroundColor;
      if (!htmlBg || htmlBg === 'rgba(0, 0, 0, 0)' || htmlBg === 'transparent') {
        return false;
      }
      return checkColorDarkness(htmlBg);
    }
    return checkColorDarkness(bodyBg);
  }

  function checkColorDarkness(colorStr) {
    const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      const r = parseInt(match[1]);
      const g = parseInt(match[2]);
      const b = parseInt(match[3]);
      // Calculate YIQ brightness
      const yiq = (r * 299 + g * 587 + b * 114) / 1000;
      return yiq < 120; // If brightness < 120, the page background is already dark
    }
    return false;
  }

  function applyDarkMode() {
    const active = shouldBeActive();

    // Prevent inverting already dark pages
    if (!active || isPageAlreadyDark()) {
      removeStyles();
      return;
    }

    // Set variable updates
    let filterInvert = 1;
    let filterHue = '180deg';
    let filterBrightness = settings.brightness / 100;
    let filterContrast = settings.contrast / 100;
    let filterSepia = settings.sepia / 100;
    let overlayBg = 'transparent';

    // Apply Theme Presets
    if (settings.theme === 'pitchblack') {
      filterBrightness = (settings.brightness / 100) * 0.85;
      filterContrast = (settings.contrast / 100) * 1.15;
      filterSepia = 0;
    } else if (settings.theme === 'deepblue') {
      filterHue = '190deg'; // Shift hue slightly towards blue-cyan
      filterBrightness = (settings.brightness / 100) * 0.95;
      overlayBg = 'rgba(10, 25, 50, 0.08)'; // Subtly inject dark navy tint
    }

    const doc = document.documentElement;
    if (doc) {
      doc.classList.add('novadark-active');
      doc.style.setProperty('--novadark-invert', filterInvert);
      doc.style.setProperty('--novadark-hue', filterHue);
      doc.style.setProperty('--novadark-revert-hue', '-' + filterHue);
      doc.style.setProperty('--novadark-brightness', filterBrightness);
      doc.style.setProperty('--novadark-contrast', filterContrast);
      doc.style.setProperty('--novadark-sepia', filterSepia);
      doc.style.setProperty('--novadark-overlay-bg', overlayBg);
    }
  }

  function removeStyles() {
    const doc = document.documentElement;
    if (doc) {
      doc.classList.remove('novadark-active');
      doc.style.removeProperty('--novadark-invert');
      doc.style.removeProperty('--novadark-hue');
      doc.style.removeProperty('--novadark-revert-hue');
      doc.style.removeProperty('--novadark-brightness');
      doc.style.removeProperty('--novadark-contrast');
      doc.style.removeProperty('--novadark-sepia');
      doc.style.removeProperty('--novadark-overlay-bg');
    }
  }

  // HTML observer to prevent inline page scripts from clearing classes/styles
  let htmlObserver = null;
  function startHTMLObserver() {
    htmlObserver = new MutationObserver(() => {
      htmlObserver.disconnect();
      applyDarkMode();
      observeHTML();
    });
    observeHTML();
  }

  function observeHTML() {
    if (htmlObserver && document.documentElement) {
      htmlObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'style']
      });
    }
  }

  // Monitor DOM for elements with background images dynamically styled
  let observer = null;
  function startImageObserver() {
    // Re-evaluate dark mode now that the body is available (checks isPageAlreadyDark)
    applyDarkMode();

    // Initial scan
    scanBackgroundImages();

    // Set up observer for dynamically added content
    observer = new MutationObserver((mutations) => {
      let runScan = false;
      for (let mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          runScan = true;
          break;
        }
      }
      if (runScan) {
        scanBackgroundImages();
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  let scanTimeout = null;
  function scanBackgroundImages() {
    // Throttle style check to avoid performance degradation
    if (scanTimeout) clearTimeout(scanTimeout);
    scanTimeout = setTimeout(() => {
      const elements = document.querySelectorAll('*');
      elements.forEach((el) => {
        if (el.classList && !el.classList.contains('novadark-bg-img')) {
          // Quick initial filter checks
          const inlineStyle = el.getAttribute('style');
          if (inlineStyle && inlineStyle.includes('background-image')) {
            el.classList.add('novadark-bg-img');
            return;
          }
          // Computed check for stylesheet styles
          const bg = window.getComputedStyle(el).backgroundImage;
          if (bg && bg !== 'none' && bg.includes('url(')) {
            el.classList.add('novadark-bg-img');
          }
        }
      });
    }, 150);
  }
})();
