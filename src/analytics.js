const DAY = 86400000;
export const usable = (source) =>
  source.status === "ready" || source.status === "stale";
export const mean = (rows) =>
  rows.length
    ? rows.reduce((sum, row) => sum + row.rating, 0) / rows.length
    : null;
export const dayNumber = (date) => Date.parse(`${date}T00:00:00Z`) / DAY;
export const dateFromDay = (day) =>
  new Date(day * DAY).toISOString().slice(0, 10);
export const formatName = (name) =>
  name.replace(
    /(^|[\s-])(\S)/gu,
    (_, prefix, letter) => prefix + letter.toLocaleUpperCase("ru-RU"),
  );
export const inScope = (rows, month, name = null) =>
  rows.filter(
    (row) =>
      (month === "all" || row.month === month) && (!name || row.name === name),
  );

export function aggregate(reviews, scans, clicks) {
  const members = new Map();
  const member = (name) => {
    if (!members.has(name))
      members.set(name, {
        name,
        count: 0,
        sum: 0,
        negative: 0,
        scans: 0,
        clicks: { "2gis": 0, yandex: 0, instagram: 0 },
      });
    return members.get(name);
  };
  for (const row of reviews) {
    const item = member(row.name);
    item.count++;
    item.sum += row.rating;
    item.negative += Number(row.rating <= 3);
  }
  for (const row of scans) member(row.name).scans++;
  for (const row of clicks) member(row.name).clicks[row.platform]++;
  return [...members.values()]
    .map((item) => ({
      ...item,
      avg: item.count ? item.sum / item.count : null,
    }))
    .sort(
      (a, b) =>
        (b.avg ?? -1) - (a.avg ?? -1) ||
        b.count - a.count ||
        a.name.localeCompare(b.name, "ru"),
    );
}

export function dashboard(sources, filters, today) {
  const { month, name, negative, query } = filters;
  const period = Object.fromEntries(
    Object.entries(sources).map(([key, value]) => [
      key,
      inScope(value.records, month),
    ]),
  );
  const scoped = Object.fromEntries(
    Object.entries(period).map(([key, rows]) => [
      key,
      name ? rows.filter((row) => row.name === name) : rows,
    ]),
  );
  const team = aggregate(period.reviews, period.scans, period.clicks);
  const stats = aggregate(scoped.reviews, scoped.scans, scoped.clicks);
  const reviewsReady = usable(sources.reviews);
  const scansReady = usable(sources.scans);
  const clicksReady = usable(sources.clicks);
  const distribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: scoped.reviews.filter((row) => Math.round(row.rating) === star)
      .length,
  }));
  const search = query.trim().toLocaleLowerCase("ru-RU");
  const feed = scoped.reviews
    .filter(
      (row) =>
        (!negative || row.rating <= 3) &&
        (!search ||
          `${row.name} ${row.comment}`
            .toLocaleLowerCase("ru-RU")
            .includes(search)),
    )
    .sort((a, b) => b.order - a.order);
  // A historical month ends at the month boundary; the current range ends today.
  const monthEnd =
    month === "all"
      ? today
      : dateFromDay(
          dayNumber(`${month}-01`) +
            new Date(
              Date.UTC(+month.slice(0, 4), +month.slice(5), 0),
            ).getUTCDate() -
            1,
        );
  const end = dayNumber(monthEnd < today ? monthEnd : today);
  const week = scoped.reviews.filter(
    (row) => dayNumber(row.date) <= end && dayNumber(row.date) >= end - 6,
  );
  const previousWeek = scoped.reviews.filter(
    (row) => dayNumber(row.date) <= end - 7 && dayNumber(row.date) >= end - 13,
  );
  const weekAvg = mean(week),
    previousAvg = mean(previousWeek);
  const months = [
    ...new Set(
      Object.values(sources).flatMap((source) =>
        source.records.map((row) => row.month),
      ),
    ),
  ]
    .sort()
    .reverse();
  const trend = Array.from({ length: 14 }, (_, index) => {
    const date = dateFromDay(end - 13 + index);
    const rows = scoped.reviews.filter((row) => row.date === date);
    return { date, avg: mean(rows), count: rows.length };
  });
  return {
    team,
    stats,
    months,
    feed,
    distribution,
    trend,
    end: dateFromDay(end),
    weekAvg,
    delta:
      weekAvg !== null && previousAvg !== null ? weekAvg - previousAvg : null,
    avg: reviewsReady ? mean(scoped.reviews) : null,
    count: reviewsReady ? scoped.reviews.length : null,
    negatives: reviewsReady
      ? scoped.reviews.filter((row) => row.rating <= 3).length
      : null,
    scans: scansReady ? scoped.scans.length : null,
    conversion:
      reviewsReady && scansReady && scoped.scans.length
        ? (scoped.reviews.length / scoped.scans.length) * 100
        : null,
    clicks: clicksReady ? scoped.clicks : null,
    todayNegatives: reviewsReady
      ? scoped.reviews.filter((row) => row.date === today && row.rating <= 3)
          .length
      : null,
    best: reviewsReady ? (stats.find((item) => item.count > 0) ?? null) : null,
    reviewsReady,
    scansReady,
    clicksReady,
  };
}
