/* ============================================================
   ШТИЛЬ · AdminFeedBack — Дашборд команды
   Источник данных: Google Sheets (GViz JSON)
   ============================================================ */

const sheetId = '1ZS1EXykP93modWYpw0_6CXXpk3NIe7e9-VkTSdSFZVE';

const REVIEWS_URL = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=0`;
// Лист «Visits» (сканы QR) — правильный gid из архитектуры проекта
const SCANS_URL = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=917011252`;

const monthNames = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

// Показывается только если запрос отзывов провалился — сеть недоступна и т.п.
const fallbackData = [
  { date: '2026-07-20', barista: 'dias', rating: 5, comment: 'Отличный кофе и сервис!' },
  { date: '2026-07-21', barista: 'islam', rating: 4, comment: 'Всё круто, но долго делали' },
  { date: '2026-07-22', barista: 'baha', rating: 5, comment: 'Лучший раф в городе' },
  { date: '2026-07-22', barista: 'dias', rating: 2, comment: 'Холодный кофе' },
  { date: '2026-07-23', barista: 'dias', rating: 5, comment: 'Супер!' }
];

/* ---------- Единое состояние дашборда ---------- */

let allRows = [];
let totalScansCount = 0;
let allVisits = [];

let selectedBarista = null;
let onlyNegative = false;
let selectedMonthKey = 'all';

/* ---------- Парсинг ответа Google Sheets ---------- */

function parseGvizResponse(text) {
  const match = text.match(/setResponse\(([\s\S]*)\);?\s*$/);
  if (!match) throw new Error('Некорректный ответ Google Sheets');
  return JSON.parse(match[1]);
}

/**
 * Надёжный парсер оценки. Формат из Apps Script:
 * "⭐ ⭐ ⭐ ⭐ ⭐ (5/5)" или "⭐ ⭐ ✰ ✰ ✰ (2/5)".
 * Порядок попыток:
 *   1) число уже пришло как чистое число (ручные правки в таблице),
 *   2) число в скобках "(N/5)" через регулярку \((\d+)\/5\) — основной, надёжный маркер,
 *   3) подсчёт закрашенных звёзд ⭐, если скобок вдруг нет,
 *   4) первое число в строке как последний фоллбэк.
 * Всегда строго кастуется в Number и ограничивается диапазоном 0–5.
 */
function parseRatingValue(rawValue) {
  if (rawValue === null || rawValue === undefined) return 0;

  if (typeof rawValue === 'number' && !Number.isNaN(rawValue)) {
    return clampRating(rawValue);
  }

  const str = String(rawValue).trim();
  if (!str) return 0;

  const bracketMatch = str.match(/\((\d+)\/5\)/);
  if (bracketMatch) {
    return clampRating(Number(bracketMatch[1]));
  }

  const filledStars = (str.match(/⭐/g) || []).length;
  if (filledStars > 0) {
    return clampRating(filledStars);
  }

  const digitMatch = str.match(/\d+(\.\d+)?/);
  if (digitMatch) {
    return clampRating(Number(digitMatch[0]));
  }

  return 0;
}

function clampRating(value) {
  if (Number.isNaN(value)) return 0;
  if (value > 5) return 5;
  if (value < 0) return 0;
  return value;
}

/**
 * Падение-устойчивый парсер даты. Поддерживает:
 * - объект gviz: Date(2026,6,19,1,8,32)
 * - "19.07.2026, 1:08:32" (с запятой перед временем — так пишет Apps Script)
 * - "19.07.2026 1:08:32" (без запятой)
 * - ISO-строки
 * Никогда не возвращает null — при полном провале отдаёт new Date().
 */
