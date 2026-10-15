import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDate,
  parseRating,
  normalizeName,
  parseGviz,
  extractRows,
  loadSource,
  sourceUrl,
  refreshSources,
  emptySources,
  businessDate,
} from "../src/data.js";

const wrap = (rows) =>
  `/*O_o*/\ngoogle.visualization.Query.setResponse(${JSON.stringify({ status: "ok", table: { rows } })});`;
const row = (...values) => ({ c: values.map((v) => ({ v })) });

test("civil dates are strict and never replaced with today", () => {
  for (const value of [
    null,
    "",
    "invalid",
    "31.02.2026",
    "2026-02-29",
    "2026-04-31",
    "Date(2026,12,1)",
    "2026-10-16T25:00",
    "2026-01-01 trailing",
  ])
    assert.equal(parseDate(value), null, String(value));
  assert.equal(parseDate("Date(2026,9,16,12,30,15)").date, "2026-10-16");
  assert.equal(parseDate("16.10.2026, 12:30:15").date, "2026-10-16");
  assert.equal(parseDate("2024-02-29").date, "2024-02-29");
});
test("offset timestamps and today use the coffee shop timezone", () => {
  assert.equal(parseDate("2026-10-15T23:30:00Z").date, "2026-10-16");
  assert.equal(businessDate(new Date("2026-10-15T23:30:00Z")), "2026-10-16");
  assert.equal(
    parseDate("2026-10-16T04:30:00").order,
    parseDate("2026-10-15T23:30:00Z").order,
  );
});
test("ratings accept supported forms and reject garbage instead of clamping", () => {
  for (const [value, expected] of [
    [5, 5],
    ["4,5", 4.5],
    ["⭐⭐⭐⭐⭐", 5],
    ["★★★★★", 5],
    ["Отлично (5/5)", 5],
    ["4 / 5", 4],
  ])
    assert.equal(parseRating(value), expected);
  for (const value of [
    null,
    "",
    0,
    6,
    -1,
    Infinity,
    "rating 999",
    "⭐x",
    "0/5",
  ])
    assert.equal(parseRating(value), null);
});
test("GViz validates errors and never evaluates JavaScript", () => {
  assert.deepEqual(parseGviz(wrap([])), []);
  for (const text of [
    "<html>Login</html>",
    "alert(1)",
    'google.visualization.Query.setResponse({"status":"error"});',
    'google.visualization.Query.setResponse({"table":{}});',
  ])
    assert.throws(() => parseGviz(text));
});
test("row extraction normalizes names and reports invalid records", () => {
  const result = extractRows("reviews", [
    row("2026-10-16", " DIAS ", "⭐⭐⭐⭐⭐", "<img onerror=alert(1)>"),
    row("bad", "dias", 5),
    row("2026-10-16", "   ", 5),
    row("2026-10-16", "dias", 9),
    row(null, null),
  ]);
  assert.equal(result.skipped, 3);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].name, "dias");
  assert.equal(result.records[0].comment, "<img onerror=alert(1)>");
  assert.equal(normalizeName("  Диас   Али "), "диас али");
});
test("clicks accept known platforms only", () => {
  const result = extractRows("clicks", [
    row("2026-10-16", "DIAS", " 2GIS "),
    row("2026-10-16", "dias", "evil"),
    row("2026-10-16", "unknown", "2gis"),
  ]);
  assert.equal(result.records.length, 1);
  assert.equal(result.skipped, 2);
});
test("source URL encodes tab names and fixes the header row", () => {
  const url = new URL(sourceUrl("clicks"));
  assert.equal(url.searchParams.get("sheet"), "PlatformClicks");
  assert.equal(url.searchParams.get("headers"), "1");
});
test("loadSource handles HTTP, format failures and an empty valid table", async () => {
  await assert.rejects(
    loadSource("reviews", {
      fetcher: async () => ({ ok: false, status: 403 }),
    }),
    /403/,
  );
  await assert.rejects(
    loadSource("reviews", {
      fetcher: async () => ({ ok: true, text: async () => "login" }),
    }),
  );
  assert.deepEqual(
    await loadSource("reviews", {
      fetcher: async () => ({ ok: true, text: async () => wrap([]) }),
    }),
    { records: [], skipped: 0 },
  );
});
test("request timeout aborts the fetch", async () => {
  await assert.rejects(
    loadSource("reviews", {
      timeoutMs: 5,
      fetcher: (_url, { signal }) =>
        new Promise((resolve, reject) =>
          signal.addEventListener("abort", () => reject(new Error("aborted"))),
        ),
    }),
    /время ожидания/,
  );
});
test("sources load independently and keep explicitly stale snapshots on a failed refresh", async () => {
  const previous = emptySources();
  previous.reviews = {
    records: [{ name: "dias" }],
    skipped: 0,
    status: "ready",
    updatedAt: "2026-10-16T00:00:00Z",
  };
  const result = await refreshSources(previous, async (kind) => {
    if (kind !== "clicks") throw new Error("offline");
    return { records: [], skipped: 0 };
  });
  assert.equal(result.reviews.status, "stale");
  assert.equal(result.reviews.records.length, 1);
  assert.equal(result.scans.status, "error");
  assert.equal(result.clicks.status, "ready");
  assert.equal(previous.reviews.status, "ready");
});
test("all three sources start in parallel", async () => {
  const started = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const pending = refreshSources(emptySources(), async (kind) => {
    started.push(kind);
    await gate;
    return { records: [], skipped: 0 };
  });
  assert.equal(started.length, 3);
  release();
  await pending;
});
