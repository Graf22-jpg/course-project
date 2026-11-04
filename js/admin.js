// =====================================================================
// Сторінка бібліотекаря (admin.html)
// Етап 3: заявки, книги й читачі завантажуються через GET (Repository);
// форми перевіряють поля, діалог підтверджує видалення.
// Запис даних (POST, PATCH, DELETE) і патерн State — етап 4.
// =====================================================================

import { CATEGORIES } from "./config.js";
import { httpRequest } from "./http.js";
import { LibraryRepository, ACTIVE_STATUSES, HOLDING_STATUSES } from "./repository.js";
import { isOverdue } from "./request-state.js";
import { escapeHtml, formatDate, todayISO, parseInteger, compareText } from "./utils.js";
import { validateBook, validateReader, normalizeTicket, hasErrors } from "./validation.js";
import {
  $, showMessage, hideMessage, showLoading, showEmpty, showLoadError,
  showFieldErrors, clearFieldErrors, statusBadge, confirmDialog,
} from "./ui.js";

const repository = new LibraryRepository(httpRequest);

const state = {
  books: [],
  readers: [],
  requests: [],
  loaded: false,
  editingBookId: null,
  editingReaderId: null,
};

// =====================================================================
// Завантаження даних (GET)
// =====================================================================

async function loadAll() {
  ["#requests-body", "#books-body", "#readers-body"].forEach((sel) => showLoading($(sel)));
  try {
    const [books, readers, requests] = await Promise.all([
      repository.getBooks(),
      repository.getReaders(),
      repository.getRequests(),
    ]);
    Object.assign(state, { books, readers, requests, loaded: true });
    renderAll();
    return true;
  } catch (error) {
    state.loaded = false;
    ["#requests-body", "#books-body", "#readers-body"].forEach((sel) => showLoadError($(sel)));
    ["#requests-count", "#books-count", "#readers-count"].forEach((sel) => ($(sel).textContent = ""));
    $("#new-count").hidden = true;
    showMessage(error.message);
    return false;
  }
}

function renderAll() {
  renderRequests();
  renderBooks();
  renderReaders();
}

// ---------- Підрахунки за заявками ----------
const findBook = (id) => state.books.find((b) => b.id === id);
const findReader = (id) => state.readers.find((r) => r.id === id);

function countRequests(predicate) {
  return state.requests.filter(predicate).length;
}
const reservedCopies = (bookId) =>
  countRequests((r) => r.bookId === bookId && HOLDING_STATUSES.includes(r.status));
const activeForBook = (bookId) =>
  countRequests((r) => r.bookId === bookId && ACTIVE_STATUSES.includes(r.status));
const activeForReader = (readerId) =>
  countRequests((r) => r.readerId === readerId && ACTIVE_STATUSES.includes(r.status));

// =====================================================================
// Заявки
// =====================================================================

const STATUS_ORDER = { new: 0, approved: 1, issued: 2, returned: 3, rejected: 4 };

function requestDetails(request, today) {
  const parts = [];
  if (request.comment) parts.push(`Коментар: ${request.comment}`);
  if (request.status === "issued") {
    parts.push(
      isOverdue(request, today)
        ? `Строк минув ${formatDate(request.dueDate)}`
        : `Повернути до ${formatDate(request.dueDate)}`
    );
  }
  if (request.status === "returned") parts.push(`Повернено ${formatDate(request.returnDate)}`);
  if (request.status === "rejected" && request.rejectReason) parts.push(`Причина: ${request.rejectReason}`);
  return parts.join(" · ") || "—";
}

function renderRequests() {
  const today = todayISO();
  const query = $("#request-search").value.trim().toLowerCase();
  const filter = $("#request-filter-status").value;

  const newCount = countRequests((r) => r.status === "new");
  $("#new-count").textContent = newCount;
  $("#new-count").hidden = newCount === 0;

  const rows = state.requests
    .filter((request) => {
      const matchesStatus =
        !filter ||
        (filter === "overdue" ? isOverdue(request, today) : request.status === filter);
      const book = findBook(request.bookId);
      const reader = findReader(request.readerId);
      const text = `${book?.title ?? ""} ${reader?.fullName ?? ""} ${reader?.ticket ?? ""}`.toLowerCase();
      return matchesStatus && (!query || text.includes(query));
    })
    .sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        compareText(b.createdAt, a.createdAt) ||
        Number(b.id) - Number(a.id)
    );

  $("#requests-count").textContent = `усього: ${state.requests.length}, нових: ${newCount}`;
  const tbody = $("#requests-body");
  if (state.requests.length === 0) return showEmpty(tbody, "Заявок поки немає");
  if (rows.length === 0) return showEmpty(tbody, "Немає заявок за обраними умовами");

  tbody.innerHTML = rows
    .map((request) => {
      const book = findBook(request.bookId);
      const reader = findReader(request.readerId);
      const actions = ""; // Етап 4: кнопки допустимих переходів (патерн State)

      return `
        <tr>
          <td data-label="№">${escapeHtml(request.id)}</td>
          <td data-label="Подано" class="nowrap">${formatDate(request.createdAt)}</td>
          <td data-label="Книга">${escapeHtml(book ? book.title : "— книгу вилучено —")}</td>
          <td data-label="Читач"><div>${
            reader
              ? `${escapeHtml(reader.fullName)}<br><span class="muted">${escapeHtml(reader.group)} · ${escapeHtml(reader.ticket)}</span>`
              : "— читача видалено —"
          }</div></td>
          <td data-label="Статус">${statusBadge(request, today)}</td>
          <td data-label="Деталі">${escapeHtml(requestDetails(request, today))}</td>
          <td data-label="Дії"><div class="actions">${actions || '<span class="muted">—</span>'}</div></td>
        </tr>`;
    })
    .join("");
}

