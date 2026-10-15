import { config } from "./src/config.js";
import { businessDate, emptySources, refreshSources } from "./src/data.js";
import { dashboard } from "./src/analytics.js";
import { renderDashboard, renderFeed, renderStatus } from "./src/view.js";
import { initMotion } from "./src/motion.js";
import { initTheme } from "./src/theme.js";

const demo = new URLSearchParams(location.search).get("demo") === "1";
const filters = { month: "all", name: null, negative: false, query: "" };
let sources = emptySources();
let limit = config.pageSize;
let loading = false;
let model;

function render() {
  model = dashboard(sources, filters, businessDate());
  renderDashboard(model, filters, limit, (name) => {
    filters.name = filters.name === name ? null : name;
    limit = config.pageSize;
    render();
  });
}

async function refresh() {
  if (loading) return;
  loading = true;
  renderStatus(sources, demo, true);
  try {
    sources = demo
      ? (await import("./src/demo.js")).demoSources()
      : await refreshSources(sources);
    render();
  } finally {
    loading = false;
    renderStatus(sources, demo, false);
  }
}

initTheme();
initMotion();
render();
document.getElementById("refresh-btn").addEventListener("click", refresh);
document.getElementById("month-select").addEventListener("change", (event) => {
  filters.month = event.target.value;
  filters.name = null;
  limit = config.pageSize;
  render();
});
document.getElementById("reset-filter-btn").addEventListener("click", () => {
  filters.name = null;
  limit = config.pageSize;
  render();
});
for (const [id, value] of [
  ["all-reviews-btn", false],
  ["negative-filter-btn", true],
]) {
  document.getElementById(id).addEventListener("click", () => {
    filters.negative = value;
    limit = config.pageSize;
    model = dashboard(sources, filters, businessDate());
    renderFeed(model, filters, limit);
  });
}
document.getElementById("review-search").addEventListener("input", (event) => {
  filters.query = event.target.value;
  limit = config.pageSize;
  model = dashboard(sources, filters, businessDate());
  renderFeed(model, filters, limit);
});
document.getElementById("load-more-btn").addEventListener("click", () => {
  limit += config.pageSize;
  renderFeed(model, filters, limit);
});
document
  .getElementById("review-attention-btn")
  .addEventListener("click", () => {
    filters.negative = true;
    filters.query = "";
    document.getElementById("review-search").value = "";
    limit = config.pageSize;
    model = dashboard(sources, filters, businessDate());
    renderFeed(model, filters, limit);
    const target = document.getElementById("reviews");
    target.scrollIntoView({
      behavior: document.documentElement.classList.contains("motion-paused")
        ? "auto"
        : "smooth",
    });
    const heading = target.querySelector("h2");
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  });
const navLinks = [...document.querySelectorAll(".main-nav a, .mobile-nav a")];
const sections = [...document.querySelectorAll("main section[id]")];
if ("IntersectionObserver" in window) {
  const visible = new Map();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        visible.set(entry.target.id, entry.isIntersecting);
      const current = sections.find((section) => visible.get(section.id));
      if (!current) return;
      for (const link of navLinks) {
        const active = link.hash === `#${current.id}`;
        link.classList.toggle("is-active", active);
        if (active) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      }
    },
    { rootMargin: "-5% 0px -55% 0px", threshold: 0 },
  );
  sections.forEach((section) => observer.observe(section));
}
await refresh();
