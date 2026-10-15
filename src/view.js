import { formatName, usable } from "./analytics.js";
import { config } from "./config.js";
import { countTo, reveal } from "./motion.js";

const $ = (id) => document.getElementById(id);
const decimal = (value) =>
  value.toLocaleString("ru-RU", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
const integer = (value) => Math.round(value).toLocaleString("ru-RU");
const dateLabel = (date) => date.split("-").reverse().join(".");
const monthLabel = (month) =>
  new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));

// All external values use textContent, including names, comments and dates.
export function el(tag, className = "", text = null, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== null) node.textContent = text;
  node.append(...children);
  return node;
}
const empty = (title, description = "") =>
  el("div", "state-placeholder", null, [
    el("span", "", title),
    el("small", "", description),
  ]);
const press = (id, active) => {
  $(id).classList.toggle("is-active", active);
  $(id).setAttribute("aria-pressed", String(active));
};

export function renderStatus(sources, demo, loading) {
  const status = $("source-status");
  const titles = { reviews: "отзывы", scans: "QR-сканы", clicks: "переходы" };
  const failures = Object.entries(sources).filter(([, source]) =>
    ["error", "stale"].includes(source.status),
  );
  const skipped = Object.values(sources).reduce(
    (sum, source) => sum + source.skipped,
    0,
  );
  status.className = "source-status";
  if (demo) {
    status.classList.add("demo");
    status.textContent =
      "Демонстрационный режим · пример данных, не реальные показатели кофейни.";
    const link = el("a", "", "К рабочим данным ↗");
    link.href = location.pathname;
    status.append(link);
  } else if (loading)
    status.textContent = "Обновляем три источника Google Sheets…";
  else if (failures.length) {
    status.classList.add(
      failures.length === 3 && !failures.some(([, source]) => usable(source))
        ? "error"
        : "warning",
    );
    status.textContent =
      `Не удалось обновить: ${failures.map(([kind]) => titles[kind]).join(", ")}. ` +
      (failures.some(([, source]) => source.status === "stale")
        ? "Показаны последние загруженные данные; они могут устареть."
        : "Недоступные показатели обозначены «—». Проверьте доступ к таблице и повторите обновление.");
  } else
    status.textContent = `Google Sheets · три источника подключены${skipped ? ` · пропущено некорректных строк: ${skipped}` : ""}`;
  if (!demo && !loading && skipped && failures.length)
    status.append(document.createTextNode(` Пропущено строк: ${skipped}.`));
  $("refresh-btn").disabled = loading;
  $("main").setAttribute("aria-busy", String(loading));
  $("connection-dot").dataset.state = failures.length
    ? failures.length === 3
      ? "error"
      : "warning"
    : "ready";
  $("connection-label").textContent = demo
    ? "Демонстрационный режим"
    : loading
      ? "Обновление данных"
      : failures.length
        ? "Проверьте источники"
        : "Источники подключены";
  const dates = Object.values(sources)
    .map((source) => source.updatedAt)
    .filter(Boolean)
    .sort();
  $("updated-at").textContent = demo
    ? "Пример данных · демонстрация"
    : dates.length
      ? `Обновление: ${new Intl.DateTimeFormat("ru-RU", { timeZone: config.timeZone, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(dates[0]))} · Актау`
      : "Данные ещё не загружены";
}

function renderChart(model) {
  const target = $("rating-chart");
  if (!model.reviewsReady || !model.trend.some((day) => day.count)) {
    target.replaceChildren(
      empty(
        model.reviewsReady
          ? "За эти 14 дней отзывов пока нет"
          : "График недоступен",
        "Новые оценки появятся здесь после обновления данных.",
      ),
    );
    return;
  }
  const ns = "http://www.w3.org/2000/svg";
  const svgNode = (tag, attributes, text) => {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes))
      node.setAttribute(key, String(value));
    if (text) node.textContent = text;
    return node;
  };
  const svg = svgNode("svg", {
    viewBox: "0 0 560 174",
    role: "img",
    "aria-label":
      "Средняя оценка по дням за 14 дней. Пустые дни не соединяются линией.",
  });
  svg.append(
    svgNode(
      "title",
      {},
      model.trend
        .map(
          (day) =>
            `${dateLabel(day.date)}: ${day.avg === null ? "нет отзывов" : decimal(day.avg)}`,
        )
        .join("; "),
    ),
  );
  for (const rating of [1, 2, 3, 4, 5]) {
    const y = 140 - (rating - 1) * 30;
    svg.append(
      svgNode("line", { x1: 28, x2: 546, y1: y, y2: y, class: "chart-grid" }),
    );
    svg.append(
      svgNode("text", { x: 7, y: y + 4, class: "chart-label" }, String(rating)),
    );
  }
  let path = "",
    connected = false;
  model.trend.forEach((day, index) => {
    const x = 28 + index * (518 / 13);
    if (day.avg !== null) {
      const y = 140 - (day.avg - 1) * 30;
      path += `${connected ? "L" : "M"}${x},${y} `;
      connected = true;
    } else connected = false;
    if ([0, 4, 9, 13].includes(index))
      svg.append(
        svgNode(
          "text",
          {
            x,
            y: 168,
            class: "chart-label",
            "text-anchor":
              index === 0 ? "start" : index === 13 ? "end" : "middle",
          },
          day.date.slice(5).split("-").reverse().join("."),
        ),
      );
  });
  svg.append(svgNode("path", { d: path, class: "chart-line" }));
  model.trend.forEach((day, index) => {
    if (day.avg === null) return;
    const dot = svgNode("circle", {
      cx: 28 + (index * 518) / 13,
      cy: 140 - (day.avg - 1) * 30,
      r: 3.3,
      class: "chart-point",
    });
    dot.append(
      svgNode(
        "title",
        {},
        `${dateLabel(day.date)} · ${decimal(day.avg)} · отзывов: ${day.count}`,
      ),
    );
    svg.append(dot);
  });
  target.replaceChildren(svg);
}