// =====================================================================
// Книги
// =====================================================================

function getVisibleBooks() {
  const query = $("#book-search").value.trim().toLowerCase();
  const category = $("#book-filter-category").value;
  const onlyAvailable = $("#book-filter-available").checked;
  const [field, order] = $("#book-sort").value.split("-");

  return state.books
    .filter(
      (book) =>
        (!query ||
          book.title.toLowerCase().includes(query) ||
          book.author.toLowerCase().includes(query)) &&
        (!category || book.category === category) &&
        (!onlyAvailable || book.available > 0)
    )
    .sort((a, b) => {
      const diff = field === "year" ? a.year - b.year : compareText(a[field], b[field]);
      return order === "desc" ? -diff : diff;
    });
}

function renderBooks() {
  const books = getVisibleBooks();
  $("#books-count").textContent =
    books.length === state.books.length
      ? `назв: ${state.books.length}`
      : `знайдено ${books.length} з ${state.books.length}`;

  const tbody = $("#books-body");
  if (state.books.length === 0) return showEmpty(tbody, "Каталог порожній — додайте першу книгу");
  if (books.length === 0) return showEmpty(tbody, "Нічого не знайдено");

  tbody.innerHTML = books
    .map((book) => {
      const stock = book.available > 0 ? "badge--ok" : "badge--none";
      return `
        <tr>
          <td data-label="Назва">${escapeHtml(book.title)}</td>
          <td data-label="Автор">${escapeHtml(book.author)}</td>
          <td data-label="Розділ">${escapeHtml(book.category)}</td>
          <td data-label="Рік">${escapeHtml(book.year)}</td>
          <td data-label="Доступно / всього">
            <span class="badge ${stock}">${escapeHtml(book.available)} / ${escapeHtml(book.quantity)}</span>
          </td>
          <td data-label="Дії">
            <div class="actions">
              <button type="button" class="btn btn--small" data-action="edit" data-id="${escapeHtml(book.id)}">Змінити</button>
              <button type="button" class="btn btn--small btn--danger" data-action="delete" data-id="${escapeHtml(book.id)}">Видалити</button>
            </div>
          </td>
        </tr>`;
    })
    .join("");
}

function resetBookForm() {
  const form = $("#book-form");
  form.reset();
  clearFieldErrors(form);
  state.editingBookId = null;
  $("#book-form-title").textContent = "Додати книгу";
  $("#book-submit-btn").textContent = "Додати";
}

