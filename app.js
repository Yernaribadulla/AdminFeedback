const sheetId = '1ZS1EXykP93modWYpw0_6CXXpk3NIe7e9-VkTSdSFZVE';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`;

const monthNames = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const fallbackData = [
  { date: '14.07.2026 9:32:10', barista: 'Ислам', rating: 5, comment: 'Очень тепло встретил, кофе идеальный.' },
  { date: '2026-07-13T18:04:00', barista: 'Диас', rating: 4, comment: 'Быстро и вкусно, но было многолюдно.' },
  { date: '12.07.2026 8:15:47', barista: 'Баха', rating: 5, comment: 'Лучший раф на пирсе, спасибо!' },
  { date: '2026-07-11T11:20:33', barista: 'Ислам', rating: 5, comment: 'Приятная атмосфера и внимательный сервис.' },
  { date: '10.07.2026 19:41:02', barista: 'Диас', rating: 5, comment: 'Отличная подача, красиво оформили латте-арт.' },
  { date: '2026-07-09T07:58:19', barista: 'Баха', rating: 2, comment: 'Ждали заказ почти двадцать минут.' },
  { date: '08.07.2026 12:03:55', barista: 'Ислам', rating: 4, comment: 'Хороший кофе, немного шумно у пирса.' },
  { date: '2026-07-07T16:44:10', barista: 'Диас', rating: 5, comment: 'Порекомендовал напиток по вкусу — попал в точку.' },
  { date: '06.07.2026 9:29:00', barista: 'Баха', rating: 5, comment: 'Очень дружелюбно и профессионально.' },
  { date: '2026-07-05T14:12:47', barista: 'Ислам', rating: 3, comment: 'Кофе остыл, пока несли к столику.' },
  { date: '04.06.2026 10:05:22', barista: 'Диас', rating: 2, comment: 'Перепутали заказ, пришлось ждать замену.' },
  { date: '2026-06-28T09:17:41', barista: 'Баха', rating: 5, comment: 'Прекрасный сервис, как всегда.' },
  { date: '20.06.2026 17:50:03', barista: 'Ислам', rating: 5, comment: 'Спасибо за рекомендацию по вкусу!' },
  { date: '2026-06-15T13:33:29', barista: 'Диас', rating: 1, comment: 'Грубо ответил на просьбу пересчитать.' },
  { date: '10.06.2026 8:47:15', barista: 'Баха', rating: 4, comment: 'Всё хорошо, чуть медленно в час пик.' }
];

// Все загруженные отзывы храним в памяти — фильтруем без повторных запросов к сети
let allRows = [];

// Состояния фильтров
let selectedBarista = null;
let onlyNegative = false;
let selectedMonthKey = 'all';

function parseGvizResponse(text) {
  const match = text.match(/setResponse\(([\s\S]*)\);?\s*$/);
  if (!match) {
    throw new Error('Не удалось распознать ответ Google Sheets');
  }
  return JSON.parse(match[1]);
}

/**
 * Надёжно разбирает дату из Google Sheets в разных форматах:
 * - объект gviz: Date(2026,6,19,...)
 * - "19.07.2026 0:01:35" (день.месяц.год + время)
 * - "2026-07-19T00:01:35" (ISO + время)
 * Игнорирует время, возвращает { year, month, day } с месяцем 1–12,
 * либо null, если строку разобрать не удалось.
 */
function parseDateSafe(rawValue) {
  if (!rawValue) return null;
  const value = String(rawValue).trim();

  const gvizMatch = /^Date\((\d+),(\d+),(\d+)/.exec(value);
  if (gvizMatch) {
    return {
      year: Number(gvizMatch[1]),
      month: Number(gvizMatch[2]) + 1,
      day: Number(gvizMatch[3])
    };
  }

  const dottedMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(value);
  if (dottedMatch) {
    return {
      year: Number(dottedMatch[3]),
      month: Number(dottedMatch[2]),
      day: Number(dottedMatch[1])
    };
  }

  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value);
  if (isoMatch) {
    return {
      year: Number(isoMatch[1]),
      month: Number(isoMatch[2]),
      day: Number(isoMatch[3])
    };
  }

  const fallbackParsed = new Date(value);
  if (!Number.isNaN(fallbackParsed.getTime())) {
    return {
      year: fallbackParsed.getFullYear(),
      month: fallbackParsed.getMonth() + 1,
      day: fallbackParsed.getDate()
    };
  }

  return null;
}

function monthKeyOf(dateParts) {
  if (!dateParts) return null;
  return `${dateParts.year}-${String(dateParts.month).padStart(2, '0')}`;
}

function formatDateParts(dateParts) {
  if (!dateParts) return '';
  const d = new Date(dateParts.year, dateParts.month - 1, dateParts.day);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function extractRows(json) {
  const rows = json.table && json.table.rows ? json.table.rows : [];
  return rows
    .map((row) => {
      const cells = row.c || [];
      
      // 1. Парсим дату: если есть форматированная строка (.f), берем её, иначе сырое значение (.v)
      let rawDate = null;
      if (cells[0]) {
        rawDate = cells[0].f ? cells[0].f : cells[0].v;
      }
      
      const barista = cells[1] && cells[1].v ? String(cells[1].v).trim() : 'Неизвестно';
      
      // 2. Умный парсер оценки: чистим звезды и скобки вроде (2/5)
      let rating = 0;
      if (cells[2] && cells[2].v !== null && cells[2].v !== undefined) {
        const rawRating = String(cells[2].v);
        // Ищем цифру в скобках типа (5/5) или просто первую цифру в строке
        const ratingMatch = rawRating.match(/\((\d)\/\d\)/) || rawRating.match(/\d/);
        rating = ratingMatch ? Number(ratingMatch[1] || ratingMatch[0]) : 0;
      }
      
      const comment = cells[3] && cells[3].v ? String(cells[3].v) : '';
      
      return buildRow(rawDate, barista, rating, comment);
    })
    .filter((row) => row.rating > 0);
}

function buildRow(rawDate, barista, rating, comment) {
  const dateParts = parseDateSafe(rawDate);
  return {
    dateParts,
    monthKey: monthKeyOf(dateParts),
    dateLabel: formatDateParts(dateParts),
    barista,
    rating,
    comment
  };
}

async function fetchData() {
  try {
    const response = await fetch(SHEET_URL);
    if (!response.ok) throw new Error('Сеть недоступна');
    const text = await response.text();
    const json = parseGvizResponse(text);
    const rows = extractRows(json);
    if (!rows.length) throw new Error('Таблица пуста');
    allRows = rows;
  } catch (error) {
    console.warn('Не удалось загрузить данные из Google Sheets, используются тестовые данные.', error);
    allRows = fallbackData.map((row) => buildRow(row.date, row.barista, row.rating, row.comment));
  }
  populateMonthSelect();
  renderDashboard();
}

function pluralizeReviews(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'отзыв';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'отзыва';
  return 'отзывов';
}

function computeStats(rows) {
  const totalReviews = rows.length;
  const totalScore = rows.reduce((sum, row) => sum + row.rating, 0);
  const avgRating = totalReviews ? totalScore / totalReviews : 0;

  // Список сотрудников собирается динамически, без хардкода имён
  const staffNames = new Set(rows.map((row) => row.barista));

  const grouped = {};
  staffNames.forEach((name) => { grouped[name] = { count: 0, total: 0 }; });
  rows.forEach((row) => {
    grouped[row.barista].count += 1;
    grouped[row.barista].total += row.rating;
  });

  const team = Array.from(staffNames)
    .map((name) => ({
      name,
      count: grouped[name].count,
      avg: grouped[name].count ? grouped[name].total / grouped[name].count : 0
    }))
    .filter((member) => member.count > 0)
    .sort((a, b) => b.avg - a.avg);

  const best = team.length ? team[0] : null;

  return { totalReviews, avgRating, team, best };
}

/* ---------- Заполнение селекта месяцев ---------- */

function populateMonthSelect() {
  const select = document.getElementById('month-select');
  const previousValue = select.value || 'all';

  const uniqueKeys = new Set(
    allRows.map((row) => row.monthKey).filter(Boolean)
  );

  const sortedKeys = Array.from(uniqueKeys).sort();

  select.innerHTML = '';

  const allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.textContent = 'Все время';
  select.appendChild(allOption);

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

/* ---------- Комбинированная фильтрация в памяти ---------- */

function getDisplayRows() {
  return allRows.filter((row) => {
    if (selectedBarista && row.barista !== selectedBarista) return false;
    if (onlyNegative && row.rating > 3) return false;
    return true;
  });
}

function getMonthRows(monthKey) {
  if (monthKey === 'all') return allRows;
  return allRows.filter((row) => row.monthKey === monthKey);
}

/* ---------- Рендер отдельных блоков ---------- */

function renderHeaderStats(filteredRows) {
  const stats = computeStats(filteredRows);
  document.getElementById('stat-total-reviews').textContent = String(stats.totalReviews);
  document.getElementById('stat-avg-rating').textContent = stats.avgRating.toFixed(1);

  const totalLabel = document.getElementById('stat-total-label');
  const avgLabel = document.getElementById('stat-avg-label');

  const scopeParts = [];
  if (selectedBarista) scopeParts.push(selectedBarista);
  if (onlyNegative) scopeParts.push('негативные');
  const scopeSuffix = scopeParts.length ? ` · ${scopeParts.join(', ')}` : '';

  totalLabel.textContent = `Отзывов${scopeSuffix ? scopeSuffix : ''}`.trim();
  avgLabel.textContent = `Средний балл${scopeSuffix ? scopeSuffix : ''}`.trim();

  if (!selectedBarista && !onlyNegative) {
    totalLabel.textContent = 'Всего отзывов';
    avgLabel.textContent = 'Средний балл';
  }
}

function renderBestEmployee() {
  const monthRows = getMonthRows(selectedMonthKey);
  const stats = computeStats(monthRows);

  const nameEl = document.getElementById('best-name');
  const scoreEl = document.getElementById('best-score');

  if (!stats.best) {
    nameEl.textContent = 'Нет данных за этот период';
    scoreEl.textContent = '';
    return;
  }

  nameEl.textContent = stats.best.name;
  scoreEl.textContent = `${stats.best.avg.toFixed(1)} из 5 · ${stats.best.count} ${pluralizeReviews(stats.best.count)}`;
}

function renderTeamGrid() {
  const stats = computeStats(allRows);
  const grid = document.getElementById('team-grid');
  grid.innerHTML = '';

  if (!stats.team.length) {
    const placeholder = document.createElement('div');
    placeholder.className = 'state-placeholder';
    placeholder.textContent = 'Нет данных по команде';
    grid.appendChild(placeholder);
    return;
  }

  stats.team.forEach((member) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'team-card';
    if (selectedBarista === member.name) {
      card.classList.add('active-card');
    }

    const header = document.createElement('div');
    header.className = 'team-card-header';

    const avatar = document.createElement('div');
    avatar.className = 'team-avatar';
    avatar.textContent = member.name.charAt(0).toUpperCase();

    const nameBlock = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'team-name';
    name.textContent = member.name;

    const count = document.createElement('div');
    count.className = 'team-count';
    count.textContent = `${member.count} ${pluralizeReviews(member.count)}`;

    nameBlock.appendChild(name);
    nameBlock.appendChild(count);
    header.appendChild(avatar);
    header.appendChild(nameBlock);

    const scoreRow = document.createElement('div');
    scoreRow.className = 'team-score-row';

    const scoreValue = document.createElement('span');
    scoreValue.className = 'team-score-value';
    scoreValue.textContent = member.avg.toFixed(1);

    const scoreMax = document.createElement('span');
    scoreMax.className = 'team-score-max';
    scoreMax.textContent = 'из 5.0';

    scoreRow.appendChild(scoreValue);
    scoreRow.appendChild(scoreMax);

    const progressTrack = document.createElement('div');
    progressTrack.className = 'progress-track';

    const progressFill = document.createElement('div');
    progressFill.className = 'progress-fill';
    progressFill.style.width = `${Math.min((member.avg / 5) * 100, 100)}%`;

    progressTrack.appendChild(progressFill);

    card.appendChild(header);
    card.appendChild(scoreRow);
    card.appendChild(progressTrack);

    card.addEventListener('click', () => {
      selectedBarista = selectedBarista === member.name ? null : member.name;
      renderDashboard();
    });

    grid.appendChild(card);
  });
}

/* ---------- Лента отзывов с эффектом "тумана" ---------- */

function getStaggerDelay(index) {
  const SLOW_STEP = 100;
  const FAST_STEP = 18;
  const SLOW_COUNT = 6;

  if (index < SLOW_COUNT) {
    return index * SLOW_STEP;
  }
  return SLOW_COUNT * SLOW_STEP + (index - SLOW_COUNT + 1) * FAST_STEP;
}

function renderReviewsFeed(filteredRows) {
  const feed = document.getElementById('reviews-feed');
  const titleEl = document.getElementById('reviews-title');
  feed.innerHTML = '';

  const titleParts = [];
  if (selectedBarista) titleParts.push(selectedBarista);
  if (onlyNegative) titleParts.push('только негативные');
  titleEl.textContent = titleParts.length ? `Отзывы · ${titleParts.join(', ')}` : 'Последние отзывы';

  if (!filteredRows.length) {
    const placeholder = document.createElement('div');
    placeholder.className = 'state-placeholder';
    placeholder.textContent = 'По этому фильтру отзывов нет';
    feed.appendChild(placeholder);
    return;
  }

  const recentRows = filteredRows.slice().reverse();

  recentRows.forEach((row, index) => {
    const isNegative = row.rating <= 3;

    const item = document.createElement('div');
    item.className = 'review-item' + (isNegative ? ' is-negative' : '');
    item.style.animationDelay = `${getStaggerDelay(index)}ms`;

    const meta = document.createElement('div');
    meta.className = 'review-meta';

    const barista = document.createElement('span');
    barista.className = 'review-barista';
    barista.textContent = row.barista;

    const date = document.createElement('span');
    date.className = 'review-date';
    date.textContent = row.dateLabel;

    const rating = document.createElement('span');
    rating.className = 'review-rating' + (isNegative ? ' is-negative' : '');
    rating.textContent = `${row.rating} ★`;

    meta.appendChild(barista);
    meta.appendChild(date);
    meta.appendChild(rating);

    item.appendChild(meta);

    if (row.comment) {
      const comment = document.createElement('p');
      comment.className = 'review-comment';
      comment.textContent = row.comment;
      item.appendChild(comment);
    }

    feed.appendChild(item);
  });
}

function renderFilterButtons() {
  const resetBtn = document.getElementById('reset-filter-btn');
  resetBtn.classList.toggle('is-disabled', selectedBarista === null);

  const negativeBtn = document.getElementById('negative-filter-btn');
  negativeBtn.classList.toggle('is-active', onlyNegative);
}

function renderDashboard() {
  renderBestEmployee();
  renderTeamGrid();

  const filteredRows = getDisplayRows();
  renderHeaderStats(filteredRows);
  renderReviewsFeed(filteredRows);
  renderFilterButtons();
}

document.getElementById('reset-filter-btn').addEventListener('click', () => {
  selectedBarista = null;
  renderDashboard();
});

document.getElementById('negative-filter-btn').addEventListener('click', () => {
  onlyNegative = !onlyNegative;
  renderDashboard();
});

document.getElementById('month-select').addEventListener('change', (event) => {
  selectedMonthKey = event.target.value;
  renderBestEmployee();
});

fetchData();
