import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
});
async function open(page) {
  await page.goto("/?demo=1");
  await expect(page.locator("#main")).toHaveAttribute("aria-busy", "false");
}

test.describe("touch period control", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  test("a tap selects a month and closes the menu", async ({ page }) => {
    await open(page);
    await page.locator("#period-trigger").tap();
    const option = page.getByRole("option").last();
    const month = await option.textContent();
    await option.tap();
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(page.locator("#period-trigger")).toContainText(month);
    await expect(page.locator("#header-scope")).toContainText(month);
  });
});

test("period picker supports keyboard selection, cancellation and typeahead", async ({
  page,
}) => {
  await open(page);
  const picker = page.getByRole("combobox", { name: "Период аналитики" });
  const count = await page.locator("#stat-total-reviews").textContent();
  await picker.focus();
  await picker.press("ArrowDown");
  await picker.press("End");
  await picker.press("Escape");
  await expect(picker).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#stat-total-reviews")).toHaveText(count);
  await picker.press("ArrowDown");
  await picker.press("End");
  const selected = await page
    .locator("#period-options .is-highlighted")
    .textContent();
  await picker.press("Enter");
  await expect(picker).toContainText(selected);
  await expect(picker).toBeFocused();
  await expect(page.locator("#header-scope")).toContainText(selected);
  await picker.dispatchEvent("keydown", { key: "в" });
  await picker.press("Enter");
  await expect(picker).toContainText("Всё время");
  await expect(page.locator("#stat-total-reviews")).toHaveText(count);
  await picker.click();
  await page.locator("h1").click();
  await expect(picker).toHaveAttribute("aria-expanded", "false");
});

for (const theme of ["light", "dark"]) {
  test(`open period menu fits a phone and is accessible in ${theme} theme`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await open(page);
    if (theme === "dark") await page.locator("#theme-toggle").click();
    await page.locator("#period-trigger").click();
    await expect(page.getByRole("listbox")).toBeInViewport();
    const bounds = await page.getByRole("listbox").boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(audit.violations).toEqual([]);
    await page.getByRole("option").last().click();
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(page.locator("#period-trigger")).toBeFocused();
  });
}

test("waves flow continuously and the entire interface fades in without waiting for Sheets", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.route("https://docs.google.com/**", () => {});
  await page.goto("/");
  const before = await page
    .locator(".sea-ripples")
    .first()
    .evaluate((node) => getComputedStyle(node).transform);
  await expect
    .poll(() =>
      page
        .locator(".sea-ripples")
        .first()
        .evaluate((node) => getComputedStyle(node).transform),
    )
    .not.toBe(before);
  const opacity = await page.locator(".app-shell").evaluate((node) => {
    const entry = node
      .getAnimations()
      .find((item) => item.animationName === "page-fade");
    entry.pause();
    entry.currentTime = 200;
    const first = Number(getComputedStyle(node).opacity);
    entry.currentTime = 700;
    const second = Number(getComputedStyle(node).opacity);
    entry.finish();
    return { first, second };
  });
  expect(opacity.first).toBeGreaterThan(0);
  expect(opacity.second).toBeLessThan(1);
  expect(opacity.second).toBeGreaterThan(opacity.first);
  await page.locator("#theme-toggle").click();
  await expect(page.locator("#theme-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#motion-toggle").click();
  expect(
    await page
      .locator(".sea-ripples")
      .first()
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("none");
});

test("theme surfaces interpolate instead of jumping and reduced motion skips the transition", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await open(page);
  const surface = page.locator(".insight-card");
  const light = await surface.evaluate(
    (node) => getComputedStyle(node).backgroundColor,
  );
  await page.locator("#theme-toggle").click();
  const middle = await surface.evaluate(
    (node) => getComputedStyle(node).backgroundColor,
  );
  await expect
    .poll(() =>
      surface.evaluate((node) => getComputedStyle(node).backgroundColor),
    )
    .toBe("rgb(16, 44, 57)");
  expect(middle).not.toBe("rgb(16, 44, 57)");
  expect(light).not.toBe("rgb(16, 44, 57)");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("#theme-toggle").click();
  expect(
    await surface.evaluate((node) => getComputedStyle(node).backgroundColor),
  ).toBe(light);
});

test("native period control and content stay visible if the application module fails", async ({
  page,
}) => {
  await page.route("**/app.js", (route) => route.abort());
  await page.goto("/");
  await expect(
    page.getByRole("combobox", { name: "Период аналитики" }),
  ).toBeVisible();
  await expect(page.locator("h1")).toBeVisible();
  expect(
    await page
      .locator(".app-shell")
      .evaluate((node) => getComputedStyle(node).opacity),
  ).toBe("1");
});