function parseDateSafe(rawValue) {
  if (!rawValue) return new Date();
  const value = String(rawValue).trim();

  const gvizMatch = /^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)?/.exec(value);
  if (gvizMatch) {
    return new Date(
      Number(gvizMatch[1]),
      Number(gvizMatch[2]),
      Number(gvizMatch[3]),
      Number(gvizMatch[4] || 0),
      Number(gvizMatch[5] || 0),
      Number(gvizMatch[6] || 0)
    );
  }

  const dottedMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:,?\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/.exec(value);
  if (dottedMatch) {
    return new Date(
      Number(dottedMatch[3]),
      Number(dottedMatch[2]) - 1,
      Number(dottedMatch[1]),
      Number(dottedMatch[4] || 0),
      Number(dottedMatch[5] || 0),
      Number(dottedMatch[6] || 0)
    );
  }

  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) ? parsed : new Date();
}

function buildRow(rawDate, barista, rating, comment) {
  const dateObj = parseDateSafe(rawDate);
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth() + 1;

  return {
    dateObj,
    monthKey: `${year}-${String(month).padStart(2, '0')}`,
    dateLabel: dateObj.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    barista: String(barista).trim(),
    rating: clampRating(Number(rating) || 0),
    comment: String(comment || '')
  };
}

/* ---------- Железобетонный парсер строк листа «Все отзывы» ---------- */

function extractRows(json) {
  const rows = json.table && json.table.rows ? json.table.rows : [];

  return rows
    .map((row) => {
      if (!row.c) return null;
      const cells = row.c;

      const rawDate = cells[0] ? (cells[0].v || cells[0].f) : null;
      const barista = cells[1] && cells[1].v !== null && cells[1].v !== undefined ? cells[1].v : '';

      // Оценка: сначала .v (обычно строка со звёздами), затем .f как фоллбэк
      let rawRating = null;
      if (cells[2]) {
        rawRating = cells[2].v !== null && cells[2].v !== undefined ? cells[2].v : cells[2].f;
      }
      const rating = parseRatingValue(rawRating);

      const comment = cells[3] && cells[3].v !== null && cells[3].v !== undefined ? cells[3].v : '';

      if (!barista) return null;
      return buildRow(rawDate, barista, rating, comment);
    })
    .filter((r) => r !== null && r.rating > 0);
}

/* ---------- Загрузка данных ---------- */

