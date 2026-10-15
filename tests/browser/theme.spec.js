import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
});
async function open(page, url = "/?demo=1") {
  await page.goto(url);
  await expect(page.locator("#main")).toHaveAttribute("aria-busy", "false");
}
async function dark(page) {
  if ((await page.locator("html").getAttribute("data-theme")) !== "dark")
    await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
}
async function accessible(page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((item) => ({
      id: item.id,
      nodes: item.nodes.map((node) => ({
        target: node.target,
        reason: node.failureSummary,
      })),
    })),
  ).toEqual([]);
}

test("theme toggle preserves analytics scope and persists after reload", async ({
  page,
}) => {
  await open(page);
  await page.locator('[data-employee="диас"]').click();
  await page.locator("#negative-filter-btn").click();
  await page.locator("#review-search").fill("заказ");
  const rating = await page.locator("#stat-avg-rating").textContent();
  const count = await page.locator("#stat-total-reviews").textContent();
  const background = await page
    .locator(".insight-card")
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  await page.locator("#theme-toggle").click();
  await expect(page.locator("#theme-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#theme-toggle")).toHaveAttribute(
    "aria-label",
    "Включить светлую тему",
  );
  await expect(page.locator("#stat-avg-rating")).toHaveText(rating);
  await expect(page.locator("#stat-total-reviews")).toHaveText(count);
  await expect(page.locator("#review-search")).toHaveValue("заказ");
  await expect(page.locator('[data-employee="диас"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#negative-filter-btn")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(
    await page
      .locator(".insight-card")
      .evaluate((node) => getComputedStyle(node).backgroundColor),
  ).not.toBe(background);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("system theme is followed until an explicit user choice", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await open(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(() => localStorage.getItem("shtil-theme")),
  ).toBeNull();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.locator("#theme-toggle").click();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("stored dark theme is applied even before the application module can load", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("shtil-theme", "dark"));
  await page.route("**/app.js", (route) => route.abort());
  await page.goto("/?demo=1");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("h1")).toBeVisible();
});

test("theme switching works when browser storage is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("Storage unavailable");
      },
    }),
  );
  await open(page);
  await dark(page);
  await expect(page.locator("#stat-total-reviews")).toHaveText("225");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("attention shortcut keeps the employee, clears search and opens negative reviews", async ({
  page,
}) => {
  await open(page);
  await page.locator('[data-employee="диас"]').click();
  await page.locator("#review-search").fill("нет совпадений");
  const count = await page.locator("#stat-total-reviews").textContent();
  await page.locator("#review-attention-btn").click();
  await expect(page.locator("#negative-filter-btn")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#review-search")).toHaveValue("");
  await expect(page.locator("#reviews h2")).toBeInViewport();
  await expect(page.locator("#reviews h2")).toBeFocused();
  await expect(page.locator("#stat-total-reviews")).toHaveText(count);
  const reviews = page.locator(".review-item");
  expect(await reviews.count()).toBeGreaterThan(0);
  await expect(page.locator(".review-item:not(.is-negative)")).toHaveCount(0);
});

test("page-wide sea waves pause with the control and reduced-motion preference", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await open(page);
  const waves = page.locator(".sea-far");
  await expect(page.locator(".caspian-background")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  expect(
    await page
      .locator(".caspian-background")
      .evaluate((node) => getComputedStyle(node).pointerEvents),
  ).toBe("none");
  expect(
    await waves.evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("caspian-far");
  await page.locator("#motion-toggle").click();
  expect(
    await waves.evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("none");
  await page.locator("#motion-toggle").click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("#motion-toggle")).toBeDisabled();
  expect(
    await waves.evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("none");
});

test("animated metrics display the real value immediately instead of counting up from zero", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await open(page);
  await expect(page.locator("#stat-total-reviews")).toHaveText("225");
  await expect(page.locator("#stat-avg-rating")).toHaveText("4,7");
});

for (const width of [320, 390, 768, 1440]) {
  test(`dark layout fits ${width}px and theme control remains reachable`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    await dark(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator("#theme-toggle")).toBeInViewport();
    await page.locator("#theme-toggle").press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const navigation = width < 651 ? ".mobile-nav" : ".main-nav";
    await page.locator(`${navigation} a[href="#reviews"]`).click();
    await expect(page.locator("#theme-toggle")).toBeInViewport();
    await expect(page.locator("#reviews h2")).toBeInViewport();
  });
}

test("dark theme accessibility includes selected staff, negative reviews and mobile controls", async ({
  page,
}) => {
  await open(page);
  await dark(page);
  await page.locator('[data-employee="диас"]').click();
  await page.locator("#negative-filter-btn").click();
  await accessible(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await accessible(page);
});

test("dark error and partial-data notices have accessible contrast", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.route("https://docs.google.com/**", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await open(page, "/");
  await accessible(page);
  await page.unroute("https://docs.google.com/**");
  await page.route("https://docs.google.com/**", (route) => {
    if (new URL(route.request().url()).searchParams.get("gid") !== "0")
      return route.fulfill({ status: 503, body: "Unavailable" });
    const rows = [
      {
        c: [
          { v: "2026-10-16" },
          { v: "Сотрудник" },
          { v: 5 },
          { v: "Спасибо" },
        ],
      },
    ];
    return route.fulfill({
      body: `google.visualization.Query.setResponse(${JSON.stringify({ status: "ok", table: { rows } })});`,
    });
  });
  await page.locator("#refresh-btn").click();
  await expect(page.locator("#source-status")).toHaveClass(
    "source-status warning",
  );
  await accessible(page);
});
