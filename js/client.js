// =====================================================================
// Сторінка читача (client.html)
// Каталог → вибір книги → заявка (POST) → перегляд статусу (GET)
// =====================================================================

import { CATEGORIES, MAX_ACTIVE_REQUESTS } from "./config.js";
import { httpRequest } from "./http.js";
import { LibraryRepository, ACTIVE_STATUSES } from "./repository.js";
import { isOverdue } from "./request-state.js";
import { escapeHtml, formatDate, todayISO, compareText } from "./utils.js";
import { validateRequestForm, validateTicket, normalizeTicket, hasErrors } from "./validation.js";
import {
  $, showMessage, hideMessage, showLoading, showEmpty, showLoadError,
  showFieldErrors, clearFieldErrors, setFormBusy, statusBadge,
} from "./ui.js";

const repository = new LibraryRepository(httpRequest);

const state = {
  books: [],
  statusTicket: null, // квиток, для якого показано заявки
};

// =====================================================================
// Каталог книг
// =====================================================================

async function loadBooks() {
  showLoading($("#books-body"));
  try {
    state.books = await repository.getBooks();
    renderBooks();
    renderBookSelect();
    return true;
  } catch (error) {
    state.books = [];
    showLoadError($("#books-body"), "Каталог не завантажено");
    $("#books-count").textContent = "";
    showMessage(error.message);
    return false;
  }
}

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
  const tbody = $("#books-body");

  $("#books-count").textContent =
    books.length === state.books.length
      ? `назв: ${state.books.length}`
      : `знайдено ${books.length} з ${state.books.length}`;

  if (state.books.length === 0) return showEmpty(tbody, "Каталог поки порожній");
  if (books.length === 0) return showEmpty(tbody, "За вашим запитом нічого не знайдено");

  tbody.innerHTML = books
    .map((book) => {
      const inStock = book.available > 0;
      const stock = inStock
        ? `<span class="badge badge--ok">є ${escapeHtml(book.available)} з ${escapeHtml(book.quantity)}</span>`
        : `<span class="badge badge--none">немає</span>`;
      return `
        <tr>
          <td data-label="Назва">${escapeHtml(book.title)}</td>
          <td data-label="Автор">${escapeHtml(book.author)}</td>
          <td data-label="Розділ">${escapeHtml(book.category)}</td>
          <td data-label="Рік">${escapeHtml(book.year)}</td>
          <td data-label="Наявність">${stock}</td>
          <td data-label="Дія">
            <button type="button" class="btn btn--small btn--primary" data-action="choose"
                    data-id="${escapeHtml(book.id)}" ${inStock ? "" : "disabled"}>Замовити</button>
          </td>
        </tr>`;
    })
    .join("");
}

// Список книг у формі: лише ті, що є в наявності
function renderBookSelect() {
  const select = $("#request-book");
  const selected = select.value;
  const books = state.books
    .filter((book) => book.available > 0)
    .sort((a, b) => compareText(a.title, b.title));

  select.innerHTML =
    `<option value="">— оберіть книгу —</option>` +
    books
      .map(
        (book) =>
          `<option value="${escapeHtml(book.id)}">${escapeHtml(book.title)} — ${escapeHtml(book.author)}</option>`
      )
      .join("");
  if (books.some((book) => book.id === selected)) select.value = selected;
}

// =====================================================================
// Заявка (POST /requests)
// =====================================================================

async function handleRequestSubmit(event) {
  event.preventDefault();
  const form = event.target;

  const data = {
    bookId: form.elements.bookId.value,
    ticket: normalizeTicket(form.elements.ticket.value),
    comment: form.elements.comment.value.trim(),
  };

  const errors = validateRequestForm(data);
  showFieldErrors(form, errors);
  if (hasErrors(errors)) {
    showMessage("Перевірте поля форми заявки.");
    return;
  }

  setFormBusy(form, true);
  try {
    // Актуальні дані з сервера: читач, книга і його заявки
    const reader = await repository.findReaderByTicket(data.ticket);
    if (!reader) {
      showFieldErrors(form, { ticket: "Читача з таким квитком не знайдено. Зверніться до бібліотекаря." });
      showMessage("Заявку не створено: читацький квиток не знайдено.");
      return;
    }

    const [book, readerRequests] = await Promise.all([
      repository.getBook(data.bookId),
      repository.getRequestsByReader(reader.id),
    ]);

    if (!(book.available > 0)) {
      showFieldErrors(form, { bookId: "Вільних примірників уже немає." });
      showMessage(`Заявку не створено: немає вільних примірників книги «${book.title}».`);
      await loadBooks();
      return;
    }

    const active = readerRequests.filter((r) => ACTIVE_STATUSES.includes(r.status));
    if (active.some((r) => r.bookId === book.id)) {
      showFieldErrors(form, { bookId: "У вас уже є незавершена заявка на цю книгу." });
      showMessage(`Заявку не створено: у вас уже є заявка на «${book.title}».`);
      return;
    }
    if (active.length >= MAX_ACTIVE_REQUESTS) {
      showFieldErrors(form, { ticket: `Не більше ${MAX_ACTIVE_REQUESTS} активних заявок і книг на руках.` });
      showMessage(`Заявку не створено: досягнуто ліміт — ${MAX_ACTIVE_REQUESTS} книги одночасно.`);
      return;
    }

    const created = await repository.createRequest({
      bookId: book.id,
      readerId: reader.id,
      comment: data.comment,
    });

    // Підтвердження — лише після успішної відповіді сервера
    showMessage(
      `Заявку №${created.id} на книгу «${book.title}» прийнято. Статус: нова. ` +
        `Слідкуйте за статусом у розділі «Мої заявки».`,
      "success"
    );
    form.reset();
    clearFieldErrors(form);
    await showReaderRequests(data.ticket);
  } catch (error) {
    showMessage(error.message);
  } finally {
    setFormBusy(form, false);
  }
}

