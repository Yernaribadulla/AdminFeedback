const preference = matchMedia("(prefers-reduced-motion: reduce)");
let chosen = null;
try {
  chosen = localStorage.getItem("shtil-motion");
} catch {
  /* Optional preference. */
}
let enabled = !preference.matches && chosen !== "off";
let observer;
const counters = new WeakMap();

function apply() {
  document.documentElement.classList.toggle("motion-paused", !enabled);
  document.documentElement.classList.toggle("js-motion", enabled);
  document
    .querySelectorAll("#motion-toggle, #mobile-motion-toggle")
    .forEach((button) => button.setAttribute("aria-pressed", String(enabled)));
  const button = document.getElementById("motion-toggle");
  button.replaceChildren(
    document.createTextNode(
      enabled ? "Анимация включена " : "Анимация на паузе ",
    ),
  );
  const symbol = document.createElement("span");
  symbol.textContent = "≈";
  symbol.setAttribute("aria-hidden", "true");
  button.append(symbol);
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

export function countTo(
  node,
  value,
  format = (number) => String(Math.round(number)),
) {
  const previous = counters.get(node);
  if (previous?.frame) cancelAnimationFrame(previous.frame);
  if (value === null || !Number.isFinite(value)) {
    counters.delete(node);
    node.textContent = "—";
    return;
  }
  if (!enabled || previous?.target === value) {
    counters.set(node, { target: value, current: value });
    node.textContent = format(value);
    return;
  }
  const from = previous?.current ?? 0;
  const start = performance.now();
  const state = { target: value, current: from, frame: 0 };
  counters.set(node, state);
  const tick = (now) => {
    const progress = enabled ? Math.min((now - start) / 750, 1) : 1;
    state.current = from + (value - from) * (1 - (1 - progress) ** 3);
    node.textContent = format(state.current);
    if (progress < 1) state.frame = requestAnimationFrame(tick);
  };
  state.frame = requestAnimationFrame(tick);
}
