import { businessDate, emptySources } from "./data.js";
import { dayNumber, dateFromDay } from "./analytics.js";

// Explicit opt-in only. Never used as a network-error fallback.
export function demoSources(today = businessDate()) {
  const sources = emptySources();
  const names = ["айдана", "диас", "ислам", "мадина", "баха", "алина"];
  const comments = [
    "Очень уютно. Кофе, море за окном и внимательная команда — хочется возвращаться.",
    "Спасибо за рекомендацию! Попробовала новый фильтр, это любовь с первого глотка.",
    "Наше любимое место в Актау. Всегда встречают с улыбкой и помнят любимый заказ.",
    "Капучино прекрасный, но заказ сегодня пришлось ждать дольше обычного.",
    "Редкое сочетание: хороший кофе, спокойная атмосфера и искреннее внимание.",
    "Зашли на завтрак. Всё понравилось, особенно сырники и большой стол у окна.",
  ];
  const end = dayNumber(today);
  for (let day = 0; day < 45; day++) {
    const date = dateFromDay(end - day);
    const base = {
      date,
      month: date.slice(0, 7),
      order: (end - day) * 86400000,
    };
    for (let guest = 0; guest < 3 + (day % 5); guest++) {
      const name = names[(day + guest) % names.length];
      const rating =
        (day * 7 + guest) % 19 === 0 ? 3 : (day + guest) % 5 === 0 ? 4 : 5;
      sources.reviews.records.push({
        ...base,
        order: base.order + guest * 3600000,
        name,
        rating,
        comment:
          rating <= 3
            ? "Заказ ждали слишком долго. Пожалуйста, обратите внимание на время выдачи."
            : comments[(day + guest) % comments.length],
      });
    }
    for (let scan = 0; scan < 8 + (day % 7); scan++)
      sources.scans.records.push({
        ...base,
        name: names[(day + scan) % names.length],
      });
    for (let click = 0; click < 4 + (day % 5); click++)
      sources.clicks.records.push({
        ...base,
        name: names[(day + click) % names.length],
        platform: ["2gis", "yandex", "instagram"][(day + click) % 3],
      });
  }
  for (const source of Object.values(sources)) {
    source.status = "ready";
    source.updatedAt = new Date().toISOString();
  }
  return sources;
}
