// =====================================================================
// Типи помилок застосунку
// =====================================================================

// Помилка HTTP-запиту або недоступність сервера
export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status; // 0 — сервер недоступний
  }
}

// Порушення правила предметної області (немає примірників, заборонений перехід тощо)
export class DomainError extends Error {
  constructor(message) {
    super(message);
    this.name = "DomainError";
  }
}
