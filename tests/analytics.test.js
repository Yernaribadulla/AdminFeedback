import { test } from "node:test";
import assert from "node:assert/strict";
import { dashboard, aggregate, dayNumber } from "../src/analytics.js";
import { emptySources } from "../src/data.js";

const filters = { month: "all", name: null, negative: false, query: "" };
const row = (date, name, rating = 5, comment = "") => ({
  date,
  month: date.slice(0, 7),
  order: dayNumber(date) * 86400000,
  name,
  rating,
  comment,
});
function fixture() {
  const sources = emptySources();
  for (const source of Object.values(sources)) source.status = "ready";
  sources.reviews.records = [
    row("2026-10-16", "dias", 5, "Вкусный кофе"),
    row("2026-10-15", "dias", 2, "Долго"),
    row("2026-10-08", "dias", 3),
    row("2026-09-30", "islam", 4),
  ];
  sources.scans.records = [
    row("2026-10-16", "dias"),
    row("2026-10-16", "islam"),
    row("2026-09-30", "islam"),
  ];
  sources.clicks.records = [
    { ...row("2026-10-16", "dias"), platform: "2gis" },
    { ...row("2026-09-30", "islam"), platform: "yandex" },
  ];
  return sources;
}
test("period and employee apply consistently across metrics and channels", () => {
  const result = dashboard(
    fixture(),
    { ...filters, month: "2026-10", name: "dias" },
    "2026-10-16",
  );
  assert.equal(result.count, 3);
  assert.equal(result.scans, 1);
  assert.equal(result.conversion, 300);
  assert.equal(result.clicks.length, 1);
  assert.equal(result.avg, 10 / 3);
  assert.equal(result.negatives, 2);
});
test("negative and search filters change the feed, preserving context metrics", () => {
  const result = dashboard(
    fixture(),
    { ...filters, negative: true, query: "ДОЛГО" },
    "2026-10-16",
  );
  assert.equal(result.feed.length, 1);
  assert.equal(result.count, 4);
  assert.equal(result.avg, 3.5);
});
test("unknown data is distinct from a successful empty source", () => {
  const sources = emptySources();
  let result = dashboard(sources, filters, "2026-10-16");
  assert.equal(result.count, null);
  assert.equal(result.scans, null);
  assert.equal(result.conversion, null);
  sources.reviews.status = "ready";
  result = dashboard(sources, filters, "2026-10-16");
  assert.equal(result.count, 0);
  assert.equal(result.avg, null);
  assert.equal(result.scans, null);
});
test("unavailable scans do not look like zero conversion", () => {
  const sources = fixture();
  sources.scans.status = "error";
  const result = dashboard(sources, filters, "2026-10-16");
  assert.equal(result.conversion, null);
  assert.equal(result.scans, null);
});
test("weekly windows use calendar dates, not the last review date", () => {
  const result = dashboard(fixture(), filters, "2026-10-16");
  assert.equal(result.weekAvg, 3.5);
  assert.equal(result.delta, 0.5);
  assert.equal(dashboard(fixture(), filters, "2026-11-16").weekAvg, null);
});
test("historical month ends on its boundary and is not labeled as this week", () => {
  const result = dashboard(
    fixture(),
    { ...filters, month: "2026-09" },
    "2026-10-16",
  );
  assert.equal(result.end, "2026-09-30");
  assert.equal(result.weekAvg, 4);
});
test("month choices include scans-only and clicks-only months", () => {
  const sources = fixture();
  sources.scans.records.push(row("2026-08-15", "dias"));
  assert.deepEqual(dashboard(sources, filters, "2026-10-16").months, [
    "2026-10",
    "2026-09",
    "2026-08",
  ]);
});
test("aggregation supports unusual names safely and deterministic ties", () => {
  const result = aggregate(
    [
      row("2026-10-16", "__proto__", 5),
      row("2026-10-16", "dias", 5),
      row("2026-10-16", "dias", 5),
    ],
    [row("2026-10-16", "scans only")],
    [],
  );
  assert.equal(result[0].name, "dias");
  assert.equal(result[1].name, "__proto__");
  assert.equal(result.find((member) => member.name === "scans only").avg, null);
});
test("trend gaps remain null and review feed is newest first", () => {
  const result = dashboard(fixture(), filters, "2026-10-16");
  assert.equal(result.trend.length, 14);
  assert.equal(result.trend.at(-1).avg, 5);
  assert.equal(result.trend.find((day) => day.date === "2026-10-14").avg, null);
  assert.equal(result.feed[0].date, "2026-10-16");
});
