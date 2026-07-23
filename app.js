const sheetId = '1ZS1EXykP93modWYpw0_6CXXpk3NIe7e9-VkTSdSFZVE';

// Ссылки на листы Отзывов (gid=0) и Сканов (gid=129289886)
const REVIEWS_URL = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=0`;
const SCANS_URL = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=129289886`;
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyXMPd1JZebIeGPigGQDgPGndeJacY117CZdBWjANbRqkd0KgwJPurMKMiOwP4a8bEN/exec";

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
  { date: '2026-07-05T14:12:47', barista: 'Ислам', rating: 3, comment: 'Кофе остыл, пока несли к столику.' }
];

let allRows = [];
let totalScansCount = 0;

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
      const rawDate = cells[0] ? cells[0].v : null;
      const barista = cells[1] && cells[1].v ? String(cells[1].v).trim() : 'Неизвестно';
      const rating = cells[2] ? Number(cells[2].v) : 0;
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
    const response = await fetch(REVIEWS_URL);
    if (!response.ok) throw new Error('Сеть недоступна');
    const text = await response.text();
    const json = parseGvizResponse(text);
    const rows = extractRows(json);
    if (!rows.length) throw new Error('Таблица пуста');
    allRows = rows;
  } catch (error) {
    console.warn('Не удалось загрузить отзывы из Google Sheets, используются резервные данные.', error);
    allRows = fallbackData.map((row) => buildRow(row.date, row.barista, row.rating, row.comment));
  }

  // Загружаем сканы для расчета реальной конверсии
  await loadScansData();

  populateMonthSelect();
  renderDashboard();
}

async function loadScansData() {
  try {
    const response = await fetch(SCANS_URL);
    if (response.ok) {
      const text = await response.text();
      const json = parseGvizResponse(text);
      const rows = json.table && json.table.rows ? json.table.rows : [];
      totalScansCount = rows.length;
    }
  } catch (err) {
    console.warn('Ошибка при получении сканов QR:', err);
  }
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

function populateMonthSelect() {
  const select = document.getElementById('month-select');
  if (!select) return;

  const previousValue = select.value || 'all';
  const uniqueKeys = new Set(allRows.map((row) => row.monthKey).filter(Boolean));
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

  totalLabel.textContent = `Отзывов${scopeSuffix}`;
  avgLabel.textContent = `Средний балл${scopeSuffix}`;

  if (!selectedBarista && !onlyNegative) {
    totalLabel.textContent = 'Всего отзывов';
    avgLabel.textContent = 'Средний балл';
  }

  // Расчет живой конверсии QR
  const conversionEl = document.getElementById('snapshot-conversion');
  if (conversionEl) {
    if (totalScansCount > 0) {
      const rate = ((allRows.length / totalScansCount) * 100).toFixed(1);
      conversionEl.textContent = `${rate}%`;
    } else {
      conversionEl.textContent = '0%';
    }
  }
}

function renderBestEmployee() {
  const monthRows = getMonthRows(selectedMonthKey);
  const stats = computeStats(monthRows);

  const nameEl = document.getElementById('best-name');
  const scoreEl = document.getElementById('best-score');

  if (!stats.best) {
    nameEl.textContent = 'Нет данных';
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
    grid.innerHTML = '<div class="state-placeholder">Нет данных по команде</div>';
    return;
  }

  stats.team.forEach((member) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'team-card' + (selectedBarista === member.name ? ' active-card' : '');

    card.innerHTML = `
      <div class="team-card-header">
        <div class="team-avatar">${member.name.charAt(0).toUpperCase()}</div>
        <div>
          <div class="team-name">${member.name}</div>
          <div class="team-count">${member.count} ${pluralizeReviews(member.count)}</div>
        </div>
      </div>
      <div class="team-score-row">
        <span class="team-score-value">${member.avg.toFixed(1)}</span>
        <span class="team-score-max">из 5.0</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width: ${Math.min((member.avg / 5) * 100, 100)}%"></div>
      </div>
    `;

    card.addEventListener('click', () => {
      selectedBarista = selectedBarista === member.name ? null : member.name;
      renderDashboard();
    });

    grid.appendChild(card);
  });
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
    feed.innerHTML = '<div class="state-placeholder">По этому фильтру отзывов нет</div>';
    return;
  }

  filteredRows.slice().reverse().forEach((row) => {
    const isNegative = row.rating <= 3;
    const item = document.createElement('div');
    item.className = 'review-item' + (isNegative ? ' is-negative' : '');

    item.innerHTML = `
      <div class="review-meta">
        <span class="review-barista">${row.barista}</span>
        <span class="review-date">${row.dateLabel}</span>
        <span class="review-rating ${isNegative ? 'is-negative' : ''}">${row.rating} ★</span>
      </div>
      ${row.comment ? `<p class="review-comment">${row.comment}</p>` : ''}
    `;

    feed.appendChild(item);
  });
}

function renderFilterButtons() {
  const resetBtn = document.getElementById('reset-filter-btn');
  if (resetBtn) resetBtn.classList.toggle('is-disabled', selectedBarista === null);

  const negativeBtn = document.getElementById('negative-filter-btn');
  if (negativeBtn) negativeBtn.classList.toggle('is-active', onlyNegative);
}

function renderDashboard() {
  renderBestEmployee();
  renderTeamGrid();

  const filteredRows = getDisplayRows();
  renderHeaderStats(filteredRows);
  renderReviewsFeed(filteredRows);
  renderFilterButtons();
}

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
      renderBestEmployee();
    });
  }

  fetchData();
});
