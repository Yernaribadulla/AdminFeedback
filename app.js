/* ============================================================
   ШТИЛЬ · AdminFeedBack — Дашборд команды
   ============================================================ */

const sheetId = '1ZS1EXykP93modWYpw0_6CXXpk3NIe7e9-VkTSdSFZVE';

const REVIEWS_URL =
  `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=0`;

const SCANS_URL =
  `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=917011252`;

const PLATFORM_CLICKS_URL =
  `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=PlatformClicks`;

const monthNames = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const fallbackData = [
  { date: '2026-07-20', barista: 'dias', rating: 5, comment: 'Отличный кофе и сервис!' },
  { date: '2026-07-21', barista: 'islam', rating: 4, comment: 'Всё круто, но долго делали' },
  { date: '2026-07-22', barista: 'baha', rating: 5, comment: 'Лучший раф в городе' },
  { date: '2026-07-22', barista: 'dias', rating: 2, comment: 'Холодный кофе' },
  { date: '2026-07-23', barista: 'dias', rating: 5, comment: 'Супер!' }
];

/* ============================================================
   STATE
   ============================================================ */

let allRows = [];
let allVisits = [];
let allPlatformClicks = [];

let totalScansCount = 0;
let selectedBarista = null;
let onlyNegative = false;
let selectedMonthKey = 'all';
let selectedPlatform = 'all';

/* ============================================================
   HELPERS
   ============================================================ */

function clampRating(value) {
  value = Number(value);
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(5, value));
}

function parseGvizResponse(text) {
  const match = text.match(/setResponse\(([\s\S]*)\);?\s*$/);
  if (!match) throw new Error('Некорректный ответ Google Sheets');
  return JSON.parse(match[1]);
}

function parseRatingValue(value) {
  if (value == null) return 0;

  if (typeof value === 'number') {
    return clampRating(value);
  }

  const str = String(value).trim();
  if (!str) return 0;

  const bracket = str.match(/\((\d+)\/5\)/);
  if (bracket) return clampRating(bracket[1]);

  const stars = (str.match(/⭐/g) || []).length;
  if (stars) return clampRating(stars);

  const number = str.match(/\d+(\.\d+)?/);
  return number ? clampRating(number[0]) : 0;
}

function parseDateSafe(value) {
  if (!value) return new Date();

  const str = String(value).trim();

  const gviz = str.match(
    /^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)?/
  );

  if (gviz) {
    return new Date(
      +gviz[1],
      +gviz[2],
      +gviz[3],
      +(gviz[4] || 0),
      +(gviz[5] || 0),
      +(gviz[6] || 0)
    );
  }

  const dotted = str.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:,?\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
  );

  if (dotted) {
    return new Date(
      +dotted[3],
      +dotted[2] - 1,
      +dotted[1],
      +(dotted[4] || 0),
      +(dotted[5] || 0),
      +(dotted[6] || 0)
    );
  }

  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function buildRow(date, barista, rating, comment) {
  const dateObj = parseDateSafe(date);
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth() + 1;

  return {
    dateObj,
    monthKey: `${year}-${String(month).padStart(2, '0')}`,
    dateLabel: dateObj.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }),
    barista: String(barista).trim(),
    rating: clampRating(rating),
    comment: String(comment || '')
  };
}

function pluralizeReviews(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;

  if (mod10 === 1 && mod100 !== 11) return 'отзыв';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) {
    return 'отзыва';
  }

  return 'отзывов';
}

function pluralizeScans(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;

  if (mod10 === 1 && mod100 !== 11) return 'скан';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) {
    return 'скана';
  }

  return 'сканов';
}

function daysBetween(a, b) {
  const day = date =>
    new Date(a.getFullYear(), a.getMonth(), a.getDate());

  const startA = new Date(
    a.getFullYear(),
    a.getMonth(),
    a.getDate()
  );

  const startB = new Date(
    b.getFullYear(),
    b.getMonth(),
    b.getDate()
  );

  return Math.round((startA - startB) / 86400000);
}