async function fetchData() {
  const directUrl = REVIEWS_URL;
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(REVIEWS_URL)}`;

  try {
    console.log('🔄 Загрузка отзывов...');
    let response = await fetch(directUrl);

    if (!response.ok) {
      response = await fetch(proxyUrl);
    }
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

    const text = await response.text();
    const json = parseGvizResponse(text);
    const rows = extractRows(json);

    if (!rows.length) throw new Error('Таблица пуста или все строки без валидной оценки');

    console.log('✅ Загружено отзывов:', rows.length);
    allRows = rows;
  } catch (error) {
    console.error('❌ Ошибка загрузки отзывов, включаем фоллбэк:', error);
    allRows = fallbackData.map((row) => buildRow(row.date, row.barista, row.rating, row.comment));
  }

  await loadScansData();
  populateMonthSelect();
  renderDashboard();
}

async function loadScansData() {
  try {
    const response = await fetch(SCANS_URL);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    const json = parseGvizResponse(text);

    const rows = json.table?.rows || [];

    allVisits = rows
      .map((row) => {
        if (!row.c) return null;

        const rawDate = row.c[0]?.v || row.c[0]?.f;
        const rawBarista = row.c[1]?.v || row.c[1]?.f;

        if (!rawDate || !rawBarista) return null;

        const dateObj = parseDateSafe(rawDate);

        if (!dateObj) return null;

        return {
          dateObj,
          monthKey: `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}`,
          barista: String(rawBarista).trim().toLowerCase()
        };
      })
      .filter(Boolean);

    totalScansCount = allVisits.length;

    console.log("Visits:", allVisits);
    console.log("Всего сканов:", totalScansCount);

  } catch (err) {
    console.error("Ошибка загрузки Visits:", err);

    allVisits = [];
    totalScansCount = 0;
  }
}

function pluralizeReviews(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'отзыв';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'отзыва';
  return 'отзывов';
}

function daysBetween(dateA, dateB) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const startOfA = new Date(dateA.getFullYear(), dateA.getMonth(), dateA.getDate());
  const startOfB = new Date(dateB.getFullYear(), dateB.getMonth(), dateB.getDate());
  return Math.round((startOfA - startOfB) / MS_PER_DAY);
}

/* ---------- Расчёт статистики ---------- */

function computeStats(rows) {
  const totalReviews = rows.length;
  const totalScore = rows.reduce((sum, row) => sum + (Number(row.rating) || 0), 0);
  const avgRating = totalReviews ? totalScore / totalReviews : 0;

  const grouped = {};

  rows.forEach((row) => {
    const key = row.barista.trim().toLowerCase();

    if (!grouped[key]) {
      grouped[key] = {
        name: row.barista,
        count: 0,
        total: 0,
        scans: 0
      };
    }

    grouped[key].count++;
    grouped[key].total += Number(row.rating) || 0;
  });

  const currentMonthVisits = allVisits.filter((visit) => {
    return (
      selectedMonthKey === "all" ||
      visit.monthKey === selectedMonthKey
    );
  });

  currentMonthVisits.forEach((visit) => {
    const key = visit.barista.trim().toLowerCase();

    if (grouped[key]) {
      grouped[key].scans++;
    }
  });

  const team = Object.values(grouped)
    .map((member) => ({
      name: member.name,
      count: member.count,
      scans: member.scans,
      avg: member.count ? member.total / member.count : 0
    }))
    .sort((a, b) => b.avg - a.avg);

  return {
    totalReviews,
    avgRating,
    team,
    best: team.length ? team[0] : null
  };
}

/* ---------- Фильтрация: месяц + бариста + негатив ---------- */

// Строки только с учётом выбранного месяца — база для команды/лучшего сотрудника/недели
function getMonthRows() {
  if (selectedMonthKey === 'all') return allRows;
  return allRows.filter((r) => r.monthKey === selectedMonthKey);
}

// Полная выборка: месяц + бариста + негатив — для шапки и ленты отзывов
function getDisplayRows() {
  return getMonthRows().filter((row) => {
    if (selectedBarista && row.barista !== selectedBarista) return false;
    if (onlyNegative && row.rating > 3) return false;
    return true;
  });
}

/* ---------- Executive Snapshot ---------- */

function renderExecutiveSnapshot(monthRows) {
  const now = new Date();

  // «Негатив за сегодня» — всегда про реальный текущий день, вне зависимости от фильтра месяца
  const todayNegatives = allRows.filter((r) => {
    const d = r.dateObj;
    return d.getFullYear() === now.getFullYear() &&
           d.getMonth() === now.getMonth() &&
           d.getDate() === now.getDate() &&
           r.rating <= 3;
  }).length;

  const negCard = document.getElementById('snapshot-negative-today');
  const negTitleEl = document.getElementById('snapshot-negative-title');
  if (negCard && negTitleEl) {
    negCard.classList.remove('is-clear', 'is-alert');
    if (todayNegatives > 0) {
      negCard.classList.add('is-alert');
      negTitleEl.textContent = `${todayNegatives} ${pluralizeReviews(todayNegatives)}`;
    } else {
      negCard.classList.add('is-clear');
      negTitleEl.textContent = 'Нет замечаний';
    }
  }

  // «Рейтинг за неделю» / «Лидер недели» — считаются внутри выбранного месяца,
  // с точкой отсчёта на самой свежей дате в этом срезе
  const referenceDate = monthRows.length
    ? monthRows.reduce((latest, r) => (r.dateObj > latest ? r.dateObj : latest), monthRows[0].dateObj)
    : now;

  const last7Rows = monthRows.filter((r) => daysBetween(referenceDate, r.dateObj) >= 0 && daysBetween(referenceDate, r.dateObj) <= 6);
  const prev7Rows = monthRows.filter((r) => daysBetween(referenceDate, r.dateObj) >= 7 && daysBetween(referenceDate, r.dateObj) <= 13);

  const weekStats = computeStats(last7Rows);

  const weekRatingEl = document.getElementById('snapshot-week-rating');
  if (weekRatingEl) {
    weekRatingEl.textContent = weekStats.totalReviews > 0 ? `${weekStats.avgRating.toFixed(1)} ★` : '—';
  }

  const weekLeaderEl = document.getElementById('snapshot-week-leader');
  if (weekLeaderEl) {
    weekLeaderEl.textContent = weekStats.best
      ? `${weekStats.best.name} · ${weekStats.best.avg.toFixed(1)}`
      : 'Нет данных';
  }

  // Тренд: у кого сильнее всего просел рейтинг по сравнению с предыдущей неделей
  const last7Team = computeStats(last7Rows).team;
  const prev7Team = computeStats(prev7Rows).team;

  let worstDrop = null;
  last7Team.forEach((member) => {
    const previous = prev7Team.find((m) => m.name === member.name);
    if (!previous || previous.count === 0 || member.count === 0) return;
    const drop = previous.avg - member.avg;
    if (drop > 0.01 && (!worstDrop || drop > worstDrop.drop)) {
      worstDrop = { name: member.name, drop };
    }
  });

  const trendCard = document.getElementById('snapshot-trend');
  const trendIcon = document.getElementById('snapshot-trend-icon');
  const trendTitleEl = document.getElementById('snapshot-trend-title');
  if (trendCard && trendTitleEl) {
    trendCard.classList.remove('is-stable', 'is-alert');
    if (worstDrop) {
      trendCard.classList.add('is-alert');
      if (trendIcon) trendIcon.textContent = '⚠️';
      trendTitleEl.textContent = `Рейтинг ${worstDrop.name} падает`;
    } else {
      trendCard.classList.add('is-stable');
      if (trendIcon) trendIcon.textContent = '✅';
      trendTitleEl.textContent = 'Все стабильно';
    }
  }
}

/* ---------- Заполнение селекта месяцев ---------- */

function populateMonthSelect() {
  const select = document.getElementById('month-select');
  if (!select) return;

  const previousValue = selectedMonthKey;
  const uniqueKeys = new Set(allRows.map((row) => row.monthKey).filter(Boolean));
  const sortedKeys = Array.from(uniqueKeys).sort();

  select.innerHTML = '<option value="all">Все время</option>';

  sortedKeys.forEach((key) => {
    const [year, month] = key.split('-').map(Number);
    const option = document.createElement('option');
    option.value = key;
    option.textContent = `${monthNames[month - 1]} ${year}`;
    select.appendChild(option);
  });

  select.value = sortedKeys.includes(previousValue) || previousValue === 'all' ? previousValue : 'all';
  selectedMonthKey = select.value;
}

/* ---------- Рендер: шапка + конверсия QR ---------- */

function renderHeaderStats(displayRows) {
  const stats = computeStats(displayRows);
  const totalEl = document.getElementById('stat-total-reviews');
  const avgEl = document.getElementById('stat-avg-rating');
  const totalLabel = document.getElementById('stat-total-label');
  const avgLabel = document.getElementById('stat-avg-label');

  if (totalEl) totalEl.textContent = String(stats.totalReviews);
  if (avgEl) avgEl.textContent = stats.avgRating > 0 ? stats.avgRating.toFixed(1) : '0.0';

  if (totalLabel && avgLabel) {
    const scopeParts = [];
    if (selectedMonthKey !== 'all') {
      const [year, month] = selectedMonthKey.split('-').map(Number);
      scopeParts.push(`${monthNames[month - 1]} ${year}`);
    }
    if (selectedBarista) scopeParts.push(selectedBarista);
    if (onlyNegative) scopeParts.push('негативные');

    totalLabel.textContent = scopeParts.length ? `Отзывов · ${scopeParts.join(', ')}` : 'Всего отзывов';
    avgLabel.textContent = scopeParts.length ? `Средний балл · ${scopeParts.join(', ')}` : 'Средний балл';
  }

  // Конверсия QR = (Всего отзывов / Всего сканов) * 100 — глобальная метрика кофейни,
  // не зависит от текущих фильтров, как и в бэкенде /doGet
  const conversionEl = document.getElementById('snapshot-conversion');
  if (conversionEl) {
    if (totalScansCount > 0) {
      const rate = ((allRows.length / totalScansCount) * 100).toFixed(1);
      conversionEl.textContent = `${rate}%`;
    } else {
      conversionEl.textContent = '—';
    }

    const conversionCard = conversionEl.closest('.snapshot-card');
    if (conversionCard) {
      conversionCard.setAttribute(
        'data-tooltip',
        `Отзывов: ${allRows.length} · Сканов: ${totalScansCount} · Соотношение оставленных отзывов к числу сканов QR-кода`
      );
    }
  }
}

/* ---------- Рендер: лучший сотрудник (по выбранному месяцу) ---------- */

function renderBestEmployee(monthRows) {
  const stats = computeStats(monthRows);

  const nameEl = document.getElementById('best-name');
  const scoreEl = document.getElementById('best-score');
  if (!nameEl) return;

  if (!stats.best) {
    nameEl.textContent = 'Нет данных за этот период';
    if (scoreEl) scoreEl.textContent = '';
    return;
  }

  nameEl.textContent = stats.best.name;
  if (scoreEl) {
    scoreEl.textContent = `${stats.best.avg.toFixed(1)} из 5 · ${stats.best.count} ${pluralizeReviews(stats.best.count)}`;
  }
}

/* ---------- Рендер: карточки команды (по выбранному месяцу) ---------- */

  // 1. Считаем сканы для каждого баристы за фильтруемый период
  // (берем из allVisits, отфильтрованного по текущему месяцу, если он есть)
  const currentMonthVisits = allVisits.filter((visit) => {
  return (
    selectedMonthKey === "all" ||
    visit.monthKey === selectedMonthKey
  );
});

  const visitsGrouped = {};
  currentMonthVisits.forEach(v => {
    const name = (v.barista || '').trim().toLowerCase();
    if (name) {
      visitsGrouped[name] = (visitsGrouped[name] || 0) + 1;
    }
  });

  const team = Array.from(staffNames)
    .map((name) => {
      const reviewCount = grouped[name] ? grouped[name].count : 0;
      const reviewTotal = grouped[name] ? grouped[name].total : 0;
      const scanCount = visitsGrouped[name.toLowerCase()] || 0;

      return {
        name,
        count: reviewCount,
        scans: scanCount,
        avg: reviewCount ? reviewTotal / reviewCount : 0
      };
    })
    .filter((member) => member.count > 0 || member.scans > 0) // Показываем тех, у кого есть либо отзывы, либо сканы
    .sort((a, b) => b.avg - a.avg || b.scans - a.scans);

  return { totalReviews, avgRating, team, best: team.length ? team[0] : null };


function pluralizeScans(n) {
  if (n % 10 === 1 && n % 100 !== 11) return 'скан';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'скана';
  return 'сканов';
}

function renderTeamGrid(monthRows) {
  const stats = computeStats(monthRows);
  const grid = document.getElementById('team-grid');
  if (!grid) return;
  grid.innerHTML = '';

  console.log(stats);

  stats.team.forEach((member) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'team-card' + (selectedBarista === member.name ? ' active-card' : '');
    card.onclick = () => selectBarista(member.name); // Важно для кликабельности

    card.innerHTML = `
      <div class="team-card-header">
        <div class="team-avatar">${member.name.charAt(0).toUpperCase()}</div>
        <div>
          <div class="team-name">${member.name}</div>
          <div class="team-count">
            ${member.count} ${pluralizeReviews(member.count)} · ${member.scans} ${pluralizeScans(member.scans)}
          </div>
        </div>
      </div>
      <div class="team-score-row">
        <span class="team-score-value">${member.avg ? member.avg.toFixed(1) : '0.0'}</span>
        <span class="team-score-max">из 5.0</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width: ${Math.min((member.avg / 5) * 100, 100)}%"></div>
      </div>
    `;

    grid.appendChild(card);
  });
}

/* ---------- Рендер: лента отзывов ---------- */

function renderReviewsFeed(displayRows) {
  const feed = document.getElementById('reviews-feed');
  const titleEl = document.getElementById('reviews-title');
  if (!feed) return;
  feed.innerHTML = '';

  if (titleEl) {
    const titleParts = [];
    if (selectedMonthKey !== 'all') {
      const [year, month] = selectedMonthKey.split('-').map(Number);
      titleParts.push(`${monthNames[month - 1]} ${year}`);
    }
    if (selectedBarista) titleParts.push(selectedBarista);
    if (onlyNegative) titleParts.push('только негативные');
    titleEl.textContent = titleParts.length ? `Отзывы · ${titleParts.join(', ')}` : 'Последние отзывы';
  }

  if (!displayRows.length) {
    feed.innerHTML = '<div class="state-placeholder">По этому фильтру отзывов нет</div>';
    return;
  }

  // Сортируем от новых к старым перед выводом
  displayRows.slice().sort((a, b) => b.dateObj - a.dateObj).forEach((row) => {
    const isNegative = row.rating <= 3;
    const item = document.createElement('div');
    item.className = 'review-item' + (isNegative ? ' is-negative' : '');

    item.innerHTML = `
      <div class="review-meta">
        <span class="review-barista">${row.barista}</span>
        <span class="review-date">${row.dateLabel}</span>
        <span class="review-rating ${isNegative ? 'is-negative' : ''}">${row.rating.toFixed(1)} ★</span>
      </div>
      ${row.comment ? `<p class="review-comment">${row.comment}</p>` : ''}
    `;

    feed.appendChild(item);
  });
}

/* ---------- Рендер: состояние кнопок фильтров ---------- */

function renderFilterButtons() {
  const resetBtn = document.getElementById('reset-filter-btn');
  if (resetBtn) resetBtn.classList.toggle('is-disabled', selectedBarista === null);

  const negativeBtn = document.getElementById('negative-filter-btn');
  if (negativeBtn) negativeBtn.classList.toggle('is-active', onlyNegative);
}

/* ---------- Главная функция рендера: единая точка входа ---------- */

function renderDashboard() {
  const monthRows = getMonthRows();
  const displayRows = getDisplayRows();

  renderExecutiveSnapshot(monthRows);
  renderBestEmployee(monthRows);
  renderTeamGrid(monthRows);
  renderHeaderStats(displayRows);
  renderReviewsFeed(displayRows);
  renderFilterButtons();
}

/* ---------- Инициализация ---------- */

document.addEventListener('DOMContentLoaded', () => {
  const resetBtn = document.getElementById('reset-filter-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      selectedBarista = null;
      renderDashboard();
    });
  }

  const negativeBtn = document.getElementById('negative-filter-btn');
  if (negativeBtn) {
    negativeBtn.addEventListener('click', () => {
      onlyNegative = !onlyNegative;
      renderDashboard();
    });
  }

  const monthSelect = document.getElementById('month-select');
  if (monthSelect) {
    monthSelect.addEventListener('change', (event) => {
      selectedMonthKey = event.target.value;
      renderDashboard();
    });
  }

  fetchData();
});
