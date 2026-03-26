const VALID_THEMES = Object.freeze(["dark", "light"]);
const TRANSITION_CLASS = "theme-transitioning";
const TRANSITION_MS = 240;

function normalizeTheme(theme, fallbackTheme) {
  return VALID_THEMES.includes(theme) ? theme : fallbackTheme;
}

function readStoredTheme(storageKey) {
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function writeStoredTheme(storageKey, theme) {
  try {
    window.localStorage.setItem(storageKey, theme);
  } catch {
    // ignore storage failures
  }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === "light" ? "light" : "dark";
}

function getNextTheme(theme) {
  return theme === "light" ? "dark" : "light";
}

function updateToggleButton(toggleButtonEl, activeTheme) {
  if (!toggleButtonEl) return;

  const nextTheme = getNextTheme(activeTheme);
  toggleButtonEl.dataset.theme = activeTheme;
  toggleButtonEl.textContent = nextTheme === "light" ? "Light" : "Dark";
  toggleButtonEl.title = nextTheme === "light" ? "切换到亮色主题" : "切换到暗色主题";
  toggleButtonEl.setAttribute("aria-label", toggleButtonEl.title);
}

function runThemeTransition(callback) {
  const root = document.documentElement;
  root.classList.add(TRANSITION_CLASS);
  void root.offsetWidth;
  callback();
  window.setTimeout(() => {
    root.classList.remove(TRANSITION_CLASS);
  }, TRANSITION_MS);
}

export function createThemeController({
  storageKey = "ss-webchat-theme",
  defaultTheme = "dark",
  toggleButtonEl,
} = {}) {
  const fallbackTheme = normalizeTheme(defaultTheme, "dark");
  let activeTheme = normalizeTheme(
    document.documentElement.dataset.theme || readStoredTheme(storageKey),
    fallbackTheme,
  );

  applyTheme(activeTheme);
  updateToggleButton(toggleButtonEl, activeTheme);

  function setTheme(nextTheme, options = {}) {
    const normalizedTheme = normalizeTheme(nextTheme, fallbackTheme);
    const shouldTransition = options.transition !== false && normalizedTheme !== activeTheme;

    const applyNextTheme = () => {
      activeTheme = normalizedTheme;
      applyTheme(activeTheme);
      updateToggleButton(toggleButtonEl, activeTheme);
      writeStoredTheme(storageKey, activeTheme);
    };

    if (shouldTransition) {
      runThemeTransition(applyNextTheme);
    } else {
      applyNextTheme();
    }

    return activeTheme;
  }

  function toggle() {
    return setTheme(getNextTheme(activeTheme));
  }

  if (toggleButtonEl) {
    toggleButtonEl.addEventListener("click", () => {
      toggle();
    });
  }

  return {
    getAvailableThemes: () => [...VALID_THEMES],
    getTheme: () => activeTheme,
    setTheme,
    toggle,
  };
}