function formatName(name) {
  return String(name || '')
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/(^|\s|-)(\S)/g, (_, prefix, char) =>
      prefix + char.toLocaleUpperCase('ru-RU')
    );
}

/* ============================================================
   REVIEWS
   ============================================================ */

function extractRows(json) {
  return (json.table?.rows || [])
    .map(row => {
      if (!row.c) return null;

      const cells = row.c;

      const rawDate = cells[0]?.v ?? cells[0]?.f;
      const barista = cells[1]?.v ?? '';

      const rawRating =
        cells[2]?.v !== null && cells[2]?.v !== undefined
          ? cells[2].v
          : cells[2]?.f;

      const comment = cells[3]?.v ?? '';
      const rating = parseRatingValue(rawRating);

      if (!barista || !rating) return null;

      return buildRow(rawDate, barista, rating, comment);
    })
    .filter(Boolean);
}

/* ============================================================
   LOAD DATA
   ============================================================ */

async function fetchData() {
  const proxy =
    `https://api.allorigins.win/raw?url=${encodeURIComponent(REVIEWS_URL)}`;

  try {
    console.log('🔄 Загрузка отзывов...');

    let response = await fetch(REVIEWS_URL);

    if (!response.ok) {
      response = await fetch(proxy);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const rows = extractRows(
      parseGvizResponse(await response.text())
    );

    if (!rows.length) {
      throw new Error('Таблица пуста или нет валидных оценок');
    }

    allRows = rows;
    console.log('✅ Загружено отзывов:', rows.length);

  } catch (error) {
    console.error('❌ Ошибка отзывов:', error);

    allRows = fallbackData.map(row =>
      buildRow(row.date, row.barista, row.rating, row.comment)
    );
  }

  await Promise.all([
    loadScansData(),
    loadPlatformClicksData()
  ]);

  populateMonthSelect();
  renderDashboard();
}

async function loadScansData() {
  try {
    const response = await fetch(SCANS_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const json = parseGvizResponse(await response.text());

    allVisits = (json.table?.rows || [])
      .map(row => {
        const rawDate = row.c?.[0]?.v ?? row.c?.[0]?.f;
        const rawBarista = row.c?.[1]?.v ?? row.c?.[1]?.f;

        if (!rawDate || !rawBarista) return null;

        const dateObj = parseDateSafe(rawDate);

        return {
          dateObj,
          monthKey:
            `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`,
          barista: String(rawBarista).trim().toLowerCase()
        };
      })
      .filter(Boolean);

    totalScansCount = allVisits.length;

    console.log('Visits:', allVisits);

  } catch (error) {
    console.error('❌ Ошибка Visits:', error);
    allVisits = [];
    totalScansCount = 0;
  }
}

async function loadPlatformClicksData() {
  try {
    const response = await fetch(PLATFORM_CLICKS_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const json = parseGvizResponse(await response.text());

    allPlatformClicks = (json.table?.rows || [])
      .map(row => {
        const rawDate = row.c?.[0]?.v ?? row.c?.[0]?.f;
        const rawBarista = row.c?.[1]?.v ?? row.c?.[1]?.f;
        const rawPlatform = row.c?.[2]?.v ?? row.c?.[2]?.f;

        if (!rawDate || !rawBarista || !rawPlatform) return null;

        const barista = String(rawBarista).trim().toLowerCase();
        const platform = String(rawPlatform).trim().toLowerCase();

        if (
          barista === 'unknown' ||
          !['2gis', 'yandex', 'instagram'].includes(platform)
        ) {
          return null;
        }

        const dateObj = parseDateSafe(rawDate);

        return {
          dateObj,
          monthKey:
            `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`,
          barista,
          platform
        };
      })
      .filter(Boolean);

    console.log('✅ PlatformClicks:', allPlatformClicks);

  } catch (error) {
    console.error('❌ Ошибка PlatformClicks:', error);
    allPlatformClicks = [];
  }
}

/* ============================================================
   FILTERS / STATS
   ============================================================ */

function getMonthRows() {
  return selectedMonthKey === 'all'
    ? allRows
    : allRows.filter(row => row.monthKey === selectedMonthKey);
}

function getDisplayRows() {
  return getMonthRows().filter(row => {
    if (selectedBarista && row.barista !== selectedBarista) {
      return false;
    }

    if (onlyNegative && row.rating > 3) {
      return false;
    }

    return true;
  });
}

function computeStats(rows) {
  const totalReviews = rows.length;

  const avgRating = totalReviews
    ? rows.reduce((sum, row) => sum + row.rating, 0) / totalReviews
    : 0;

  const grouped = {};

  rows.forEach(row => {
    if (!grouped[row.barista]) {
      grouped[row.barista] = {
        count: 0,
        total: 0
      };
    }

    grouped[row.barista].count++;
    grouped[row.barista].total += row.rating;
  });

  const team = Object.entries(grouped)
    .map(([name, data]) => {
      const scans = allVisits.filter(scan => {
        const sameBarista =
          scan.barista === name.toLowerCase();

        const sameMonth =
          selectedMonthKey === 'all' ||
          scan.monthKey === selectedMonthKey;

        return sameBarista && sameMonth;
      }).length;

      return {
        name,
        count: data.count,
        scans,
        avg: data.count ? data.total / data.count : 0
      };
    })
    .sort((a, b) =>
      b.avg - a.avg || b.scans - a.scans
    );

  return {
    totalReviews,
    avgRating,
    team,
    best: team[0] || null
  };
}

function selectBarista(name) {
  selectedBarista =
    selectedBarista === name ? null : name;

  renderDashboard();
}

/* ============================================================
   EXECUTIVE SNAPSHOT
   ============================================================ */

function renderExecutiveSnapshot(monthRows) {
  const now = new Date();

  const todayNegatives = allRows.filter(row => {
    const d = row.dateObj;

    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate() &&
      row.rating <= 3
    );
  }).length;

  const negCard =
    document.getElementById('snapshot-negative-today');

  const negTitle =
    document.getElementById('snapshot-negative-title');

  if (negCard && negTitle) {
    const alert = todayNegatives > 0;

    negCard.classList.toggle('is-alert', alert);
    negCard.classList.toggle('is-clear', !alert);

    negTitle.textContent = alert
      ? `${todayNegatives} ${pluralizeReviews(todayNegatives)}`
      : 'Нет замечаний';
  }

  const referenceDate = monthRows.length
    ? monthRows.reduce(
        (latest, row) =>
          row.dateObj > latest ? row.dateObj : latest,
        monthRows[0].dateObj
      )
    : now;

  const last7Rows = monthRows.filter(row => {
    const days = daysBetween(referenceDate, row.dateObj);
    return days >= 0 && days <= 6;
  });

  const prev7Rows = monthRows.filter(row => {
    const days = daysBetween(referenceDate, row.dateObj);
    return days >= 7 && days <= 13;
  });

  const weekStats = computeStats(last7Rows);

  const weekRating =
    document.getElementById('snapshot-week-rating');

  if (weekRating) {
    weekRating.textContent =
      weekStats.totalReviews
        ? `${weekStats.avgRating.toFixed(1)} ★`
        : '—';
  }

  const weekLeader =
    document.getElementById('snapshot-week-leader');

  if (weekLeader) {
    weekLeader.textContent = weekStats.best
      ? `${formatName(weekStats.best.name)} · ${weekStats.best.avg.toFixed(1)}`
      : 'Нет данных';
  }

  const currentTeam = computeStats(last7Rows).team;
  const previousTeam = computeStats(prev7Rows).team;

  let worstDrop = null;

  currentTeam.forEach(member => {
    const previous = previousTeam.find(
      item => item.name === member.name
    );

    if (!previous || !member.count || !previous.count) return;

    const drop = previous.avg - member.avg;

    if (
      drop > 0.01 &&
      (!worstDrop || drop > worstDrop.drop)
    ) {
      worstDrop = {
        name: member.name,
        drop
      };
    }
  });

  const trendCard =
    document.getElementById('snapshot-trend');

  const trendIcon =
    document.getElementById('snapshot-trend-icon');

  const trendTitle =
    document.getElementById('snapshot-trend-title');

  if (trendCard && trendTitle) {
    const alert = Boolean(worstDrop);

    trendCard.classList.toggle('is-alert', alert);
    trendCard.classList.toggle('is-stable', !alert);

    if (trendIcon) {
      trendIcon.textContent = alert ? '⚠️' : '✓';
    }

    trendTitle.textContent = alert
      ? `Рейтинг ${formatName(worstDrop.name)} падает`
      : 'Все стабильно';
  }
}

/* ============================================================
   HEADER
   ============================================================ */

function populateMonthSelect() {
  const select = document.getElementById('month-select');
  if (!select) return;

  const keys = [
    ...new Set(
      allRows
        .map(row => row.monthKey)
        .filter(Boolean)
    )
  ].sort();

  select.innerHTML = '<option value="all">Все время</option>';

  keys.forEach(key => {
    const [year, month] = key.split('-').map(Number);

    const option = document.createElement('option');

    option.value = key;
    option.textContent =
      `${monthNames[month - 1]} ${year}`;

    select.appendChild(option);
  });

  if (!keys.includes(selectedMonthKey)) {
    selectedMonthKey = 'all';
  }

  select.value = selectedMonthKey;
}

function renderHeaderStats(displayRows) {
  const stats = computeStats(displayRows);

  const total = document.getElementById('stat-total-reviews');
  const avg = document.getElementById('stat-avg-rating');

  const totalLabel =
    document.getElementById('stat-total-label');

  const avgLabel =
    document.getElementById('stat-avg-label');

  if (total) {
    total.textContent = stats.totalReviews;
  }

  if (avg) {
    avg.textContent =
      stats.avgRating
        ? stats.avgRating.toFixed(1)
        : '0.0';
  }

  const scope = [];

  if (selectedMonthKey !== 'all') {
    const [year, month] =
      selectedMonthKey.split('-').map(Number);

    scope.push(`${monthNames[month - 1]} ${year}`);
  }

  if (selectedBarista) {
    scope.push(formatName(selectedBarista));
  }

  if (onlyNegative) {
    scope.push('негативные');
  }

  if (totalLabel) {
    totalLabel.textContent =
      scope.length
        ? `Отзывов · ${scope.join(', ')}`
        : 'Всего отзывов';
  }

  if (avgLabel) {
    avgLabel.textContent =
      scope.length
        ? `Средний балл · ${scope.join(', ')}`
        : 'Средний балл';
  }

  const conversion =
    document.getElementById('snapshot-conversion');

  if (!conversion) return;

  const scans = allVisits.filter(scan =>
    selectedMonthKey === 'all' ||
    scan.monthKey === selectedMonthKey
  ).length;

  const reviews = getMonthRows().length;

  conversion.textContent =
    scans
      ? `${((reviews / scans) * 100).toFixed(1)}%`
      : '—';

  const card = conversion.closest('.snapshot-card');

  if (card) {
    card.dataset.tooltip =
      `Отзывов: ${reviews} · Сканов: ${scans} · Конверсия QR за выбранный период`;
  }
}

/* ============================================================
   BEST EMPLOYEE
   ============================================================ */

function renderBestEmployee(monthRows) {
  const stats = computeStats(monthRows);

  const name = document.getElementById('best-name');
  const score = document.getElementById('best-score');

  if (!name) return;

  if (!stats.best) {
    name.textContent = 'Нет данных за этот период';

    if (score) score.textContent = '';

    return;
  }

  name.textContent = formatName(stats.best.name);

  if (score) {
    score.textContent =
      `${stats.best.avg.toFixed(1)} из 5 · ` +
      `${stats.best.count} ${pluralizeReviews(stats.best.count)}`;
  }
}

/* ============================================================
   TEAM
   ============================================================ */

function renderTeamGrid(monthRows) {
  const grid = document.getElementById('team-grid');
  if (!grid) return;

  const stats = computeStats(monthRows);

  grid.innerHTML = '';

  stats.team.forEach(member => {
    const clicks = allPlatformClicks.filter(click => {
      const sameBarista =
        click.barista === member.name.toLowerCase();

      const sameMonth =
        selectedMonthKey === 'all' ||
        click.monthKey === selectedMonthKey;

      return sameBarista && sameMonth;
    });

    const clicks2gis =
      clicks.filter(c => c.platform === '2gis').length;

    const clicksYandex =
      clicks.filter(c => c.platform === 'yandex').length;

    const clicksInstagram =
      clicks.filter(c => c.platform === 'instagram').length;

    const hasNegative = monthRows.some(
      row =>
        row.barista === member.name &&
        row.rating <= 3
    );

    const card = document.createElement('button');

    card.type = 'button';

    card.className =
      'team-card' +
      (selectedBarista === member.name
        ? ' active-card'
        : '') +
      (hasNegative
        ? ' has-negative'
        : '');

    card.onclick = () =>
      selectBarista(member.name);

    card.innerHTML = `
      <div class="team-platforms-row">
        <span class="platform-chip chip-2gis">
          2ГИС <b>${clicks2gis}</b>
        </span>

        <span class="platform-chip chip-yandex">
          Яндекс <b>${clicksYandex}</b>
        </span>

        <span class="platform-chip chip-insta">
          Inst <b>${clicksInstagram}</b>
        </span>
      </div>

      <div class="team-card-header">
        <div class="team-avatar">
          ${formatName(member.name).charAt(0)}
        </div>

        <div class="team-user-info">
          <div class="team-name">
            ${formatName(member.name)}
          </div>

          <div class="team-count">
            ${member.count}
            ${pluralizeReviews(member.count)}
            ·
            ${member.scans}
            ${pluralizeScans(member.scans)}
          </div>
        </div>
      </div>

      <div class="team-score-row">
        <span class="team-score-value">
          ${member.avg.toFixed(1)}
        </span>

        <span class="team-score-max">
          из 5.0
        </span>
      </div>

      <div class="progress-track">
        <div
          class="progress-fill"
          style="width:${Math.min(member.avg / 5 * 100, 100)}%"
        ></div>
      </div>
    `;

    const conversion = member.scans
      ? ((member.count / member.scans) * 100).toFixed(1)
      : '—';

    card.dataset.tooltip =
      `Отзывы: ${member.count}\n` +
      `Сканов: ${member.scans}\n` +
      `Конверсия: ${conversion}%`;

    grid.appendChild(card);
  });
}

/* ============================================================
   PLATFORM STATS
   ============================================================ */

function renderPlatformStats() {
  const grid =
    document.getElementById('platform-stats-grid');

  if (!grid) return;

  const platforms = [
    { id: '2gis', name: '2ГИС', icon: '📍' },
    { id: 'yandex', name: 'Яндекс', icon: '🔴' },
    { id: 'instagram', name: 'Instagram', icon: '◎' }
  ];

  const filtered =
    selectedPlatform === 'all'
      ? allPlatformClicks
      : allPlatformClicks.filter(
          row => row.platform === selectedPlatform
        );

  grid.innerHTML = '';

  platforms.forEach(platform => {
    const clicks = filtered.filter(
      row => row.platform === platform.id
    );

    const counts = {};

    clicks.forEach(row => {
      const name = String(row.barista || '').trim();

      if (name && name !== 'unknown') {
        counts[name] = (counts[name] || 0) + 1;
      }
    });

    const baristas =
      Object.entries(counts)
        .sort((a, b) => b[1] - a[1]);

    const card = document.createElement('div');

    card.className = 'platform-stat-card';

    card.innerHTML = `
      <div class="platform-stat-header">
        <div class="platform-stat-icon">
          ${platform.icon}
        </div>

        <div class="platform-stat-info">
          <div class="platform-stat-name">
            ${platform.name}
          </div>

          <div class="platform-stat-total">
            ${clicks.length}
            ${clicks.length === 1 ? 'переход' : 'переходов'}
          </div>
        </div>
      </div>

      <div class="platform-stat-baristas">
        ${
          baristas.length
            ? baristas.map(([name, count]) => `
                <div class="platform-barista-row">
                  <span class="platform-barista-name">
                    ${formatName(name)}
                  </span>

                  <span class="platform-barista-count">
                    ${count}
                  </span>
                </div>
              `).join('')
            : `
              <div class="platform-empty">
                Нет данных
              </div>
            `
        }
      </div>
    `;

    grid.appendChild(card);
  });
}

/* ============================================================
   REVIEWS FEED
   ============================================================ */

function renderReviewsFeed(displayRows) {
  const feed =
    document.getElementById('reviews-feed');

  const title =
    document.getElementById('reviews-title');

  if (!feed) return;

  feed.innerHTML = '';

  const scope = [];

  if (selectedMonthKey !== 'all') {
    const [year, month] =
      selectedMonthKey.split('-').map(Number);

    scope.push(`${monthNames[month - 1]} ${year}`);
  }

  if (selectedBarista) {
    scope.push(formatName(selectedBarista));
  }

  if (onlyNegative) {
    scope.push('только негативные');
  }

  if (title) {
    title.textContent =
      scope.length
        ? `Отзывы · ${scope.join(', ')}`
        : 'Последние отзывы';
  }

  if (!displayRows.length) {
    feed.innerHTML =
      '<div class="state-placeholder">' +
      'По этому фильтру отзывов нет' +
      '</div>';

    return;
  }

  displayRows
    .slice()
    .sort((a, b) => b.dateObj - a.dateObj)
    .forEach(row => {
      const negative = row.rating <= 3;

      const item =
        document.createElement('div');

      item.className =
        'review-item' +
        (negative ? ' is-negative' : '');

      item.innerHTML = `
        <div class="review-meta">
          <span class="review-barista">
            ${formatName(row.barista)}
          </span>

          <span class="review-date">
            ${row.dateLabel}
          </span>

          <span class="review-rating ${
            negative ? 'is-negative' : ''
          }">
            ${row.rating.toFixed(1)} ★
          </span>
        </div>

        ${
          row.comment
            ? `<p class="review-comment">${row.comment}</p>`
            : ''
        }
      `;

      feed.appendChild(item);
    });
}

/* ============================================================
   FILTER BUTTONS
   ============================================================ */

function renderFilterButtons() {
  const reset =
    document.getElementById('reset-filter-btn');

  const negative =
    document.getElementById('negative-filter-btn');

  reset?.classList.toggle(
    'is-disabled',
    selectedBarista === null
  );

  negative?.classList.toggle(
    'is-active',
    onlyNegative
  );
}

/* ============================================================
   DASHBOARD
   ============================================================ */

function renderDashboard() {
  const monthRows = getMonthRows();
  const displayRows = getDisplayRows();

  renderExecutiveSnapshot(monthRows);
  renderBestEmployee(monthRows);
  renderTeamGrid(monthRows);
  renderHeaderStats(displayRows);
  renderReviewsFeed(displayRows);
  renderFilterButtons();
  renderPlatformStats();
}

/* ============================================================
   EVENTS
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  document
    .getElementById('reset-filter-btn')
    ?.addEventListener('click', () => {
      selectedBarista = null;
      renderDashboard();
    });

  document
    .getElementById('negative-filter-btn')
    ?.addEventListener('click', () => {
      onlyNegative = !onlyNegative;
      renderDashboard();
    });

  document
    .getElementById('month-select')
    ?.addEventListener('change', event => {
      selectedMonthKey = event.target.value;
      renderDashboard();
    });

  document
    .querySelectorAll('.platform-filter-btn')
    .forEach(button => {
      button.addEventListener('click', () => {
        selectedPlatform =
          button.dataset.platformFilter || 'all';

        document
          .querySelectorAll('.platform-filter-btn')
          .forEach(btn =>
            btn.classList.toggle(
              'is-active',
              btn === button
            )
          );

        renderPlatformStats();
      });
    });

  fetchData();
});
