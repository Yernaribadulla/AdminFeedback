const sheetId = '1ZS1EXykP93modWYpw0_6CXXpk3NIe7e9-VkTSdSFZVE';

const REVIEWS_URL = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=0`;
const SCANS_URL = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=129289886`;

const fallbackData = [
  { date: '2026-07-20', barista: 'dias', rating: 5, comment: 'Отличный кофе и сервис!' },
  { date: '2026-07-21', barista: 'islam', rating: 4, comment: 'Всё круто, но долго делали' },
  { date: '2026-07-22', barista: 'baha', rating: 5, comment: 'Лучший раф в городе' },
  { date: '2026-07-22', barista: 'dias', rating: 2, comment: 'Холодный кофе' },
  { date: '2026-07-23', barista: 'dias', rating: 5, comment: 'Супер!' }
];

const monthNames = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

let allRows = [];
let totalScansCount = 0;

let selectedBarista = null;
let onlyNegative = false;
let selectedMonthKey = 'all';

function parseGvizResponse(text) {
  const match = text.match(/setResponse\(([\s\S]*)\);?\s*$/);
  if (!match) throw new Error('Некорректный ответ Google Sheets');
  return JSON.parse(match[1]);
}

function parseDateSafe(rawValue) {
  if (!rawValue) return new Date();
  const value = String(rawValue).trim();

  const gvizMatch = /^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)/.exec(value);
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

  const dottedMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{1,2}):(\d{1,2}))?/.exec(value);
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
  
  let numRating = Number(rating) || 0;

  // Если из-за кривого формата Google всё равно отдал 55 вместо 5 или 25 вместо 2.5
  if (numRating > 5) {
    numRating = numRating / 10;
  }

  // Жесткий лимит от 1 до 5
  if (numRating > 5) numRating = 5;
  if (numRating < 0) numRating = 0;

  return {
    dateObj,
    monthKey: `${year}-${String(month).padStart(2, '0')}`,
    dateLabel: dateObj.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    barista: String(barista).trim(),
    rating: numRating,
    comment: String(comment || '')
  };
}

function extractRows(json) {
  const rows = json.table && json.table.rows ? json.table.rows : [];

  return rows
    .map((row) => {
      if (!row.c) return null;
      const cells = row.c;
      
      const rawDate = cells[0] ? (cells[0].v || cells[0].f) : null;
      const barista = cells[1] && cells[1].v !== null ? cells[1].v : '';
      
      // БЕРЕМ ИСКЛЮЧИТЕЛЬНО .v (значение-число), а не .f (форматированный текст)
      let rawRating = 0;
      if (cells[2]) {
        if (typeof cells[2].v === 'number') {
          rawRating = cells[2].v;
        } else if (cells[2].v !== null && cells[2].v !== undefined) {
          rawRating = parseFloat(String(cells[2].v).replace(',', '.')) || 0;
        } else if (cells[2].f) {
          rawRating = parseFloat(String(cells[2].f).replace(',', '.')) || 0;
        }
      }

      const comment = cells[3] && cells[3].v !== null ? cells[3].v : '';

      if (!barista) return null;
      return buildRow(rawDate, barista, rawRating, comment);
    })
    .filter((r) => r !== null && r.rating > 0);
}

