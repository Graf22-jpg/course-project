// =====================================================================
// Патерн Repository
// Єдиний шар доступу до даних: сторінки викликають предметні операції
// і не знають, які HTTP-запити та адреси за ними стоять.
//
// Етап 3: реалізовано операції читання (GET).
// Етап 4: операції запису — createBook, updateBook, deleteBook,
//         changeAvailability, createReader, updateReader, deleteReader,
//         createRequest, updateRequestStatus.
// =====================================================================

// Статуси, за яких книга зарезервована або на руках (примірник зайнятий)
export const HOLDING_STATUSES = ["approved", "issued"];
// Статуси незавершеної заявки
export const ACTIVE_STATUSES = ["new", "approved", "issued"];

export class LibraryRepository {
  // request — функція виконання HTTP-запиту (httpRequest з http.js)
  constructor(request) {
    this.request = request;
  }

  // ---------------- Книги (пропозиції) ----------------

  getBooks() {
    return this.request("/books");
  }

  getBook(id) {
    return this.request(`/books/${encodeURIComponent(id)}`);
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
}