function renderDistribution(model) {
  $("distribution").replaceChildren(
    ...model.distribution.map((item) => {
      const fill = el("div", "distribution-fill");
      fill.style.width = `${model.count ? (item.count / model.count) * 100 : 0}%`;
      return el("div", "distribution-row", null, [
        el("span", "", `${item.star} ★`),
        el("div", "distribution-track", null, [fill]),
        el("b", "", model.reviewsReady ? integer(item.count) : "—"),
      ]);
    }),
  );
  const positive = model.distribution
    .filter((item) => item.star >= 4)
    .reduce((sum, item) => sum + item.count, 0);
  $("positive-note").textContent = model.count
    ? `${Math.round((positive / model.count) * 100)}% оценок — четыре и пять звёзд`
    : "Пока недостаточно данных";
}

function renderLeader(model, filters) {
  const card = $("leader-card");
  if (!model.best) {
    card.replaceChildren(
      empty(
        model.reviewsReady
          ? "Лидер пока не определён"
          : "Рейтинг сотрудников недоступен",
        "Для рейтинга нужны отзывы в выбранном периоде.",
      ),
    );
    return;
  }
  const best = model.best;
  const medal = el("span", "leader-medal", "✦");
  medal.setAttribute("aria-hidden", "true");
  card.replaceChildren(
    medal,
    el("div", "leader-copy", null, [
      el(
        "small",
        "",
        filters.name ? "ВЫБРАННЫЙ СОТРУДНИК" : "ЛИДЕР ВЫБРАННОГО ПЕРИОДА",
      ),
      el("h3", "", formatName(best.name)),
      el(
        "p",
        "",
        `${best.count} отзывов · по средней оценке, при равенстве — по числу отзывов`,
      ),
    ]),
    el("div", "leader-result", null, [
      el("strong", "", decimal(best.avg)),
      el("span", "", " ★"),
    ]),
  );
}

function renderTeam(model, filters, onSelect) {
  const focusName = document.activeElement?.dataset.employee;
  const nodes = model.team.map((member) => {
    const card = el(
      "button",
      `team-card reveal${filters.name === member.name ? " active-card" : ""}`,
    );
    card.type = "button";
    card.dataset.employee = member.name;
    card.setAttribute("aria-pressed", String(filters.name === member.name));
    card.addEventListener("click", () => onSelect(member.name));
    const info = el("div", "", null, [
      el("h3", "", formatName(member.name)),
      el(
        "small",
        "",
        `${model.reviewsReady ? member.count : "—"} отзывов · ${model.scansReady ? member.scans : "—"} сканов`,
      ),
    ]);
    const top = el("div", "team-card-top", null, [
      el("span", "team-avatar", formatName(member.name).charAt(0)),
      info,
    ]);
    const score = el("div", "team-card-rating", null, [
      el(
        "strong",
        "",
        model.reviewsReady && member.avg !== null ? decimal(member.avg) : "—",
      ),
      el("span", "", "из 5"),
    ]);
    if (member.negative && model.reviewsReady)
      score.append(el("small", "negative-tag", `Негатив: ${member.negative}`));
    const channels = el("div", "team-channels", null, [
      el("span", "", `2ГИС ${model.clicksReady ? member.clicks["2gis"] : "—"}`),
      el(
        "span",
        "",
        `Яндекс ${model.clicksReady ? member.clicks.yandex : "—"}`,
      ),
      el(
        "span",
        "",
        `Instagram ${model.clicksReady ? member.clicks.instagram : "—"}`,
      ),
    ]);
    card.append(top, score, channels);
    return card;
  });
  $("team-grid").replaceChildren(
    ...(nodes.length
      ? nodes
      : [
          empty(
            "Команда пока не отображается",
            "Нет данных за выбранный период или источники недоступны.",
          ),
        ]),
  );
  if (focusName)
    [...$("team-grid").children]
      .find((card) => card.dataset.employee === focusName)
      ?.focus({ preventScroll: true });
  $("reset-filter-btn").textContent = filters.name
    ? "Сбросить сотрудника ↗"
    : "Все сотрудники ↗";
}

