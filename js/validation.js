// =====================================================================
// Перевірка введених даних. Кожна функція повертає об'єкт помилок
// { назваПоля: "текст" }; порожній об'єкт — даних достатньо.
// =====================================================================

import { CATEGORIES } from "./config.js";
import { compareText } from "./utils.js";

export const TICKET_PATTERN = /^Ч-\d{3,5}$/;
const NAME_PATTERN = /^[A-Za-zА-ЩЬЮЯҐЄІЇа-щьюяґєії'’ʼ\- ]+$/u;

export function hasErrors(errors) {
  return Object.keys(errors).length > 0;
}

// Номер квитка: прибрати пробіли, мала «ч» → «Ч»
export function normalizeTicket(value) {
  return String(value ?? "").trim().replace(/^ч/, "Ч");
}

// Книга. reservedCount — скільки примірників зараз зарезервовано або видано
export function validateBook(data, { reservedCount = 0, books = [], editingId = null } = {}) {
  const errors = {};
  const currentYear = new Date().getFullYear();

  if (data.title.length < 2) errors.title = "Введіть назву (щонайменше 2 символи).";
  if (data.author.length < 2) errors.author = "Введіть автора (щонайменше 2 символи).";
  if (!CATEGORIES.includes(data.category)) errors.category = "Оберіть розділ зі списку.";

  if (Number.isNaN(data.year)) {
    errors.year = "Рік має бути цілим числом.";
  } else if (data.year < 1900 || data.year > currentYear) {
    errors.year = `Рік має бути від 1900 до ${currentYear}.`;
  }

  if (Number.isNaN(data.quantity)) {
    errors.quantity = "Кількість має бути цілим числом.";
  } else if (data.quantity < 0) {
    errors.quantity = "Кількість не може бути від'ємною.";
  } else if (data.quantity < reservedCount) {
    errors.quantity = `Зараз зарезервовано або видано ${reservedCount} прим., кількість не може бути меншою.`;
  }

  const duplicate = books.find(
    (book) =>
      book.id !== editingId &&
      compareText(book.title, data.title) === 0 &&
      compareText(book.author, data.author) === 0
  );
  if (duplicate && !errors.title) {
    errors.title = "Така книга вже є в каталозі — змініть кількість її примірників.";
  }
  return errors;
}

// Читач
export function validateReader(data, { readers = [], editingId = null } = {}) {
  const errors = {};

  if (data.fullName.length < 3) {
    errors.fullName = "Введіть прізвище та ім'я (щонайменше 3 символи).";
  } else if (!NAME_PATTERN.test(data.fullName)) {
    errors.fullName = "Використовуйте лише літери, пробіл, апостроф і дефіс.";
  }
  if (data.group.length < 2) errors.group = "Введіть групу або посаду.";

  if (!TICKET_PATTERN.test(data.ticket)) {
    errors.ticket = "Формат номера: Ч-001 (літера Ч, дефіс, 3–5 цифр).";
  } else if (readers.some((r) => r.id !== editingId && r.ticket === data.ticket)) {
    errors.ticket = "Читач із таким номером квитка вже існує.";
  }
  return errors;
}

// Форма заявки клієнта (перевірки, які не потребують сервера)
export function validateRequestForm(data) {
  const errors = {};
  if (!data.bookId) errors.bookId = "Оберіть книгу.";
  if (!TICKET_PATTERN.test(data.ticket)) {
    errors.ticket = "Введіть номер квитка у форматі Ч-001.";
  }
  if (data.comment.length > 200) errors.comment = "Коментар — не більше 200 символів.";
  return errors;
}

// Поле пошуку статусу заявок
export function validateTicket(ticket) {
  return TICKET_PATTERN.test(ticket) ? {} : { ticket: "Введіть номер квитка у форматі Ч-001." };
}
