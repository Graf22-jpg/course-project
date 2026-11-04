// =====================================================================
// Статуси заявки
// Етап 3: назви статусів і правило прострочення для відображення.
// Етап 4: патерн State — об'єкти-стани з допустимими переходами
//         (див. docs/uml/request-states.png і docs/uml/patterns.png).
// =====================================================================

export const STATUS_LABELS = {
  new: "Нова",
  approved: "Схвалена",
  issued: "Видана",
  returned: "Повернена",
  rejected: "Відхилена",
};

// Видана й строк минув — прострочена (окремо не зберігається, обчислюється)
export function isOverdue(request, today) {
  return request.status === "issued" && Boolean(request.dueDate) && request.dueDate < today;
}
