(function () {
  let styleEl = null;
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
    // Load settings from storage
    chrome.storage.sync.get(settings, (data) => {
      settings = { ...settings, ...data };
      applyDarkMode();
    });

    // Listen for changes from storage (sent by popup)
    chrome.storage.onChanged.addListener((changes) => {
      for (let key in changes) {
        settings[key] = changes[key].newValue;
      }
      applyDarkMode();
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

  function applyDarkMode() {
    const active = shouldBeActive();

    if (!active) {
      removeStyles();
      return;
    }

    // Prepare style element
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'novadark-theme-style';
      // Attempt to append as early as possible
      (document.head || document.documentElement).appendChild(styleEl);
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

    // Dynamic style definitions
    const cssRules = `
      html {
        filter: invert(${filterInvert})
                hue-rotate(${filterHue})
                brightness(${filterBrightness})
                contrast(${filterContrast})
                sepia(${filterSepia}) !important;
        background-color: #ffffff !important;
      }

      /* Re-invert media components to keep colors normal */
      img, video, canvas, iframe,
      svg:not([role="presentation"]):not([class*="icon"]):not([id*="logo"]),
      [style*="background-image"],
      .novadark-bg-img {
        filter: invert(${filterInvert}) hue-rotate(-${filterHue}) !important;
      }

      /* Ensure overlays or fixed background visuals aren't completely broken */
      html::after {
        content: "";
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: ${overlayBg};
        pointer-events: none;
        z-index: 2147483647;
      }

      /* Prevent flash transitions */
      html:not(:defined), html:not([class]) {
        background-color: #121212 !important;
      }
      
      /* Specific override for PDF viewer and print */
      @media print {
        html {
          filter: none !important;
        }
      }
    `;

    styleEl.textContent = cssRules;
  }

  function removeStyles() {
    if (styleEl && styleEl.parentNode) {
      styleEl.parentNode.removeChild(styleEl);
      styleEl = null;
    }
  }

  // Monitor DOM for elements with background images dynamically styled
  let observer = null;
  function startImageObserver() {
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
