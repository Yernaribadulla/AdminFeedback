import { config } from "./config.js";

export function businessDate(date = new Date(), timeZone = config.timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function civilDate(year, month, day, hour = 0, minute = 0, second = 0) {
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    year < 1900 ||
    year > 2200 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  )
    return null;
  return { date: date.toISOString().slice(0, 10), order: date.getTime() };
}

// Sheets dates without an offset are civil dates in the configured business zone.
export function parseDate(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  let match = text.match(
    /^Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})(?:,\s*(\d{1,2}),\s*(\d{1,2})(?:,\s*(\d{1,2}))?)?\)$/,
  );
  if (match)
    return civilDate(
      +match[1],
      +match[2] + 1,
      +match[3],
      +(match[4] || 0),
      +(match[5] || 0),
      +(match[6] || 0),
    );
  match = text.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (match)
    return civilDate(
      +match[3],
      +match[2],
      +match[1],
      +(match[4] || 0),
      +(match[5] || 0),
      +(match[6] || 0),
    );
  match = text.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/,
  );
  if (!match) return null;
  const civil = civilDate(
    +match[1],
    +match[2],
    +match[3],
    +(match[4] || 0),
    +(match[5] || 0),
    +(match[6] || 0),
  );
  if (!civil || !match[7]) return civil;
  const instant = new Date(text);
  if (!Number.isFinite(instant.getTime())) return null;
  // Ordering uses local civil time too, so offset and offset-free rows can mix.
  const local = new Intl.DateTimeFormat("sv-SE", {
    timeZone: config.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(instant);
  return parseDate(local);
}

export function parseRating(value) {
  let number;
  if (typeof value === "number") number = value;
  else if (typeof value === "string") {
    const text = value.trim();
    const bracket = text.match(/\(([1-5])\s*\/\s*5\)/);
    if (bracket) number = +bracket[1];
    else if (/^[⭐★\s\uFE0F]+$/u.test(text))
      number = [...text].filter((char) => char === "⭐" || char === "★").length;
    else if (/^[1-5](?:[.,]\d+)?(?:\s*\/\s*5)?$/.test(text))
      number = Number(text.split("/")[0].replace(",", ".").trim());
  }
  return Number.isFinite(number) && number >= 1 && number <= 5 ? number : null;
}

export function normalizeName(value) {
  return typeof value === "string"
    ? value
        .normalize("NFC")
        .trim()
        .replace(/\s+/g, " ")
        .toLocaleLowerCase("ru-RU")
    : "";
}

export function parseGviz(text) {
  // Parse data only: never execute Google's JSONP wrapper or a cell value.
  const match = text.match(
    /^\s*(?:\/\*[\s\S]*?\*\/\s*)?google\.visualization\.Query\.setResponse\(([\s\S]*)\);?\s*$/,
  );
  if (!match) throw new Error("Источник вернул неизвестный формат ответа");
  const json = JSON.parse(match[1]);
  if (json.status === "error" || !Array.isArray(json.table?.rows))
    throw new Error("Источник не предоставил таблицу");
  return json.table.rows;
}

export function extractRows(kind, rows) {
  if (!["reviews", "scans", "clicks"].includes(kind))
    throw new Error("Неизвестный источник");
  let skipped = 0;
  const records = [];
  for (const row of rows) {
    const cells = row?.c;
    if (
      !Array.isArray(cells) ||
      cells.every((cell) => cell?.v == null && !cell?.f)
    )
      continue;
    const raw = (index) => cells[index]?.v ?? cells[index]?.f;
    const date = parseDate(raw(0));
    const name = normalizeName(raw(1));
    const rating = kind === "reviews" ? parseRating(raw(2)) : null;
    const platform =
      kind === "clicks"
        ? String(raw(2) ?? "")
            .trim()
            .toLowerCase()
        : null;
    if (
      !date ||
      !name ||
      name === "unknown" ||
      (kind === "reviews" && rating === null) ||
      (kind === "clicks" && !["2gis", "yandex", "instagram"].includes(platform))
    ) {
      skipped++;
      continue;
    }
    records.push({
      ...date,
      month: date.date.slice(0, 7),
      name,
      ...(kind === "reviews"
        ? { rating, comment: String(raw(3) ?? "").trim() }
        : {}),
      ...(kind === "clicks" ? { platform } : {}),
    });
  }
  return { records, skipped };
}

export function sourceUrl(kind, settings = config) {
  const url = new URL(
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(settings.sheetId)}/gviz/tq`,
  );
  url.search = new URLSearchParams({
    tqx: "out:json",
    headers: "1",
    ...settings.sheets[kind],
  });
  return url.href;
}

export async function loadSource(
  kind,
  { fetcher = fetch, timeoutMs = config.timeoutMs } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(sourceUrl(kind), {
      signal: controller.signal,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
    });
    if (!response.ok)
      throw new Error(`Источник недоступен (HTTP ${response.status})`);
    return extractRows(kind, parseGviz(await response.text()));
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error("Превышено время ожидания источника");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function emptySources() {
  return Object.fromEntries(
    ["reviews", "scans", "clicks"].map((kind) => [
      kind,
      {
        records: [],
        status: "loading",
        updatedAt: null,
        skipped: 0,
      },
    ]),
  );
}

export async function refreshSources(
  previous,
  loader = loadSource,
  now = () => new Date(),
) {
  const kinds = ["reviews", "scans", "clicks"];
  const results = await Promise.allSettled(kinds.map((kind) => loader(kind)));
  return Object.fromEntries(
    kinds.map((kind, index) => {
      const result = results[index];
      return [
        kind,
        result.status === "fulfilled"
          ? { ...result.value, status: "ready", updatedAt: now().toISOString() }
          : {
              ...previous[kind],
              status: previous[kind].updatedAt ? "stale" : "error",
            },
      ];
    }),
  );
}