// =====================================================================
// Статус заявок (повторний GET /requests?readerId=…)
// =====================================================================

function requestDetails(request, today) {
  switch (request.status) {
    case "new":
      return "Очікує розгляду бібліотекарем";
    case "approved":
      return "Книга чекає на вас у бібліотеці";
    case "issued":
      return isOverdue(request, today)
        ? `Строк минув ${formatDate(request.dueDate)} — поверніть книгу`
        : `Повернути до ${formatDate(request.dueDate)}`;
    case "returned":
      return `Повернено ${formatDate(request.returnDate)}`;
    case "rejected":
      return request.rejectReason ? `Причина: ${request.rejectReason}` : "Заявку відхилено";
    default:
      return "";
  }
}

async function showReaderRequests(ticket) {
  const tbody = $("#status-body");
  $("#status-table").hidden = false;
  showLoading(tbody);

  try {
    const reader = await repository.findReaderByTicket(ticket);
    if (!reader) {
      state.statusTicket = null;
      $("#status-refresh").disabled = true;
      $("#status-reader").hidden = true;
      $("#status-table").hidden = true;
      showFieldErrors($("#status-form"), { ticket: "Читача з таким квитком не знайдено." });
      return;
    }

    const [requests, books] = await Promise.all([
      repository.getRequestsByReader(reader.id),
      repository.getBooks(),
    ]);
    state.statusTicket = ticket;
    $("#status-form").elements.ticket.value = ticket;
    $("#status-refresh").disabled = false;

    const info = $("#status-reader");
    info.hidden = false;
    info.textContent = `${reader.fullName}, ${reader.group} · квиток ${reader.ticket} · оновлено о ${new Date().toLocaleTimeString("uk-UA")}`;

    if (requests.length === 0) return showEmpty(tbody, "У вас ще немає заявок");

    const today = todayISO();
    const titleOf = (id) => books.find((b) => b.id === id)?.title ?? "— книгу вилучено з каталогу —";

    tbody.innerHTML = requests
      .sort((a, b) => compareText(b.createdAt, a.createdAt) || Number(b.id) - Number(a.id))
      .map(
        (request) => `
          <tr>
            <td data-label="№">${escapeHtml(request.id)}</td>
            <td data-label="Книга">${escapeHtml(titleOf(request.bookId))}</td>
            <td data-label="Подано" class="nowrap">${formatDate(request.createdAt)}</td>
            <td data-label="Статус">${statusBadge(request, today)}</td>
            <td data-label="Деталі">${escapeHtml(requestDetails(request, today))}</td>
          </tr>`
      )
      .join("");
  } catch (error) {
    showLoadError(tbody, "Не вдалося завантажити заявки");
    showMessage(error.message);
  }
}

function handleStatusSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const ticket = normalizeTicket(form.elements.ticket.value);
  const errors = validateTicket(ticket);
  showFieldErrors(form, errors);
  if (hasErrors(errors)) return;
  hideMessage();
  showReaderRequests(ticket);
}

// =====================================================================
// Події та запуск
// =====================================================================

function initEvents() {
  ["#book-search", "#book-filter-category", "#book-filter-available", "#book-sort"].forEach((sel) => {
    $(sel).addEventListener("input", renderBooks);
    $(sel).addEventListener("change", renderBooks);
  });
  $("#books-refresh").addEventListener("click", async () => {
    if (await loadBooks()) hideMessage();
  });

  // «Замовити» в каталозі підставляє книгу у форму
  $("#books-body").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='choose']");
    if (!button) return;
    $("#request-book").value = button.dataset.id;
    clearFieldErrors($("#request-form"));
    $("#request").scrollIntoView({ behavior: "smooth", block: "start" });
    $("#request-form").elements.ticket.focus({ preventScroll: true });
  });

  $("#request-form").addEventListener("submit", handleRequestSubmit);
  $("#request-form").addEventListener("reset", () => clearFieldErrors($("#request-form")));

  $("#status-form").addEventListener("submit", handleStatusSubmit);
  $("#status-refresh").addEventListener("click", () => {
    if (state.statusTicket) showReaderRequests(state.statusTicket);
  });
}

function fillCategories() {
  $("#book-filter-category").insertAdjacentHTML(
    "beforeend",
    CATEGORIES.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")
  );
}

fillCategories();
initEvents();
loadBooks();
