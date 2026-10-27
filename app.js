// =====================================================================
// Вебзастосунок обліку та видачі книг бібліотеки коледжу
// Автор: Турчак Богдан Богданович, група ІС-23-01
//
// Фронтенд звертається до JSON Server через HTTP-запити (fetch).
// Запуск сервера: npx json-server --watch db.json --port 5000
// =====================================================================

// Адреса JSON Server
const SERVER_URL = "http://localhost:5000";

// Строк видачі книги за замовчуванням (днів)
const LOAN_DAYS = 14;

// Розділи (категорії) книг
const CATEGORIES = [
  "Програмування",
  "Бази даних",
  "Мережі",
  "Математика",
  "Історія",
  "Іноземні мови",
  "Художня література",
  "Інше",
];

// Поточні дані, отримані з сервера
const state = {
  books: [],
  readers: [],
  loans: [],
  editingBookId: null,   // id книги, яку редагують (null — режим додавання)
  editingReaderId: null, // id читача, якого редагують
};

// =====================================================================
// 1. Робота з JSON Server
// =====================================================================

// Виконати HTTP-запит і повернути відповідь у вигляді JSON
async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${SERVER_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch (error) {
    // fetch завершується помилкою, якщо сервер недоступний
    throw new Error(
      "Немає зв'язку з JSON Server. Перевірте, чи він запущений: " +
        "npx json-server --watch db.json --port 5000"
    );
  }

  if (response.status === 404) {
    throw new Error("Запис не знайдено. Можливо, його вже видалено — оновіть сторінку.");
  }
  if (!response.ok) {
    throw new Error(`Сервер повернув помилку ${response.status}.`);
  }
  return response.json();
}

