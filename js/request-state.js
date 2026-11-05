// =====================================================================
// Патерн State (GoF)
// Кожен статус заявки — окремий об'єкт-стан, який знає:
//   • у які статуси з нього можна перейти;
//   • які поля заявки змінюються під час переходу;
//   • як змінюється кількість доступних примірників книги.
// Контекст RequestStatusContext делегує зміну статусу поточному стану.
//
//   new ──► approved ──► issued ──► returned
//    │          │
//    └──► rejected ◄──┘
// =====================================================================

import { LOAN_DAYS } from "./config.js";
import { DomainError } from "./errors.js";
import { addDays } from "./utils.js";

export const STATUS_LABELS = {
  new: "Нова",
  approved: "Схвалена",
  issued: "Видана",
  returned: "Повернена",
  rejected: "Відхилена",
};

// Підписи кнопок для переходу В статус
export const ACTION_LABELS = {
  approved: "Схвалити",
  issued: "Видати",
  returned: "Прийняти повернення",
  rejected: "Відхилити",
};

export class TransitionError extends DomainError {
  constructor(message) {
    super(message);
    this.name = "TransitionError";
  }
}

// ---------- Абстрактний стан ----------
class RequestState {
  constructor(code) {
    this.code = code;
  }

  get label() {
    return STATUS_LABELS[this.code];
  }

  // Список статусів, у які дозволено перейти
  nextStatuses() {
    return [];
  }

  canChangeTo(next) {
    return this.nextStatuses().includes(next);
  }

  // Перевірити перехід і повернути { changes, stockDelta }
  changeTo(next, context) {
    if (!this.canChangeTo(next)) {
      const target = STATUS_LABELS[next] ?? next;
      throw new TransitionError(`Заявку зі статусом «${this.label}» не можна перевести в «${target}».`);
    }
    return this.buildChange(next, context);
  }

  // Конкретні стани визначають, що змінюється
  buildChange() {
    throw new Error("Метод buildChange має бути визначений у конкретному стані");
  }
}

// ---------- Конкретні стани ----------

// Нова: бібліотекар схвалює (резервує примірник) або відхиляє
class NewState extends RequestState {
  constructor() {
    super("new");
  }

  nextStatuses() {
    return ["approved", "rejected"];
  }

  buildChange(next, { book, today, reason }) {
    if (next === "approved") {
      if (!book || !(book.available > 0)) {
        throw new TransitionError("Схвалити не можна: немає вільних примірників книги.");
      }
      return { changes: { status: "approved", decisionDate: today }, stockDelta: -1 };
    }
    return {
      changes: { status: "rejected", decisionDate: today, rejectReason: reason || null },
      stockDelta: 0,
    };
  }
}

// Схвалена: книгу відкладено; її видають або скасовують резерв
class ApprovedState extends RequestState {
  constructor() {
    super("approved");
  }

  nextStatuses() {
    return ["issued", "rejected"];
  }

  buildChange(next, { today, reason }) {
    if (next === "issued") {
      return {
        changes: { status: "issued", issueDate: today, dueDate: addDays(today, LOAN_DAYS) },
        stockDelta: 0, // примірник уже зарезервовано під час схвалення
      };
    }
    // Відмова після схвалення повертає зарезервований примірник
    return { changes: { status: "rejected", rejectReason: reason || null }, stockDelta: +1 };
  }
}

// Видана: єдиний можливий перехід — повернення
class IssuedState extends RequestState {
  constructor() {
    super("issued");
  }

  nextStatuses() {
    return ["returned"];
  }

  buildChange(next, { today }) {
    return { changes: { status: "returned", returnDate: today }, stockDelta: +1 };
  }
}

// Кінцеві стани: переходів немає
class ReturnedState extends RequestState {
  constructor() {
    super("returned");
  }
}

class RejectedState extends RequestState {
  constructor() {
    super("rejected");
  }
}

const STATES = {
  new: new NewState(),
  approved: new ApprovedState(),
  issued: new IssuedState(),
  returned: new ReturnedState(),
  rejected: new RejectedState(),
};

export function getState(code) {
  const state = STATES[code];
  if (!state) throw new TransitionError(`Невідомий статус заявки: «${code}».`);
  return state;
}

// ---------- Контекст ----------
export class RequestStatusContext {
  constructor(request) {
    this.request = request;
    this.state = getState(request.status);
  }

  get status() {
    return this.state.code;
  }

  // Які дії доступні зараз (для кнопок на сторінці адміністратора)
  availableActions() {
    return this.state.nextStatuses();
  }

  // Делегує перевірку й підготовку змін поточному стану, потім змінює стан
  changeTo(next, { book = null, today, reason = "" } = {}) {
    const result = this.state.changeTo(next, { book, today, reason });
    this.state = getState(next);
    this.request = { ...this.request, ...result.changes };
    return result;
  }
}

// Видана й строк минув — прострочена (окремо не зберігається, обчислюється)
export function isOverdue(request, today) {
  return request.status === "issued" && Boolean(request.dueDate) && request.dueDate < today;
}