function startEditBook(id) {
  const book = findBook(id);
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

async function handleBookSubmit(event) {
  event.preventDefault();
  const form = event.target;
  if (!state.loaded) {
    showMessage("Дані не завантажено — натисніть «Оновити», коли JSON Server запрацює.");
    return;
  }

  const data = {
    title: form.elements.title.value.trim(),
    author: form.elements.author.value.trim(),
    category: form.elements.category.value,
    year: parseInteger(form.elements.year.value),
    quantity: parseInteger(form.elements.quantity.value),
  };
  const editingId = state.editingBookId;
  const reserved = editingId ? reservedCopies(editingId) : 0;

  const errors = validateBook(data, { reservedCount: reserved, books: state.books, editingId });
  showFieldErrors(form, errors);
  if (hasErrors(errors)) {
    showMessage("Виправте помилки у формі книги.");
    return;
  }

  // Етап 4: POST /books або PATCH /books/:id через Repository
  showMessage("Дані книги коректні. Збереження (POST/PATCH) буде підключено на етапі 4.", "info");
}

// Правило: книгу з незавершеними заявками видаляти не можна;
// завершені заявки залишаються в історії з позначкою «книгу вилучено»
async function deleteBook(id) {
  const book = findBook(id);
  if (!book) return;

  const active = activeForBook(id);
  if (active > 0) {
    showMessage(`Не можна видалити «${book.title}»: незавершених заявок — ${active}. Спершу завершіть їх.`);
    return;
  }
  const answer = await confirmDialog({
    title: "Видалити книгу?",
    text: `«${book.title}» буде вилучено з каталогу. Завершені заявки залишаться в історії.`,
    confirmLabel: "Видалити",
    danger: true,
  });
  if (!answer.confirmed) return;

  // Етап 4: DELETE /books/:id через Repository
  showMessage("Видалення (DELETE) буде підключено на етапі 4.", "info");
}

// =====================================================================
// Читачі
// =====================================================================

function renderReaders() {
  const query = $("#reader-search").value.trim().toLowerCase();
  const readers = state.readers
    .filter(
      (r) =>
        !query ||
        r.fullName.toLowerCase().includes(query) ||
        r.group.toLowerCase().includes(query) ||
        r.ticket.toLowerCase().includes(query)
    )
    .sort((a, b) => compareText(a.fullName, b.fullName));

  $("#readers-count").textContent =
    readers.length === state.readers.length
      ? `усього: ${state.readers.length}`
      : `знайдено ${readers.length} з ${state.readers.length}`;

  const tbody = $("#readers-body");
  if (state.readers.length === 0) return showEmpty(tbody, "Список читачів порожній");
  if (readers.length === 0) return showEmpty(tbody, "Нічого не знайдено");

  tbody.innerHTML = readers
    .map(
      (reader) => `
        <tr>
          <td data-label="ПІБ">${escapeHtml(reader.fullName)}</td>
          <td data-label="Група">${escapeHtml(reader.group)}</td>
          <td data-label="Квиток">${escapeHtml(reader.ticket)}</td>
          <td data-label="Активні заявки">${activeForReader(reader.id)}</td>
          <td data-label="Дії">
            <div class="actions">
              <button type="button" class="btn btn--small" data-action="edit" data-id="${escapeHtml(reader.id)}">Змінити</button>
              <button type="button" class="btn btn--small btn--danger" data-action="delete" data-id="${escapeHtml(reader.id)}">Видалити</button>
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
  const reader = findReader(id);
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
  if (!state.loaded) {
    showMessage("Дані не завантажено — натисніть «Оновити», коли JSON Server запрацює.");
    return;
  }

  const data = {
    fullName: form.elements.fullName.value.trim().replace(/\s+/g, " "),
    group: form.elements.group.value.trim(),
    ticket: normalizeTicket(form.elements.ticket.value),
  };
  const errors = validateReader(data, { readers: state.readers, editingId: state.editingReaderId });
  showFieldErrors(form, errors);
  if (hasErrors(errors)) {
    showMessage("Виправте помилки у формі читача.");
    return;
  }

  // Етап 4: POST /readers або PATCH /readers/:id через Repository
  showMessage("Дані читача коректні. Збереження (POST/PATCH) буде підключено на етапі 4.", "info");
}

async function deleteReader(id) {
  const reader = findReader(id);
  if (!reader) return;
  const active = activeForReader(id);
  if (active > 0) {
    showMessage(`Не можна видалити читача «${reader.fullName}»: незавершених заявок — ${active}.`);
    return;
  }
  const answer = await confirmDialog({
    title: "Видалити читача?",
    text: `${reader.fullName} (${reader.ticket}) буде видалено зі списку.`,
    confirmLabel: "Видалити",
    danger: true,
  });
  if (!answer.confirmed) return;

  // Етап 4: DELETE /readers/:id через Repository
  showMessage("Видалення (DELETE) буде підключено на етапі 4.", "info");
}

// =====================================================================
// Вкладки, події, запуск
// =====================================================================

function showTab(name) {
  document.querySelectorAll(".tabs__btn").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach((p) => (p.hidden = p.id !== `tab-${name}`));
}

function initEvents() {
  document.querySelectorAll(".tabs__btn").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  document.querySelectorAll("[data-refresh]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (await loadAll()) hideMessage();
    })
  );

  // Заявки
  $("#request-search").addEventListener("input", renderRequests);
  $("#request-filter-status").addEventListener("change", renderRequests);

  // Книги
  ["#book-search", "#book-filter-category", "#book-filter-available", "#book-sort"].forEach((sel) => {
    $(sel).addEventListener("input", renderBooks);
    $(sel).addEventListener("change", renderBooks);
  });
  $("#book-add-btn").addEventListener("click", () => {
    resetBookForm();
    $("#book-form").scrollIntoView({ behavior: "smooth", block: "center" });
    $("#book-form").elements.title.focus({ preventScroll: true });
  });
  $("#book-form").addEventListener("submit", handleBookSubmit);
  $("#book-cancel-btn").addEventListener("click", resetBookForm);
  $("#books-body").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "edit") startEditBook(button.dataset.id);
    if (button.dataset.action === "delete") deleteBook(button.dataset.id);
  });

  // Читачі
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
}

function fillCategories() {
  const options = CATEGORIES.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  $("#book-filter-category").insertAdjacentHTML("beforeend", options);
  $("#book-category-select").insertAdjacentHTML("beforeend", options);
}

fillCategories();
$("#book-year-input").max = new Date().getFullYear();
initEvents();
loadAll();