// Типові операції з колекціями (books, readers, loans)
const api = {
  getAll: (collection) => request(`/${collection}`),
  getOne: (collection, id) => request(`/${collection}/${id}`),
  create: (collection, data) =>
    request(`/${collection}`, { method: "POST", body: JSON.stringify(data) }),
  update: (collection, id, data) =>
    request(`/${collection}/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (collection, id) => request(`/${collection}/${id}`, { method: "DELETE" }),
};

// =====================================================================
// 2. Допоміжні функції
// =====================================================================

// Захист від вставлення HTML-коду з даних
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const $ = (selector) => document.querySelector(selector);

// --- Повідомлення ---
let messageTimer = null;

function showMessage(text, type = "error") {
  const box = $("#message");
  box.textContent = text;
  box.className = `message message--${type}`;
  box.hidden = false;

  clearTimeout(messageTimer);
  if (type === "success") {
    messageTimer = setTimeout(() => (box.hidden = true), 4000);
  }
}

function hideMessage() {
  $("#message").hidden = true;
}

// --- Дати у форматі РРРР-ММ-ДД ---
function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayISO() {
  return toISODate(new Date());
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

// 2026-10-27 → 27.10.2026
function formatDate(isoDate) {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

// Перетворити рядок на ціле число; якщо це не ціле число — NaN
function parseInteger(value) {
  const text = String(value).trim();
  if (text === "") return NaN;
  const number = Number(text);
  return Number.isInteger(number) ? number : NaN;
}

// Порівняння рядків за українською абеткою
function compareText(a, b) {
  return String(a).localeCompare(String(b), "uk", { sensitivity: "base" });
}

// --- Робота з формами ---

// Показати помилки біля полів форми. errors = { назваПоля: "текст" }
function showFieldErrors(form, errors) {
  form.querySelectorAll("[data-error-for]").forEach((span) => {
    const field = span.dataset.errorFor;
    const input = form.elements[field];
    span.textContent = errors[field] || "";
    if (input) input.classList.toggle("is-invalid", Boolean(errors[field]));
  });
}

function clearFieldErrors(form) {
  showFieldErrors(form, {});
}

// Заблокувати кнопки форми на час запиту (захист від подвійного натискання)
function setFormBusy(form, busy) {
  form.querySelectorAll("button").forEach((button) => (button.disabled = busy));
}

// =====================================================================
// 3. Правила предметної області
// =====================================================================

// Активна видача — книга ще не повернута
function isActiveLoan(loan) {
  return !loan.returnDate;
}

// Стан видачі: "returned" — повернено, "overdue" — прострочено, "active" — на руках
function getLoanStatus(loan) {
  if (loan.returnDate) return "returned";
  if (loan.dueDate < todayISO()) return "overdue";
  return "active";
}

// Скільки примірників книги зараз видано
function countActiveLoansOfBook(bookId) {
  return state.loans.filter((loan) => loan.bookId === bookId && isActiveLoan(loan)).length;
}

// Скільки книг зараз на руках у читача
function countActiveLoansOfReader(readerId) {
  return state.loans.filter((loan) => loan.readerId === readerId && isActiveLoan(loan)).length;
}

// Перевірка даних книги. Повертає об'єкт помилок (порожній — даних достатньо)
function validateBook(data, issuedCount) {
  const errors = {};
  const currentYear = new Date().getFullYear();

  if (data.title.length < 2) {
    errors.title = "Введіть назву (щонайменше 2 символи).";
  }
  if (data.author.length < 2) {
    errors.author = "Введіть автора (щонайменше 2 символи).";
  }
  if (!CATEGORIES.includes(data.category)) {
    errors.category = "Оберіть розділ зі списку.";
  }
  if (Number.isNaN(data.year)) {
    errors.year = "Рік має бути цілим числом.";
  } else if (data.year < 1900 || data.year > currentYear) {
    errors.year = `Рік має бути від 1900 до ${currentYear}.`;
  }
  if (Number.isNaN(data.quantity)) {
    errors.quantity = "Кількість має бути цілим числом.";
  } else if (data.quantity < 0) {
    errors.quantity = "Кількість не може бути від'ємною.";
  } else if (data.quantity < issuedCount) {
    // Головне правило: доступних примірників не може стати менше нуля
    errors.quantity = `Зараз видано ${issuedCount} прим., кількість не може бути меншою.`;
  }

  // Та сама книга (назва + автор) не повинна дублюватися в каталозі
  const duplicate = state.books.find(
    (book) =>
      book.id !== state.editingBookId &&
      compareText(book.title, data.title) === 0 &&
      compareText(book.author, data.author) === 0
  );
  if (duplicate && !errors.title) {
    errors.title = "Така книга вже є в каталозі — змініть кількість її примірників.";
  }

  return errors;
}

// Перевірка даних читача
function validateReader(data) {
  const errors = {};
  const namePattern = /^[A-Za-zА-ЩЬЮЯҐЄІЇа-щьюяґєії'’ʼ\- ]+$/u;

  if (data.fullName.length < 3) {
    errors.fullName = "Введіть прізвище та ім'я (щонайменше 3 символи).";
  } else if (!namePattern.test(data.fullName)) {
    errors.fullName = "Використовуйте лише літери, пробіл, апостроф і дефіс.";
  }
  if (data.group.length < 2) {
    errors.group = "Введіть групу або посаду.";
  }
  if (!/^Ч-\d{3,5}$/.test(data.ticket)) {
    errors.ticket = "Формат номера: Ч-001 (літера Ч, дефіс, 3–5 цифр).";
  } else {
    const taken = state.readers.some(
      (reader) => reader.id !== state.editingReaderId && reader.ticket === data.ticket
    );
    if (taken) errors.ticket = "Читач із таким номером квитка вже існує.";
  }

  return errors;
}

// Перевірка полів форми видачі
function validateLoanForm(data) {
  const errors = {};
  if (!data.bookId) errors.bookId = "Оберіть книгу.";
  if (!data.readerId) errors.readerId = "Оберіть читача.";

  if (!data.issueDate) {
    errors.issueDate = "Вкажіть дату видачі.";
  } else if (data.issueDate > todayISO()) {
    errors.issueDate = "Дата видачі не може бути в майбутньому.";
  }
  if (!data.dueDate) {
    errors.dueDate = "Вкажіть дату повернення.";
  } else if (data.issueDate && data.dueDate < data.issueDate) {
    errors.dueDate = "Дата повернення не може бути раніше дати видачі.";
  }
  return errors;
}

// =====================================================================
// 4. Завантаження даних
// =====================================================================

async function loadAll() {
  try {
    const [books, readers, loans] = await Promise.all([
      api.getAll("books"),
      api.getAll("readers"),
      api.getAll("loans"),
    ]);
    state.books = books;
    state.readers = readers;
    state.loans = loans;
    renderAll();
    return true;
  } catch (error) {
    showMessage(error.message);
    ["#books-body", "#readers-body", "#loans-body"].forEach((selector) => {
      const columns = $(selector).closest("table").querySelectorAll("th").length;
      $(selector).innerHTML =
        `<tr><td colspan="${columns}" class="muted center">Дані не завантажено</td></tr>`;
    });
    return false;
  }
}

function renderAll() {
  renderBooks();
  renderReaders();
  renderLoans();
  renderLoanSelects();
}

// =====================================================================
// 5. Книги
// =====================================================================

// Отримати список книг з урахуванням пошуку, фільтрів і сортування
function getVisibleBooks() {
  const query = $("#book-search").value.trim().toLowerCase();
  const category = $("#book-filter-category").value;
  const onlyAvailable = $("#book-filter-available").checked;
  const [sortField, sortOrder] = $("#book-sort").value.split("-");

  const result = state.books.filter((book) => {
    const matchesQuery =
      !query ||
      book.title.toLowerCase().includes(query) ||
      book.author.toLowerCase().includes(query);
    const matchesCategory = !category || book.category === category;
    const matchesAvailable = !onlyAvailable || book.available > 0;
    return matchesQuery && matchesCategory && matchesAvailable;
  });

  result.sort((a, b) => {
    const diff =
      sortField === "year" ? a.year - b.year : compareText(a[sortField], b[sortField]);
    return sortOrder === "desc" ? -diff : diff;
  });

  return result;
}

function renderBooks() {
  const books = getVisibleBooks();
  const tbody = $("#books-body");

  $("#books-count").textContent =
    books.length === state.books.length
      ? `назв: ${state.books.length}`
      : `знайдено ${books.length} з ${state.books.length}`;

  if (books.length === 0) {
    const text = state.books.length === 0 ? "Каталог порожній" : "Нічого не знайдено";
    tbody.innerHTML = `<tr><td colspan="8" class="muted center">${text}</td></tr>`;
    return;
  }

  tbody.innerHTML = books
    .map((book, index) => {
      const inStock = book.available > 0;
      const status = inStock
        ? `<span class="badge badge--ok">в наявності</span>`
        : `<span class="badge badge--none">немає</span>`;

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(book.title)}</td>
          <td>${escapeHtml(book.author)}</td>
          <td>${escapeHtml(book.category)}</td>
          <td>${escapeHtml(book.year)}</td>
          <td>${escapeHtml(book.available)} / ${escapeHtml(book.quantity)}</td>
          <td>${status}</td>
          <td>
            <div class="actions">
              <button type="button" class="btn btn--small" data-action="issue"
                      data-id="${escapeHtml(book.id)}" ${inStock ? "" : "disabled"}>Видати</button>
              <button type="button" class="btn btn--small" data-action="edit"
                      data-id="${escapeHtml(book.id)}">Змінити</button>
              <button type="button" class="btn btn--small btn--danger" data-action="delete"
                      data-id="${escapeHtml(book.id)}">Видалити</button>
            </div>
          </td>
        </tr>`;
    })
    .join("");
}

