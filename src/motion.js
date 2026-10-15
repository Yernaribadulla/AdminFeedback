const preference = matchMedia("(prefers-reduced-motion: reduce)");
let chosen = null;
try {
  chosen = localStorage.getItem("shtil-motion");
} catch {
  /* Optional preference. */
}
let enabled = !preference.matches && chosen !== "off";
let observer;
const pendingMetrics = new WeakMap();

function apply() {
  document.documentElement.classList.toggle("motion-paused", !enabled);
  document.documentElement.classList.toggle("js-motion", enabled);
  document
    .querySelectorAll("#motion-toggle, #mobile-motion-toggle")
    .forEach((button) => {
      button.setAttribute("aria-pressed", String(enabled));
      button.disabled = preference.matches;
      button.title = preference.matches
        ? "Движение отключено в настройках системы"
        : enabled
          ? "Приостановить анимацию"
          : "Включить анимацию";
    });
  const button = document.getElementById("motion-toggle");
  button.replaceChildren(
    document.createTextNode(
      preference.matches
        ? "Без движения "
        : enabled
          ? "Анимация включена "
          : "Анимация на паузе ",
    ),
  );
  const symbol = document.createElement("span");
  symbol.textContent = "≈";
  symbol.setAttribute("aria-hidden", "true");
  button.append(symbol);
  document
    .getElementById("mobile-motion-toggle")
    .setAttribute(
      "aria-label",
      preference.matches
        ? "Движение отключено системой"
        : enabled
          ? "Приостановить анимацию"
          : "Включить анимацию",
    );
}

export function initMotion() {
  apply();
  document
    .querySelectorAll("#motion-toggle, #mobile-motion-toggle")
    .forEach((button) =>
      button.addEventListener("click", () => {
        enabled = !enabled && !preference.matches;
        chosen = enabled ? "on" : "off";
        try {
          localStorage.setItem("shtil-motion", chosen);
        } catch {
          /* Optional preference. */
        }
        apply();
      }),
    );
  preference.addEventListener("change", () => {
    enabled = !preference.matches && chosen !== "off";
    apply();
  });
  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.08 },
    );
  }
  reveal();
  document.addEventListener("visibilitychange", () =>
    document.documentElement.classList.toggle("tab-paused", document.hidden),
  );
}

export function reveal() {
  document.querySelectorAll(".reveal:not(.is-visible)").forEach((node) => {
    if (observer && enabled) observer.observe(node);
    else node.classList.add("is-visible");
  });
}

export function setMetric(
  node,
  value,
  format = (number) => String(Math.round(number)),
) {
  // Render the real value immediately; animate its appearance, never a fictitious count.
  const text = value === null || !Number.isFinite(value) ? "—" : format(value);
  if (node.textContent === text) return;
  cancelAnimationFrame(pendingMetrics.get(node) || 0);
  node.textContent = text;
  node.classList.remove("metric-changed");
  if (enabled)
    pendingMetrics.set(
      node,
      requestAnimationFrame(() => node.classList.add("metric-changed")),
    );
}
