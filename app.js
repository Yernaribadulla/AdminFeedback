const sheetId = 'YOUR_SHEET_ID';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`;

const monthNames = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

// Мок-значение сканов QR — пока нет реальной аналитики сканирований,
// используется как база для карточки конверсии в Executive Snapshot
const MOCK_QR_SCANS = 140;

const fallbackData = [
  { date: '21.07.2026 8:12:00', barista: 'Ислам', rating: 2, comment: 'Долго ждал заказ этим утром.' },
  { date: '21.07.2026 10:45:00', barista: 'Диас', rating: 5, comment: 'Отличное начало дня, спасибо!' },
  { date: '20.07.2026 19:32:10', barista: 'Баха', rating: 5, comment: 'Лучший раф на пирсе.' },
  { date: '19.07.2026 9:12:47', barista: 'Ислам', rating: 4, comment: 'Хорошо, но немного шумно.' },
  { date: '18.07.2026 18:04:00', barista: 'Диас', rating: 3, comment: 'Средне, ожидал большего.' },
  { date: '17.07.2026 8:15:47', barista: 'Баха', rating: 5, comment: 'Прекрасный сервис.' },
  { date: '16.07.2026 11:20:33', barista: 'Ислам', rating: 5, comment: 'Очень приятная атмосфера.' },
  { date: '15.07.2026 19:41:02', barista: 'Диас', rating: 5, comment: 'Красиво оформили латте-арт.' },
  { date: '14.07.2026 7:58:19', barista: 'Баха', rating: 2, comment: 'Ждали заказ почти двадцать минут.' },
  { date: '13.07.2026 12:03:55', barista: 'Ислам', rating: 4, comment: 'Хороший кофе.' },
  { date: '12.07.2026 16:44:10', barista: 'Диас', rating: 5, comment: 'Попал в точку со вкусом.' },
  { date: '11.07.2026 9:29:00', barista: 'Баха', rating: 5, comment: 'Очень дружелюбно.' },
  { date: '10.07.2026 14:12:47', barista: 'Ислам', rating: 3, comment: 'Кофе остыл, пока несли.' },
  { date: '04.06.2026 10:05:22', barista: 'Диас', rating: 2, comment: 'Перепутали заказ.' },
  { date: '28.06.2026 9:17:41', barista: 'Баха', rating: 5, comment: 'Как всегда прекрасно.' },
  { date: '20.06.2026 17:50:03', barista: 'Ислам', rating: 5, comment: 'Спасибо за рекомендацию!' },
  { date: '15.06.2026 13:33:29', barista: 'Диас', rating: 1, comment: 'Грубо ответил на просьбу пересчитать.' },
  { date: '10.06.2026 8:47:15', barista: 'Баха', rating: 4, comment: 'Чуть медленно в час пик.' }
];

// Все загруженные отзывы храним в памяти — фильтруем и удаляем без повторных запросов к сети
let allRows = [];

// Полный список сотрудников (собирается один раз, чтобы карточки не "прыгали" при смене месяца)
let staffRoster = [];

// Опорная "текущая дата" дашборда — последняя дата в данных
// (см. п.1 требований: считаем от последних записей или системного времени)
let referenceDate = new Date();

// Состояния фильтров
let selectedBarista = null;
let onlyNegative = false;
let selectedMonthKey = 'all';

// Счётчик для присвоения уникальных id строкам (нужно для удаления отзывов)
let rowIdCounter = 0;

function parseGvizResponse(text) {
  const match = text.match(/setResponse\(([\s\S]*)\);?\s*$/);
  if (!match) {
    throw new Error('Не удалось распознать ответ Google Sheets');
  }
  return JSON.parse(match[1]);
}

/**
 * Надёжно разбирает дату из Google Sheets в разных форматах и возвращает объект Date:
 * - объект gviz: Date(2026,6,19,...)
 * - "19.07.2026 0:01:35" (ДД.ММ.ГГГГ, ЧЧ:ММ:СС)
 * - "2026-07-19T00:01:35" (ISO)
 * Время учитывается там, где оно есть; если распознать не удалось — возвращает null.
 */
function parseDateSafe(rawValue) {
  if (!rawValue) return null;
  const value = String(rawValue).trim();

  const gvizMatch = /^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?/.exec(value);
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

  // ДД.ММ.ГГГГ ЧЧ:ММ:СС (время опционально)
  const dottedMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/.exec(value);
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

  // ISO-подобные строки
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value);
  if (isoMatch) {
    const fallbackIso = new Date(value);
    if (!Number.isNaN(fallbackIso.getTime())) return fallbackIso;
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }

  const generic = new Date(value);
  return Number.isNaN(generic.getTime()) ? null : generic;
}

function monthKeyOf(dateObj) {
  if (!dateObj) return null;
  return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
}

function formatDateObj(dateObj) {
  if (!dateObj) return '';
  return dateObj.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function isSameCalendarDay(dateA, dateB) {
  return dateA.getFullYear() === dateB.getFullYear()
    && dateA.getMonth() === dateB.getMonth()
    && dateA.getDate() === dateB.getDate();
}

function daysBetween(dateA, dateB) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const startOfA = new Date(dateA.getFullYear(), dateA.getMonth(), dateA.getDate());
  const startOfB = new Date(dateB.getFullYear(), dateB.getMonth(), dateB.getDate());
  return Math.round((startOfA - startOfB) / MS_PER_DAY);
}

function buildRow(rawDate, barista, rating, comment) {
  const dateObj = parseDateSafe(rawDate);
  rowIdCounter += 1;
  return {
    id: rowIdCounter,
    dateObj,
    monthKey: monthKeyOf(dateObj),
    dateLabel: formatDateObj(dateObj),
    barista,
    rating,
    comment
  };
}

/* ---------- Железобетонный парсер строк таблицы ---------- */

function extractRows(json) {
  const rows = json.table && json.table.rows ? json.table.rows : [];
  return rows
    .map((row) => {
      const cells = row.c || [];

      let rawDate = null;
      if (cells[0]) {
        rawDate = cells[0].f ? cells[0].f : cells[0].v;
      }

      const barista = cells[1] && cells[1].v ? String(cells[1].v).trim() : 'Неизвестно';

      // Умный парсер оценки: чистим звезды и скобки вроде (2/5), проверяем на чистое число
      let rating = 0;
      if (cells[2] && cells[2].v !== null && cells[2].v !== undefined) {
        const rawRating = String(cells[2].v);
        if (!isNaN(rawRating) && rawRating.trim() !== '') {
          rating = Number(rawRating);
        } else {
          const ratingMatch = rawRating.match(/\((\d)\/\d\)/) || rawRating.match(/\d/);
          rating = ratingMatch ? Number(ratingMatch[1] || ratingMatch[0]) : 0;
        }
      }

      const comment = cells[3] && cells[3].v ? String(cells[3].v) : '';

      return buildRow(rawDate, barista, rating, comment);
    })
    .filter((row) => row.rating > 0);
}

/* ---------- Сортировка по свежести (новые сверху) ---------- */

function dateSortValue(dateObj) {
  // Отсутствующая дата уходит в конец списка, а не ломает сортировку
  return dateObj ? dateObj.getTime() : -Infinity;
}

function compareRowsByDateDesc(rowA, rowB) {
  return dateSortValue(rowB.dateObj) - dateSortValue(rowA.dateObj);
}

function sortRowsByDateDesc(rows) {
  return rows.slice().sort(compareRowsByDateDesc);
}

/* ---------- Загрузка данных ---------- */

async function fetchData() {
  try {
    const response = await fetch(SHEET_URL);
    if (!response.ok) throw new Error('Сеть недоступна');
    const text = await response.text();
    const json = parseGvizResponse(text);
    const rows = extractRows(json);
    if (!rows.length) throw new Error('Таблица пуста');
    allRows = sortRowsByDateDesc(rows);
  } catch (error) {
    console.warn('Не удалось загрузить данные из Google Sheets, используются тестовые данные.', error);
    const parsedFallback = fallbackData.map((row) => buildRow(row.date, row.barista, row.rating, row.comment));
    allRows = sortRowsByDateDesc(parsedFallback);
  }

  const datesWithValue = allRows.map((row) => row.dateObj).filter(Boolean);
  referenceDate = datesWithValue.length ? datesWithValue.reduce((a, b) => (a > b ? a : b)) : new Date();

  staffRoster = Array.from(new Set(allRows.map((row) => row.barista))).sort();
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

/* ---------- Фильтрация по месяцу (глобальная) ---------- */

function getMonthRows(monthKey) {
  if (monthKey === 'all') return allRows;
  return allRows.filter((row) => row.monthKey === monthKey);
}

/* ---------- Комбинированная фильтрация: месяц + сотрудник + негатив ---------- */

function getDisplayRows() {
  const monthRows = getMonthRows(selectedMonthKey);
  return monthRows.filter((row) => {
    if (selectedBarista && row.barista !== selectedBarista) return false;
    if (onlyNegative && row.rating > 3) return false;
    return true;
  });
}

function computeTeamStats(rows) {
  const grouped = {};
  staffRoster.forEach((name) => { grouped[name] = { count: 0, total: 0 }; });

  rows.forEach((row) => {
    if (!grouped[row.barista]) grouped[row.barista] = { count: 0, total: 0 };
    grouped[row.barista].count += 1;
    grouped[row.barista].total += row.rating;
  });

  return staffRoster.map((name) => ({
    name,
    count: grouped[name].count,
    avg: grouped[name].count ? grouped[name].total / grouped[name].count : 0
  }));
}

function computeOverallStats(rows) {
  const totalReviews = rows.length;
  const totalScore = rows.reduce((sum, row) => sum + row.rating, 0);
  const avgRating = totalReviews ? totalScore / totalReviews : 0;
  return { totalReviews, avgRating };
}

function getBestOfTeam(team) {
  const withReviews = team.filter((member) => member.count > 0);
  if (!withReviews.length) return null;
  return withReviews.slice().sort((a, b) => b.avg - a.avg)[0];
}

/* ---------- Executive Snapshot ---------- */

function renderSnapshot() {
  const todayRows = allRows.filter((row) => row.dateObj && isSameCalendarDay(row.dateObj, referenceDate));
  const negativeToday = todayRows.filter((row) => row.rating <= 3).length;

  const negCard = document.getElementById('snapshot-negative-today');
  const negTitle = document.getElementById('snapshot-negative-title');
  negCard.classList.remove('is-clear', 'is-alert');
  if (negativeToday > 0) {
    negCard.classList.add('is-alert');
    negCard.querySelector('.snapshot-icon').textContent = '🔴';
    negTitle.textContent = `Сегодня: ${negativeToday} негативных`;
  } else {
    negCard.classList.add('is-clear');
    negCard.querySelector('.snapshot-icon').textContent = '🟢';
    negTitle.textContent = 'Сегодня негатива нет';
  }

  // Последние 7 дней (включая референсную дату) и предыдущие 7 дней (8–14 дней назад)
  const last7Rows = allRows.filter((row) => row.dateObj && daysBetween(referenceDate, row.dateObj) >= 0 && daysBetween(referenceDate, row.dateObj) <= 6);
  const prev7Rows = allRows.filter((row) => row.dateObj && daysBetween(referenceDate, row.dateObj) >= 7 && daysBetween(referenceDate, row.dateObj) <= 13);

  const weekStats = computeOverallStats(last7Rows);
  document.getElementById('snapshot-week-rating').textContent = last7Rows.length ? weekStats.avgRating.toFixed(1) : '—';

  const weekTeam = computeTeamStats(last7Rows).filter((m) => m.count > 0);
  const weekLeader = weekTeam.length
    ? weekTeam.slice().sort((a, b) => (b.avg - a.avg) || (b.count - a.count))[0]
    : null;
  document.getElementById('snapshot-week-leader').textContent = weekLeader
    ? `${weekLeader.name} · ${weekLeader.avg.toFixed(1)}`
    : 'Нет данных';

  const last7Team = computeTeamStats(last7Rows);
  const prev7Team = computeTeamStats(prev7Rows);

  let worstDrop = null;
  staffRoster.forEach((name) => {
    const current = last7Team.find((m) => m.name === name);
    const previous = prev7Team.find((m) => m.name === name);
    if (!current || !previous || current.count === 0 || previous.count === 0) return;
    const drop = previous.avg - current.avg;
    if (drop > 0.01 && (!worstDrop || drop > worstDrop.drop)) {
      worstDrop = { name, drop };
    }
  });

  const trendCard = document.getElementById('snapshot-trend');
  const trendIcon = document.getElementById('snapshot-trend-icon');
  const trendTitle = document.getElementById('snapshot-trend-title');
  trendCard.classList.remove('is-stable', 'is-alert');
  if (worstDrop) {
    trendCard.classList.add('is-alert');
    trendIcon.textContent = '⚠️';
    trendTitle.textContent = `Рейтинг ${worstDrop.name} падает`;
  } else {
    trendCard.classList.add('is-stable');
    trendIcon.textContent = '✅';
    trendTitle.textContent = 'Все работают стабильно';
  }

  const conversion = MOCK_QR_SCANS > 0 ? (allRows.length / MOCK_QR_SCANS) * 100 : 0;
  document.getElementById('snapshot-conversion').textContent = `${conversion.toFixed(0)}%`;
}

/* ---------- Заполнение селекта месяцев ---------- */

function populateMonthSelect() {
  const select = document.getElementById('month-select');
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

/* ---------- Рендер: шапка ---------- */

function renderHeaderStats(displayRows) {
  const stats = computeOverallStats(displayRows);
  document.getElementById('stat-total-reviews').textContent = String(stats.totalReviews);
  document.getElementById('stat-avg-rating').textContent = stats.avgRating.toFixed(1);

  const totalLabel = document.getElementById('stat-total-label');
  const avgLabel = document.getElementById('stat-avg-label');

  const scopeParts = [];
  if (selectedMonthKey !== 'all') {
    const [year, month] = selectedMonthKey.split('-').map(Number);
    scopeParts.push(`${monthNames[month - 1]} ${year}`);
  }
  if (selectedBarista) scopeParts.push(selectedBarista);
  if (onlyNegative) scopeParts.push('негативные');

  if (scopeParts.length) {
    totalLabel.textContent = `Отзывов · ${scopeParts.join(', ')}`;
    avgLabel.textContent = `Средний балл · ${scopeParts.join(', ')}`;
  } else {
    totalLabel.textContent = 'Всего отзывов';
    avgLabel.textContent = 'Средний балл';
  }
}

/* ---------- Рендер: лучший сотрудник (по выбранному месяцу) ---------- */

function renderBestEmployee(monthRows) {
  const team = computeTeamStats(monthRows);
  const best = getBestOfTeam(team);

  const nameEl = document.getElementById('best-name');
  const scoreEl = document.getElementById('best-score');

  if (!best) {
    nameEl.textContent = 'Нет данных за этот период';
    scoreEl.textContent = '';
    return;
  }

  nameEl.textContent = best.name;
  scoreEl.textContent = `${best.avg.toFixed(1)} из 5 · ${best.count} ${pluralizeReviews(best.count)}`;
}

/* ---------- Рендер: карточки команды (по выбранному месяцу) ---------- */

function renderTeamGrid(monthRows) {
  const team = computeTeamStats(monthRows);
  const grid = document.getElementById('team-grid');
  grid.innerHTML = '';

  if (!team.length) {
    const placeholder = document.createElement('div');
    placeholder.className = 'state-placeholder';
    placeholder.textContent = 'Нет данных по команде';
    grid.appendChild(placeholder);
    return;
  }

  team.forEach((member) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'team-card';
    if (selectedBarista === member.name) card.classList.add('active-card');

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
    count.textContent = member.count
      ? `${member.count} ${pluralizeReviews(member.count)}`
      : 'Нет отзывов за период';

    nameBlock.appendChild(name);
    nameBlock.appendChild(count);
    header.appendChild(avatar);
    header.appendChild(nameBlock);

    const scoreRow = document.createElement('div');
    scoreRow.className = 'team-score-row';

    const scoreValue = document.createElement('span');
    scoreValue.className = 'team-score-value';
    scoreValue.textContent = member.count ? member.avg.toFixed(1) : '—';

    const scoreMax = document.createElement('span');
    scoreMax.className = 'team-score-max';
    scoreMax.textContent = 'из 5.0';

    scoreRow.appendChild(scoreValue);
    scoreRow.appendChild(scoreMax);

    const progressTrack = document.createElement('div');
    progressTrack.className = 'progress-track';

    const progressFill = document.createElement('div');
    progressFill.className = 'progress-fill';
    progressFill.style.width = `${member.count ? Math.min((member.avg / 5) * 100, 100) : 0}%`;

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

/* ---------- Лента отзывов (месяц + сотрудник + негатив, свежие сверху) ---------- */

function getStaggerDelay(index) {
  const SLOW_STEP = 100;
  const FAST_STEP = 18;
  const SLOW_COUNT = 6;
  if (index < SLOW_COUNT) return index * SLOW_STEP;
  return SLOW_COUNT * SLOW_STEP + (index - SLOW_COUNT + 1) * FAST_STEP;
}

function renderReviewsFeed(displayRows) {
  const feed = document.getElementById('reviews-feed');
  const titleEl = document.getElementById('reviews-title');
  feed.innerHTML = '';

  const titleParts = [];
  if (selectedMonthKey !== 'all') {
    const [year, month] = selectedMonthKey.split('-').map(Number);
    titleParts.push(`${monthNames[month - 1]} ${year}`);
  }
  if (selectedBarista) titleParts.push(selectedBarista);
  if (onlyNegative) titleParts.push('только негативные');
  titleEl.textContent = titleParts.length ? `Отзывы · ${titleParts.join(', ')}` : 'Последние отзывы';

  if (!displayRows.length) {
    const placeholder = document.createElement('div');
    placeholder.className = 'state-placeholder';
    placeholder.textContent = 'По этому фильтру отзывов нет';
    feed.appendChild(placeholder);
    return;
  }

  displayRows.forEach((row, index) => {
    const isNegative = row.rating <= 3;

    const item = document.createElement('div');
    item.className = 'review-item' + (isNegative ? ' is-negative' : '');
    item.dataset.rowId = String(row.id);
    item.style.animationDelay = `${getStaggerDelay(index)}ms`;

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'review-delete-btn';
    deleteBtn.setAttribute('aria-label', 'Удалить отзыв');
    deleteBtn.textContent = '×';
    deleteBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteReview(row.id, item);
    });

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

    item.appendChild(deleteBtn);
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

/* ---------- Локальная модерация: удаление отзыва ---------- */

function deleteReview(rowId, itemEl) {
  itemEl.classList.add('is-removing');

  const finish = () => {
    allRows = allRows.filter((row) => row.id !== rowId);
    renderDashboard();
  };

  itemEl.addEventListener('transitionend', finish, { once: true });
  // Подстраховка на случай, если transitionend не сработает (например, если элемент уже скрыт)
  setTimeout(finish, 400);
}

function renderFilterButtons() {
  const resetBtn = document.getElementById('reset-filter-btn');
  resetBtn.classList.toggle('is-disabled', selectedBarista === null);

  const negativeBtn = document.getElementById('negative-filter-btn');
  negativeBtn.classList.toggle('is-active', onlyNegative);
}

/* ---------- Главная функция рендера ---------- */

function renderDashboard() {
  const monthRows = getMonthRows(selectedMonthKey);
  const displayRows = getDisplayRows();

  renderSnapshot();
  renderBestEmployee(monthRows);
  renderTeamGrid(monthRows);
  renderHeaderStats(displayRows);
  renderReviewsFeed(displayRows);
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
  renderDashboard();
});

fetchData();