// Перевести форму книги в режим додавання
function resetBookForm() {
  const form = $("#book-form");
  form.reset();
  clearFieldErrors(form);
  state.editingBookId = null;
  $("#book-form-title").textContent = "Додати книгу";
  $("#book-submit-btn").textContent = "Додати";
}

// Заповнити форму даними книги для редагування
function startEditBook(id) {
  const book = state.books.find((item) => item.id === id);
  if (!book) return;

  const form = $("#book-form");
  clearFieldErrors(form);
  state.editingBookId = id;
  form.elements.title.value = book.title;
  form.elements.author.value = book.author;
  form.elements.category.value = book.category;
  form.elements.year.value = book.year;
  form.elements.quantity.value = book.quantity;
  $("#book-form-title").textContent = `Редагувати книгу «${book.title}»`;
  $("#book-submit-btn").textContent = "Зберегти зміни";
  form.scrollIntoView({ behavior: "smooth", block: "center" });
  form.elements.title.focus({ preventScroll: true });
}

// Додавання або редагування книги
async function handleBookSubmit(event) {
  event.preventDefault();
  const form = event.target;

  const data = {
    title: form.elements.title.value.trim(),
    author: form.elements.author.value.trim(),
    category: form.elements.category.value,
    year: parseInteger(form.elements.year.value),
    quantity: parseInteger(form.elements.quantity.value),
  };

  const editingId = state.editingBookId;
  const issuedCount = editingId ? countActiveLoansOfBook(editingId) : 0;
  const errors = validateBook(data, issuedCount);
  showFieldErrors(form, errors);
  if (Object.keys(errors).length > 0) {
    showMessage("Виправте помилки у формі книги.");
    return;
  }

  setFormBusy(form, true);
  try {
    if (editingId) {
      // Доступні примірники = загальна кількість − видані
      await api.update("books", editingId, { ...data, available: data.quantity - issuedCount });
      showMessage(`Зміни в книзі «${data.title}» збережено.`, "success");
    } else {
      await api.create("books", { ...data, available: data.quantity });
      showMessage(`Книгу «${data.title}» додано до каталогу.`, "success");
    }
    resetBookForm();
    await loadAll();
  } catch (error) {
    showMessage(error.message);
  } finally {
    setFormBusy(form, false);
  }
}