export function renderFeed(model, filters, limit) {
  const nodes = model.feed.slice(0, limit).map((row) => {
    const item = el(
      "article",
      `review-item${row.rating <= 3 ? " is-negative" : ""}`,
    );
    const date = el("time", "review-date", dateLabel(row.date));
    date.dateTime = row.date;
    const meta = el("div", "review-meta", null, [
      el("h3", "review-name", formatName(row.name)),
      date,
    ]);
    item.append(
      el("span", "review-avatar", formatName(row.name).charAt(0)),
      meta,
      el("span", "review-rating", `${decimal(row.rating)} ★`),
      el(
        "p",
        "review-comment",
        row.comment || "Гость оставил оценку без комментария.",
      ),
    );
    return item;
  });
  $("reviews-feed").replaceChildren(
    ...(nodes.length
      ? nodes
      : [
          empty(
            model.reviewsReady
              ? "По этим условиям отзывов нет"
              : "Отзывы недоступны",
            model.reviewsReady
              ? "Попробуйте другой период, сотрудника или поисковый запрос."
              : "Обновите данные после восстановления доступа к источнику.",
          ),
        ]),
  );
  $("reviews-count").textContent = model.reviewsReady
    ? `Показано ${Math.min(limit, model.feed.length)} из ${model.feed.length}`
    : "Нет данных";
  $("load-more-btn").hidden = model.feed.length <= limit;
  $("negative-badge").textContent =
    model.negatives === null ? "—" : String(model.negatives);
  press("all-reviews-btn", !filters.negative);
  press("negative-filter-btn", filters.negative);
}

function renderPlatforms(model) {
  $("platform-stats-grid").replaceChildren(
    ...[
      ["2gis", "2ГИС", "↗"],
      ["yandex", "Яндекс", "Я"],
      ["instagram", "Instagram", "◎"],
    ].map(([id, title, icon]) => {
      const count =
        model.clicks?.filter((row) => row.platform === id).length ?? null;
      const fill = el("div");
      fill.style.width = `${model.clicks?.length ? (count / model.clicks.length) * 100 : 0}%`;
      return el("article", "platform-card reveal", null, [
        el("div", "platform-top", null, [
          el("span", "platform-icon", icon),
          el("h3", "", title),
          el("span", "", count === null ? "—" : integer(count)),
        ]),
        el(
          "p",
          "",
          count === null
            ? "Источник переходов недоступен"
            : `${model.clicks.length ? Math.round((count / model.clicks.length) * 100) : 0}% переходов в выбранном срезе`,
        ),
        el("div", "channel-track", null, [fill]),
      ]);
    }),
  );
}

export function renderDashboard(model, filters, limit, onSelect) {
  countTo($("stat-avg-rating"), model.avg, decimal);
  countTo($("stat-total-reviews"), model.count, integer);
  countTo($("negative-count"), model.negatives, integer);
  countTo($("scan-count"), model.scans, integer);
  countTo($("conversion"), model.conversion, (number) => `${decimal(number)}%`);
  countTo($("week-rating"), model.weekAvg, (number) => `${decimal(number)} ★`);
  $("week-delta").textContent =
    model.delta === null
      ? "Нет сравнения"
      : `${model.delta >= 0 ? "+" : "−"}${decimal(Math.abs(model.delta))}`;
  $("week-delta").title =
    "Среднее за последние 7 дней минус среднее за предыдущие 7 дней. Оба интервала ограничены выбранным периодом.";
  $("scope-note").textContent =
    `${filters.name ? formatName(filters.name) : "Все сотрудники"} · ${filters.month === "all" ? "всё время" : monthLabel(filters.month)}`;
  $("rating-caption").textContent = filters.name
    ? `Рейтинг сотрудника · ${formatName(filters.name)}`
    : "Впечатления гостей в цифрах";
  $("chart-caption").textContent =
    `14 дней по ${dateLabel(model.end)} · пропуски означают отсутствие отзывов`;
  $("conversion").title =
    "Отзывы / QR-сканы × 100%. Это соотношение событий, а не отслеживание конкретных гостей; может превышать 100%.";
  const select = $("month-select");
  const months = [
    ...new Set([
      ...model.months,
      ...(filters.month === "all" ? [] : [filters.month]),
    ]),
  ]
    .sort()
    .reverse();
  const existing = [...select.options]
    .slice(1)
    .map((option) => option.value)
    .join(",");
  if (existing !== months.join(",")) {
    const all = el("option", "", "Всё время");
    all.value = "all";
    select.replaceChildren(
      all,
      ...months.map((month) => {
        const option = el("option", "", monthLabel(month));
        option.value = month;
        return option;
      }),
    );
  }
  select.value = filters.month;
  renderChart(model);
  renderDistribution(model);
  renderLeader(model, filters);
  renderTeam(model, filters, onSelect);
  renderFeed(model, filters, limit);
  renderPlatforms(model);
  reveal();
}
