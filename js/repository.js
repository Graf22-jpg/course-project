// =====================================================================
// Патерн Repository
// Єдиний шар доступу до даних: сторінки викликають предметні операції
// (getBooks, createRequest, updateRequestStatus …) і не знають,
// які HTTP-запити та адреси за ними стоять.
// =====================================================================

import { DomainError } from "./errors.js";
import { todayISO } from "./utils.js";

// Статуси, за яких книга зарезервована або на руках (примірник зайнятий)
export const HOLDING_STATUSES = ["approved", "issued"];
// Статуси незавершеної заявки
export const ACTIVE_STATUSES = ["new", "approved", "issued"];

export class LibraryRepository {
  // request — функція виконання HTTP-запиту (httpRequest з http.js).
  // Її передають ззовні, тому в автотестах можна підставити імітацію сервера.
  constructor(request) {
    this.request = request;
  }

  // Наступний порядковий номер запису ("1", "2", …).
  // Без цього JSON Server 0.17 для рядкових id створює випадкові на зразок "nxMpUzK".
  async nextId(collection) {
    const items = await this.request(`/${collection}`);
    const max = items.reduce((result, item) => Math.max(result, Number(item.id) || 0), 0);
    return String(max + 1);
  }

  // ---------------- Книги (пропозиції) ----------------

  getBooks() {
    return this.request("/books");
  }

  getBook(id) {
    return this.request(`/books/${encodeURIComponent(id)}`);
  }

  // Нова книга: усі примірники доступні
  async createBook(data) {
    const id = await this.nextId("books");
    return this.request("/books", { method: "POST", body: { id, ...data, available: data.quantity } });
  }

  updateBook(id, changes) {
    return this.request(`/books/${encodeURIComponent(id)}`, { method: "PATCH", body: changes });
  }

  deleteBook(id) {
    return this.request(`/books/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  // Змінити кількість доступних примірників на delta (−1 резерв, +1 повернення).
  // Перевіряє головне правило: 0 ≤ available ≤ quantity.
  async changeAvailability(bookId, delta) {
    const book = await this.getBook(bookId);
    const available = book.available + delta;
    if (available < 0) {
      throw new DomainError(`Немає вільних примірників книги «${book.title}».`);
    }
    if (available > book.quantity) {
      throw new DomainError(
        `Доступних примірників книги «${book.title}» не може бути більше, ніж усього (${book.quantity}).`
      );
    }
    return this.updateBook(bookId, { available });
  }

  // ---------------- Читачі ----------------

  getReaders() {
    return this.request("/readers");
  }

  // Пошук читача за номером квитка: GET /readers?ticket=Ч-001
  async findReaderByTicket(ticket) {
    const found = await this.request(`/readers?ticket=${encodeURIComponent(ticket)}`);
    return found.length > 0 ? found[0] : null;
  }

  async createReader(data) {
    const id = await this.nextId("readers");
    return this.request("/readers", { method: "POST", body: { id, ...data } });
  }

  updateReader(id, changes) {
    return this.request(`/readers/${encodeURIComponent(id)}`, { method: "PATCH", body: changes });
  }

  deleteReader(id) {
    return this.request(`/readers/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  // ---------------- Заявки ----------------

  getRequests() {
    return this.request("/requests");
  }

  getRequest(id) {
    return this.request(`/requests/${encodeURIComponent(id)}`);
  }

  // Заявки одного читача: GET /requests?readerId=1
  getRequestsByReader(readerId) {
    return this.request(`/requests?readerId=${encodeURIComponent(readerId)}`);
  }

  // Нова заявка завжди створюється зі статусом "new"
  async createRequest({ bookId, readerId, comment = "" }) {
    const id = await this.nextId("requests");
    return this.request("/requests", {
      method: "POST",
      body: {
        id,
        bookId,
        readerId,
        comment,
        status: "new",
        createdAt: todayISO(),
        decisionDate: null,
        issueDate: null,
        dueDate: null,
        returnDate: null,
        rejectReason: null,
      },
    });
  }

  // Зберегти зміну статусу (поля готує патерн State)
  updateRequestStatus(id, changes) {
    return this.request(`/requests/${encodeURIComponent(id)}`, { method: "PATCH", body: changes });
  }
}