// Видалення книги
async function deleteBook(id) {
  const book = state.books.find((item) => item.id === id);
  if (!book) return;

  const issued = countActiveLoansOfBook(id);
  if (issued > 0) {
    showMessage(
      `Не можна видалити книгу «${book.title}»: ${issued} прим. зараз на руках у читачів.`
    );
    return;
  }
  if (!confirm(`Видалити книгу «${book.title}» з каталогу?`)) return;

  try {
    await api.remove("books", id);
    if (state.editingBookId === id) resetBookForm();
    showMessage(`Книгу «${book.title}» видалено.`, "success");
    await loadAll();
  } catch (error) {
    showMessage(error.message);
  }
}

// =====================================================================
// 6. Читачі
// =====================================================================

function renderReaders() {
  const query = $("#reader-search").value.trim().toLowerCase();
  const readers = state.readers
    .filter(
      (reader) =>
        !query ||
        reader.fullName.toLowerCase().includes(query) ||
        reader.group.toLowerCase().includes(query) ||
        reader.ticket.toLowerCase().includes(query)
    )
    .sort((a, b) => compareText(a.fullName, b.fullName));

  $("#readers-count").textContent =
    readers.length === state.readers.length
      ? `усього: ${state.readers.length}`
      : `знайдено ${readers.length} з ${state.readers.length}`;

  const tbody = $("#readers-body");
  if (readers.length === 0) {
    const text = state.readers.length === 0 ? "Список читачів порожній" : "Нічого не знайдено";
    tbody.innerHTML = `<tr><td colspan="6" class="muted center">${text}</td></tr>`;
    return;
  }

  tbody.innerHTML = readers
    .map(
      (reader, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(reader.fullName)}</td>
          <td>${escapeHtml(reader.group)}</td>
          <td>${escapeHtml(reader.ticket)}</td>
          <td>${countActiveLoansOfReader(reader.id)}</td>
          <td>
            <div class="actions">
              <button type="button" class="btn btn--small" data-action="edit"
                      data-id="${escapeHtml(reader.id)}">Змінити</button>
              <button type="button" class="btn btn--small btn--danger" data-action="delete"
                      data-id="${escapeHtml(reader.id)}">Видалити</button>
            </div>
          </td>
        </tr>`
    )
    .join("");
}

function resetReaderForm() {
  const form = $("#reader-form");
  form.reset();
  clearFieldErrors(form);
  state.editingReaderId = null;
  $("#reader-form-title").textContent = "Додати читача";
  $("#reader-submit-btn").textContent = "Додати";
}

function startEditReader(id) {
  const reader = state.readers.find((item) => item.id === id);
  if (!reader) return;

  const form = $("#reader-form");
  clearFieldErrors(form);
  state.editingReaderId = id;
  form.elements.fullName.value = reader.fullName;
  form.elements.group.value = reader.group;
  form.elements.ticket.value = reader.ticket;
  $("#reader-form-title").textContent = `Редагувати читача «${reader.fullName}»`;
  $("#reader-submit-btn").textContent = "Зберегти зміни";
  form.scrollIntoView({ behavior: "smooth", block: "center" });
  form.elements.fullName.focus({ preventScroll: true });
}

async function handleReaderSubmit(event) {
  event.preventDefault();
  const form = event.target;

  const data = {
    fullName: form.elements.fullName.value.trim().replace(/\s+/g, " "),
    group: form.elements.group.value.trim(),
    // Латинську C/c, яку легко ввести випадково, не замінюємо — перевірка покаже помилку
    ticket: form.elements.ticket.value.trim().replace(/^ч/, "Ч"),
  };

  const errors = validateReader(data);
  showFieldErrors(form, errors);
  if (Object.keys(errors).length > 0) {
    showMessage("Виправте помилки у формі читача.");
    return;
  }

  setFormBusy(form, true);
  try {
    if (state.editingReaderId) {
      await api.update("readers", state.editingReaderId, data);
      showMessage(`Дані читача «${data.fullName}» збережено.`, "success");
    } else {
      await api.create("readers", data);
      showMessage(`Читача «${data.fullName}» додано.`, "success");
    }
    resetReaderForm();
    await loadAll();
  } catch (error) {
    showMessage(error.message);
  } finally {
    setFormBusy(form, false);
  }
}

async function deleteReader(id) {
  const reader = state.readers.find((item) => item.id === id);
  if (!reader) return;

  const onHands = countActiveLoansOfReader(id);
  if (onHands > 0) {
    showMessage(
      `Не можна видалити читача «${reader.fullName}»: неповернених книг — ${onHands}.`
    );
    return;
  }
  if (!confirm(`Видалити читача «${reader.fullName}»?`)) return;

  try {
    await api.remove("readers", id);
    if (state.editingReaderId === id) resetReaderForm();
    showMessage(`Читача «${reader.fullName}» видалено.`, "success");
    await loadAll();
  } catch (error) {
    showMessage(error.message);
  }
}

// =====================================================================
// 7. Видачі — основна операція
// =====================================================================

const LOAN_STATUS_LABELS = {
  active: `<span class="badge badge--active">на руках</span>`,
  overdue: `<span class="badge badge--overdue">прострочено</span>`,
  returned: `<span class="badge badge--returned">повернено</span>`,
};

function findBookTitle(bookId) {
  const book = state.books.find((item) => item.id === bookId);
  return book ? book.title : "— книгу видалено —";
}

function findReaderName(readerId) {
  const reader = state.readers.find((item) => item.id === readerId);
  return reader ? `${reader.fullName} (${reader.group})` : "— читача видалено —";
}

function renderLoans() {
  const query = $("#loan-search").value.trim().toLowerCase();
  const statusFilter = $("#loan-filter-status").value;

  const loans = state.loans
    .filter((loan) => {
      const status = getLoanStatus(loan);
      // "Активні" включають і прострочені — книга теж на руках
      const matchesStatus =
        !statusFilter ||
        status === statusFilter ||
        (statusFilter === "active" && status === "overdue");
      const text = `${findBookTitle(loan.bookId)} ${findReaderName(loan.readerId)}`.toLowerCase();
      return matchesStatus && (!query || text.includes(query));
    })
    // Спочатку нові видачі
    .sort((a, b) => compareText(b.issueDate, a.issueDate));

  const activeCount = state.loans.filter(isActiveLoan).length;
  const overdueCount = state.loans.filter((loan) => getLoanStatus(loan) === "overdue").length;
  $("#loans-count").textContent = `на руках: ${activeCount}, прострочено: ${overdueCount}`;

  const tbody = $("#loans-body");
  if (loans.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted center">Видач не знайдено</td></tr>`;
    return;
  }

  tbody.innerHTML = loans
    .map((loan, index) => {
      const status = getLoanStatus(loan);
      const returnInfo =
        status === "returned" ? `<br><span class="muted">${formatDate(loan.returnDate)}</span>` : "";
      const action =
        status === "returned"
          ? ""
          : `<button type="button" class="btn btn--small btn--primary" data-action="return"
                     data-id="${escapeHtml(loan.id)}">Повернути</button>`;

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(findBookTitle(loan.bookId))}</td>
          <td>${escapeHtml(findReaderName(loan.readerId))}</td>
          <td>${formatDate(loan.issueDate)}</td>
          <td>${formatDate(loan.dueDate)}</td>
          <td>${LOAN_STATUS_LABELS[status]}${returnInfo}</td>
          <td><div class="actions">${action}</div></td>
        </tr>`;
    })
    .join("");
}

// Заповнити списки книг і читачів у формі видачі
function renderLoanSelects() {
  const bookSelect = $("#loan-book-select");
  const readerSelect = $("#loan-reader-select");
  const selectedBook = bookSelect.value;
  const selectedReader = readerSelect.value;

  const books = [...state.books].sort((a, b) => compareText(a.title, b.title));
  bookSelect.innerHTML =
    `<option value="">— оберіть книгу —</option>` +
    books
      .map((book) => {
        const info = book.available > 0 ? `вільно ${book.available} з ${book.quantity}` : "немає вільних";
        return `<option value="${escapeHtml(book.id)}">${escapeHtml(book.title)} — ${info}</option>`;
      })
      .join("");

  const readers = [...state.readers].sort((a, b) => compareText(a.fullName, b.fullName));
  readerSelect.innerHTML =
    `<option value="">— оберіть читача —</option>` +
    readers
      .map(
        (reader) =>
          `<option value="${escapeHtml(reader.id)}">${escapeHtml(reader.fullName)} — ` +
          `${escapeHtml(reader.group)} (${escapeHtml(reader.ticket)})</option>`
      )
      .join("");

  // Зберегти вибір користувача після оновлення списків
  if (state.books.some((b) => b.id === selectedBook)) bookSelect.value = selectedBook;
  if (state.readers.some((r) => r.id === selectedReader)) readerSelect.value = selectedReader;
}

function resetLoanForm() {
  const form = $("#loan-form");
  form.reset();
  clearFieldErrors(form);
  form.elements.issueDate.value = todayISO();
  form.elements.dueDate.value = addDays(todayISO(), LOAN_DAYS);
}

// Видача книги з перевіркою доступності примірника
async function handleLoanSubmit(event) {
  event.preventDefault();
  const form = event.target;

  const data = {
    bookId: form.elements.bookId.value,
    readerId: form.elements.readerId.value,
    issueDate: form.elements.issueDate.value,
    dueDate: form.elements.dueDate.value,
  };

  const errors = validateLoanForm(data);
  showFieldErrors(form, errors);
  if (Object.keys(errors).length > 0) {
    showMessage("Виправте помилки у формі видачі.");
    return;
  }

  setFormBusy(form, true);
  try {
    // Беремо актуальні дані з сервера, а не з пам'яті сторінки
    const [book, reader, loans] = await Promise.all([
      api.getOne("books", data.bookId),
      api.getOne("readers", data.readerId),
      api.getAll("loans"),
    ]);

    // Головне правило: видати можна лише за наявності вільного примірника
    if (!(book.available > 0)) {
      showFieldErrors(form, { bookId: "Немає вільних примірників." });
      showMessage(`Видачу не виконано: немає вільних примірників книги «${book.title}».`);
      await loadAll();
      return;
    }

    // Читач не може взяти другий примірник тієї самої книги, поки не повернув перший
    const alreadyHas = loans.some(
      (loan) => loan.bookId === book.id && loan.readerId === reader.id && isActiveLoan(loan)
    );
    if (alreadyHas) {
      showFieldErrors(form, { readerId: "Цей читач ще не повернув таку книгу." });
      showMessage(`Видачу не виконано: ${reader.fullName} ще не повернув(ла) «${book.title}».`);
      return;
    }

    // 1) створюємо запис про видачу
    const loan = await api.create("loans", { ...data, returnDate: null });

    // 2) зменшуємо кількість доступних примірників
    try {
      await api.update("books", book.id, { available: book.available - 1 });
    } catch (error) {
      // Якщо книгу оновити не вдалося — скасовуємо видачу, щоб дані не розійшлися
      await api.remove("loans", loan.id).catch(() => {});
      throw error;
    }

    showMessage(
      `Книгу «${book.title}» видано читачу ${reader.fullName} до ${formatDate(data.dueDate)}.`,
      "success"
    );
    resetLoanForm();
    await loadAll();
  } catch (error) {
    showMessage(error.message);
  } finally {
    setFormBusy(form, false);
  }
}

// Повернення книги
async function returnBook(loanId) {
  try {
    const loan = await api.getOne("loans", loanId);
    if (loan.returnDate) {
      showMessage("Цю книгу вже повернено.");
      await loadAll();
      return;
    }

    const book = await api.getOne("books", loan.bookId);

    await api.update("loans", loanId, { returnDate: todayISO() });
    // Доступних примірників не може стати більше, ніж усього
    await api.update("books", book.id, {
      available: Math.min(book.quantity, book.available + 1),
    });

    showMessage(`Книгу «${book.title}» повернено до бібліотеки.`, "success");
    await loadAll();
  } catch (error) {
    showMessage(error.message);
  }
}

// =====================================================================
// 8. Вкладки та обробники подій
// =====================================================================

function showTab(name) {
  document.querySelectorAll(".tabs__btn").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === name);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.hidden = panel.id !== `tab-${name}`;
  });
}

function fillCategorySelects() {
  const options = CATEGORIES.map(
    (category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`
  ).join("");
  $("#book-filter-category").insertAdjacentHTML("beforeend", options);
  $("#book-category-select").insertAdjacentHTML("beforeend", options);
}

