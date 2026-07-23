const sheetId = '1ZS1EXykP93modWYpw0_6CXXpk3NIe7e9-VkTSdSFZVE';

// Прямой запрос к листу отзывов (gid=0)
const REVIEWS_URL = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=0`;
const SCANS_URL = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=129289886`;

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
  if (!match) {
    throw new Error('CORS или структура ответа Google Таблицы некорректна');
  }
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

function extractRows(json) {
  const rows = json.table && json.table.rows ? json.table.rows : [];
  console.log('📥 Сырые строки из Google Sheets:', rows);

  return rows
    .map((row) => {
      const cells = row.c || [];
      const rawDate = cells[0] ? (cells[0].f || cells[0].v) : null;
      const barista = cells[1] && cells[1].v ? String(cells[1].v).trim() : '';
      const rating = cells[2] ? Number(cells[2].v) : 0;
      const comment = cells[3] && cells[3].v ? String(cells[3].v) : '';
      
      if (!barista || rating === 0) return null;
      return buildRow(rawDate, barista, rating, comment);
    })
    .filter(Boolean);
}

async function fetchData() {
  const directUrl = REVIEWS_URL;
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(REVIEWS_URL)}`;

  try {
    console.log('🔄 Отправка запроса в Google Sheets...');
    let response = await fetch(directUrl);
    
    // Если прямой запрос отвалился (например, CORS), пробуем через прокси
    if (!response.ok) {
      console.warn('Прямой запрос не прошел, пробуем через прокси...');
      response = await fetch(proxyUrl);
    }

    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    
    const text = await response.text();
    const json = parseGvizResponse(text);
    const rows = extractRows(json);

    console.log('✅ Распарсенные отзывы из таблицы:', rows);

    if (!rows.length) {
      throw new Error('Google Таблица доступна, но строки отзывов пустые!');
    }
    
    allRows = rows;
  } catch (error) {
    console.error('❌ ОШИБКА ЗАГРУЗКИ ОТЗЫВОВ (используем фоллбэк):', error);
    // ВОТ ЗДЕСЬ БЫЛА ОШИБКА: Если таблица не ответила — явно забиваем заглушки
    allRows = fallbackData.map((row) => buildRow(row.date, row.barista, row.rating, row.comment));
  }

  await loadScansData();
  populateMonthSelect();
  renderDashboard();
}

function renderExecutiveSnapshot() {
  const now = new Date();
  
  // 1. Замечания за сегодня (рейтинг <= 3)
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

  // 2. Статистика за последние 7 дней (с автоподстраховкой, чтобы не было прочерков)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  let weekRows = allRows.filter((r) => r.dateObj >= sevenDaysAgo);

  // Если за 7 дней отзывов нет (например, старая базовая база) — берем последние 7 отзывов
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

  // 3. Тренд
  const trendEl = document.getElementById('snapshot-trend-title');
  if (trendEl) {
    trendEl.textContent = 'Стабильно';
  }
}

  const negTitleEl = document.getElementById('snapshot-negative-title');
  if (negTitleEl) {
    negTitleEl.textContent = todayNegatives === 0 ? 'Нет замечаний' : `${todayNegatives} ${pluralizeReviews(todayNegatives)}`;
  }

  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekRows = allRows.filter((r) => r.dateObj >= sevenDaysAgo);
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

  const previousValue = select.value || 'all';
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
  renderExecutiveSnapshot();
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