async function fetchData() {
  const directUrl = REVIEWS_URL;
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(REVIEWS_URL)}`;

  try {
    console.log('🔄 Загрузка данных...');
    let response = await fetch(directUrl);
    
    if (!response.ok) {
      response = await fetch(proxyUrl);
    }

    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

    const text = await response.text();
    const json = parseGvizResponse(text);
    const rows = extractRows(json);

    if (!rows.length) throw new Error('Таблица пуста');

    console.log('✅ Загружено отзывов:', rows.length, rows);
    allRows = rows;
  } catch (error) {
    console.error('❌ Ошибка загрузки, включаем фоллбэк:', error);
    allRows = fallbackData.map((row) => buildRow(row.date, row.barista, row.rating, row.comment));
  }

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
    console.warn(' Ошибка загрузки сканов:', err);
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
  const totalScore = rows.reduce((sum, row) => sum + (Number(row.rating) || 0), 0);
  const avgRating = totalReviews ? totalScore / totalReviews : 0;

  const staffNames = new Set(rows.map((row) => row.barista));
  const grouped = {};
  staffNames.forEach((name) => { grouped[name] = { count: 0, total: 0 }; });

  rows.forEach((row) => {
    if (grouped[row.barista]) {
      grouped[row.barista].count += 1;
      grouped[row.barista].total += (Number(row.rating) || 0);
    }
  });

  const team = Array.from(staffNames)
    .map((name) => ({
      name,
      count: grouped[name].count,
      avg: grouped[name].count ? grouped[name].total / grouped[name].count : 0
    }))
    .filter((member) => member.count > 0)
    .sort((a, b) => b.avg - a.avg);

  return { totalReviews, avgRating, team, best: team.length ? team[0] : null };
}

function renderExecutiveSnapshot() {
  const now = new Date();
  
  const todayNegatives = allRows.filter((r) => {
    const d = r.dateObj;
    return d.getFullYear() === now.getFullYear() &&
           d.getMonth() === now.getMonth() &&
           d.getDate() === now.getDate() &&
           r.rating <= 3;
  }).length;

  const negTitleEl = document.getElementById('snapshot-negative-title');
  if (negTitleEl) {
    negTitleEl.textContent = todayNegatives === 0 ? 'Нет замечаний' : `${todayNegatives} ${pluralizeReviews(todayNegatives)}`;
  }

  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  let weekRows = allRows.filter((r) => r.dateObj >= sevenDaysAgo);

  if (weekRows.length === 0 && allRows.length > 0) {
    weekRows = allRows.slice(-7);
  }

  const weekStats = computeStats(weekRows);

  const weekRatingEl = document.getElementById('snapshot-week-rating');
  if (weekRatingEl) {
    weekRatingEl.textContent = weekStats.totalReviews > 0 ? `${weekStats.avgRating.toFixed(1)} ★` : '—';
  }

  const weekLeaderEl = document.getElementById('snapshot-week-leader');
  if (weekLeaderEl) {
    weekLeaderEl.textContent = weekStats.best ? weekStats.best.name : '—';
  }

  const trendEl = document.getElementById('snapshot-trend-title');
  if (trendEl) {
    trendEl.textContent = 'Стабильно';
  }
}

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

  select.value = sortedKeys.includes(previousValue) ? previousValue : 'all';
  selectedMonthKey = select.value;
}

// Выборка по Месяцу + Баристе + Негативу
function getDisplayRows() {
  return allRows.filter((row) => {
    if (selectedMonthKey !== 'all' && row.monthKey !== selectedMonthKey) return false;
    if (selectedBarista && row.barista !== selectedBarista) return false;
    if (onlyNegative && row.rating > 3) return false;
    return true;
  });
}

function renderHeaderStats(filteredRows) {
  const stats = computeStats(filteredRows);
  const totalEl = document.getElementById('stat-total-reviews');
  const avgEl = document.getElementById('stat-avg-rating');
  
  if (totalEl) totalEl.textContent = String(stats.totalReviews);
  if (avgEl) avgEl.textContent = stats.avgRating > 0 ? stats.avgRating.toFixed(1) : '0.0';

  const conversionEl = document.getElementById('snapshot-conversion');
  if (conversionEl) {
    if (totalScansCount > 0) {
      const rate = ((allRows.length / totalScansCount) * 100).toFixed(1);
      conversionEl.textContent = `${rate}%`;
    } else {
      conversionEl.textContent = '100.0%';
    }
  }
}

function renderBestEmployee(periodRows) {
  const stats = computeStats(periodRows);

  const nameEl = document.getElementById('best-name');
  const scoreEl = document.getElementById('best-score');

  if (!nameEl) return;

  if (!stats.best) {
    nameEl.textContent = 'Нет данных';
    if (scoreEl) scoreEl.textContent = '';
    return;
  }

  nameEl.textContent = stats.best.name;
  if (scoreEl) scoreEl.textContent = `${stats.best.avg.toFixed(1)} из 5 · ${stats.best.count} ${pluralizeReviews(stats.best.count)}`;
}

function renderTeamGrid(periodRows) {
  const stats = computeStats(periodRows);
  const grid = document.getElementById('team-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (!stats.team.length) {
    grid.innerHTML = '<div class="state-placeholder">Нет данных по команде за этот период</div>';
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
  if (!feed) return;
  feed.innerHTML = '';

  if (titleEl) {
    const titleParts = [];
    if (selectedBarista) titleParts.push(selectedBarista);
    if (onlyNegative) titleParts.push('только негативные');
    titleEl.textContent = titleParts.length ? `Отзывы · ${titleParts.join(', ')}` : 'Последние отзывы';
  }

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
        <span class="review-rating ${isNegative ? 'is-negative' : ''}">${row.rating.toFixed(1)} ★</span>
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
  if (negativeBtn) {
    if (onlyNegative) {
      negativeBtn.style.background = '#e74c3c';
      negativeBtn.style.color = '#fff';
    } else {
      negativeBtn.style.background = '';
      negativeBtn.style.color = '';
    }
  }
}

function renderDashboard() {
  renderExecutiveSnapshot();

  // Получаем строки для текущего выбранного Месяца
  const periodRows = selectedMonthKey === 'all' 
    ? allRows 
    : allRows.filter((r) => r.monthKey === selectedMonthKey);

  renderBestEmployee(periodRows);
  renderTeamGrid(periodRows);

  // Итоговый отфильтрованный массив (с учетом периода, баристы и негатива)
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
      renderDashboard();
    });
  }

  fetchData();
});