function initEvents() {
  // Вкладки
  document.querySelectorAll(".tabs__btn").forEach((button) => {
    button.addEventListener("click", () => showTab(button.dataset.tab));
  });

  // --- Книги ---
  ["#book-search", "#book-filter-category", "#book-filter-available", "#book-sort"].forEach(
    (selector) => {
      $(selector).addEventListener("input", renderBooks);
      $(selector).addEventListener("change", renderBooks);
    }
  );
  $("#book-reset-filters").addEventListener("click", () => {
    $("#book-search").value = "";
    $("#book-filter-category").value = "";
    $("#book-filter-available").checked = false;
    $("#book-sort").value = "title-asc";
    renderBooks();
  });
  $("#book-add-btn").addEventListener("click", () => {
    resetBookForm();
    $("#book-form").scrollIntoView({ behavior: "smooth", block: "center" });
    $("#book-form").elements.title.focus({ preventScroll: true });
  });
  $("#book-form").addEventListener("submit", handleBookSubmit);
  $("#book-cancel-btn").addEventListener("click", resetBookForm);

  // Кнопки в рядках таблиці книг
  $("#books-body").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const { action, id } = button.dataset;

    if (action === "edit") startEditBook(id);
    if (action === "delete") deleteBook(id);
    if (action === "issue") {
      showTab("loans");
      $("#loan-book-select").value = id;
      clearFieldErrors($("#loan-form"));
      $("#loan-reader-select").focus();
    }
  });

  // --- Читачі ---
  $("#reader-search").addEventListener("input", renderReaders);
  $("#reader-add-btn").addEventListener("click", () => {
    resetReaderForm();
    $("#reader-form").scrollIntoView({ behavior: "smooth", block: "center" });
    $("#reader-form").elements.fullName.focus({ preventScroll: true });
  });
  $("#reader-form").addEventListener("submit", handleReaderSubmit);
  $("#reader-cancel-btn").addEventListener("click", resetReaderForm);
  $("#readers-body").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "edit") startEditReader(button.dataset.id);
    if (button.dataset.action === "delete") deleteReader(button.dataset.id);
  });

  // --- Видачі ---
  $("#loan-form").addEventListener("submit", handleLoanSubmit);
  $("#loan-reset-btn").addEventListener("click", resetLoanForm);
  $("#loan-search").addEventListener("input", renderLoans);
  $("#loan-filter-status").addEventListener("change", renderLoans);
  $("#loans-body").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='return']");
    if (button) returnBook(button.dataset.id);
  });

  // Під час видачі автоматично ставимо строк повернення +14 днів від дати видачі
  $("#loan-form").elements.issueDate.addEventListener("change", (event) => {
    if (event.target.value) {
      $("#loan-form").elements.dueDate.value = addDays(event.target.value, LOAN_DAYS);
    }
  });
}

// =====================================================================
// 9. Запуск
// =====================================================================

document.addEventListener("DOMContentLoaded", async () => {
  fillCategorySelects();
  $("#book-year-input").max = new Date().getFullYear();
  resetLoanForm();
  initEvents();
  if (await loadAll()) hideMessage();
});
