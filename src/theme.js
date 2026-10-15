const key = "shtil-theme";
const system = matchMedia("(prefers-color-scheme: dark)");

function preference() {
  try {
    const value = localStorage.getItem(key);
    return ["light", "dark"].includes(value) ? value : null;
  } catch {
    return null;
  }
}

export function initTheme() {
  const button = document.getElementById("theme-toggle");
  let choice = preference();
  let transitionTimer;
  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    const dark = theme === "dark";
    button.setAttribute("aria-pressed", String(dark));
    button.setAttribute(
      "aria-label",
      dark ? "Включить светлую тему" : "Включить тёмную тему",
    );
    button.title = dark ? "Включить светлую тему" : "Включить тёмную тему";
    document.getElementById("theme-label").textContent = dark
      ? "Светлая тема"
      : "Тёмная тема";
    document.querySelector('meta[name="theme-color"]').content = dark
      ? "#081e29"
      : "#edf4f3";
  }
  const sync = () => apply(choice || (system.matches ? "dark" : "light"));
  sync();
  button.addEventListener("click", () => {
    clearTimeout(transitionTimer);
    document.documentElement.classList.add("theme-transition");
    const theme =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    choice = theme;
    try {
      localStorage.setItem(key, theme);
    } catch {
      /* Switching still works without persistence. */
    }
    apply(theme);
    transitionTimer = setTimeout(() => {
      document.documentElement.classList.remove("theme-transition");
    }, 650);
  });
  system.addEventListener("change", () => {
    if (!choice) sync();
  });
  window.addEventListener("storage", (event) => {
    if (event.key === key || event.key === null) {
      choice = preference();
      sync();
    }
  });
}
