// =====================================================================
// Допоміжні функції без звернень до сторінки та сервера
// =====================================================================

// Захист від вставлення HTML-коду з даних
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Дата у форматі РРРР-ММ-ДД за місцевим часом
export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayISO() {
  return toISODate(new Date());
}

export function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

// 2026-10-27 → 27.10.2026
export function formatDate(isoDate) {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

// Перетворити рядок на ціле число; якщо це не ціле число — NaN
export function parseInteger(value) {
  const text = String(value ?? "").trim();
  if (text === "") return NaN;
  const number = Number(text);
  return Number.isInteger(number) ? number : NaN;
}

// Порівняння рядків за українською абеткою
export function compareText(a, b) {
  return String(a).localeCompare(String(b), "uk", { sensitivity: "base" });
}
