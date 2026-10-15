import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const cellRow = (...values) => ({ c: values.map((v) => ({ v })) });
const wrap = (rows) =>
  `/*O_o*/\ngoogle.visualization.Query.setResponse(${JSON.stringify({ status: "ok", table: { rows } })});`;
const sample = {
  reviews: [
    cellRow("2026-10-16", "DIAS", 5, "Очень вкусный кофе"),
    cellRow(
      "2026-10-15",
      "dias",
      2,
      '<img src=x onerror="window.injected=true">',
    ),
    cellRow("2026-09-30", "islam", 4, "Спасибо"),
  ],
  scans: [cellRow("2026-10-16", "dias"), cellRow("2026-10-16", "islam")],
  clicks: [
    cellRow("2026-10-16", "dias", "2gis"),
    cellRow("2026-09-30", "islam", "yandex"),
  ],
};
async function mockSheets(page, options = {}) {
  await page.route("https://docs.google.com/**", (route) => {
    const url = new URL(route.request().url());
    const kind = url.searchParams.get("sheet")
      ? "clicks"
      : url.searchParams.get("gid") === "0"
        ? "reviews"
        : "scans";
    if (options.fail?.includes(kind))
      return route.fulfill({ status: 503, body: "Unavailable" });
    return route.fulfill({
      contentType: "text/plain",
      body: wrap(options.empty ? [] : sample[kind]),
    });
  });
}
async function loaded(page, url = "/") {
  await page.goto(url);
  await expect(page.locator("#refresh-btn")).toBeEnabled();
  await expect(page.locator("#main")).toHaveAttribute("aria-busy", "false");
}
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Avoid third-party fonts in deterministic functional and accessibility tests.
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
});

test("filters, search and metrics use one period and employee scope", async ({
  page,
}) => {
  await mockSheets(page);
  await loaded(page);
  await expect(page.locator("#stat-total-reviews")).toHaveText("3");
  await page.locator("#month-select").selectOption("2026-10");
  await expect(page.locator("#stat-total-reviews")).toHaveText("2");
  await page.locator('[data-employee="dias"]').click();
  await expect(page.locator("#scan-count")).toHaveText("1");
  await expect(page.locator("#conversion")).toHaveText("200,0%");
  await expect(page.locator(".platform-card").nth(1)).toContainText("0");
  await page.locator("#negative-filter-btn").click();
  await expect(page.locator(".review-item")).toHaveCount(1);
  await expect(page.locator("#stat-total-reviews")).toHaveText("2");
  await page.locator("#review-search").fill("нет совпадений");
  await expect(page.locator("#reviews-feed")).toContainText(
    "По этим условиям отзывов нет",
  );
  await page.locator("#reset-filter-btn").click();
  await expect(page.locator('[data-employee="dias"]')).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
test("external text stays text, not executable markup", async ({ page }) => {
  await mockSheets(page);
  await loaded(page);
  await expect(page.locator("#reviews-feed")).toContainText(
    '<img src=x onerror="window.injected=true">',
  );
  await expect(page.locator("#reviews-feed img")).toHaveCount(0);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
});
test("network failures expose unavailable metrics without fabricated fallback", async ({
  page,
}) => {
  await mockSheets(page, { fail: ["reviews", "scans", "clicks"] });
  await loaded(page);
  await expect(page.locator("#source-status")).toHaveClass(
    "source-status error",
  );
  await expect(page.locator("#stat-total-reviews")).toHaveText("—");
  await expect(page.locator("#conversion")).toHaveText("—");
  await expect(page.locator("#reviews-feed")).toContainText(
    "Отзывы недоступны",
  );
  await expect(page.locator(".review-item")).toHaveCount(0);
});
test("partial failure preserves reviews and marks missing scans", async ({
  page,
}) => {
  await mockSheets(page, { fail: ["scans"] });
  await loaded(page);
  await expect(page.locator("#stat-total-reviews")).toHaveText("3");
  await expect(page.locator("#scan-count")).toHaveText("—");
  await expect(page.locator("#conversion")).toHaveText("—");
  await expect(page.locator("#source-status")).toHaveClass(
    "source-status warning",
  );
});
test("failed refresh retains last successful values with a stale warning", async ({
  page,
}) => {
  await mockSheets(page);
  await loaded(page);
  await page.unroute("https://docs.google.com/**");
  await mockSheets(page, { fail: ["reviews", "scans", "clicks"] });
  await page.locator("#refresh-btn").click();
  await expect(page.locator("#source-status")).toContainText("могут устареть");
  await expect(page.locator("#stat-total-reviews")).toHaveText("3");
});
test("valid empty sources show zeros and empty states", async ({ page }) => {
  await mockSheets(page, { empty: true });
  await loaded(page);
  await expect(page.locator("#stat-total-reviews")).toHaveText("0");
  await expect(page.locator("#stat-avg-rating")).toHaveText("—");
  await expect(page.locator("#source-status")).not.toHaveClass(/error|warning/);
  await expect(page.locator("#team-grid")).toContainText(
    "Команда пока не отображается",
  );
});
test("demo is explicit, has pagination and sends no Sheets requests", async ({
  page,
}) => {
  let requests = 0;
  await page.route("https://docs.google.com/**", (route) => {
    requests++;
    return route.abort();
  });
  await loaded(page, "/?demo=1");
  await expect(page.locator("#source-status")).toContainText(
    "не реальные показатели",
  );
  await expect(page.locator(".review-item")).toHaveCount(30);
  await page.locator("#load-more-btn").click();
  await expect(page.locator(".review-item")).toHaveCount(60);
  expect(requests).toBe(0);
});
test("motion responds to preference, has animated waves and a persistent pause control", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await loaded(page, "/?demo=1");
  expect(
    await page
      .locator(".wave-front")
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("wave-drift");
  await page.locator("#motion-toggle").click();
  await expect(page.locator("#motion-toggle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(
    await page
      .locator(".wave-front")
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("none");
  await page.reload();
  await expect(page.locator("#motion-toggle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.locator("#motion-toggle").click();
  await expect(page.locator("#motion-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("#motion-toggle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
for (const width of [320, 390, 768, 1440]) {
  test(`responsive layout fits ${width}px and supports navigation`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await loaded(page, "/?demo=1");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const nav = width < 651 ? ".mobile-nav" : ".main-nav";
    await page.locator(`${nav} a[href="#reviews"]`).click();
    await expect(page).toHaveURL(/#reviews$/);
    await expect(page.locator("#review-search")).toBeInViewport();
  });
}
test("demo dashboard meets automated WCAG AA checks on desktop and mobile", async ({
  page,
}) => {
  await loaded(page, "/?demo=1");
  let result = await new AxeBuilder({ page })
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
  await page.setViewportSize({ width: 390, height: 844 });
  result = await new AxeBuilder({ page })
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
});
