// =====================================================================
// HTTP-клієнт для JSON Server: перевіряє response.ok і перетворює
// будь-яку проблему на зрозумілу ApiError
// =====================================================================

import { API_URL } from "./config.js";
import { ApiError } from "./errors.js";

export async function httpRequest(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    // fetch завершується помилкою, якщо сервер недоступний
    throw new ApiError(
      "Немає зв'язку з JSON Server. Перевірте, чи він запущений: npm run server",
      0
    );
  }

  if (response.status === 404) {
    throw new ApiError("Запис не знайдено — можливо, його вже видалено. Оновіть дані.", 404);
  }
  if (!response.ok) {
    throw new ApiError(`Сервер повернув помилку ${response.status}. Спробуйте ще раз.`, response.status);
  }
  return response.json();
}
