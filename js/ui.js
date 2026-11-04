// =====================================================================
// Спільні функції інтерфейсу для client.html та admin.html
// =====================================================================

import { escapeHtml } from "./utils.js";
import { STATUS_LABELS, isOverdue } from "./request-state.js";

export const $ = (selector) => document.querySelector(selector);

// ---------- Повідомлення над вмістом ----------
let messageTimer = null;

export function showMessage(text, type = "error") {
  const box = $("#message");
  box.textContent = text;
  box.className = `message message--${type}`;
  box.hidden = false;
  clearTimeout(messageTimer);
  if (type === "success") {
    messageTimer = setTimeout(() => (box.hidden = true), 5000);
  }
}

export function hideMessage() {
  $("#message").hidden = true;
}

// ---------- Стани таблиць: завантаження, порожньо, помилка ----------
function columnsOf(tbody) {
  return tbody.closest("table").querySelectorAll("thead th").length;
}

export function showLoading(tbody) {
  tbody.innerHTML =
    `<tr class="state-row"><td colspan="${columnsOf(tbody)}">` +
    `<span class="spinner" aria-hidden="true"></span>Завантаження…</td></tr>`;
}

export function showEmpty(tbody, text) {
  tbody.innerHTML = `<tr class="state-row"><td colspan="${columnsOf(tbody)}">${escapeHtml(text)}</td></tr>`;
}

export function showLoadError(tbody, text = "Не вдалося завантажити дані") {
  tbody.innerHTML =
    `<tr class="state-row state-row--error"><td colspan="${columnsOf(tbody)}">${escapeHtml(text)}</td></tr>`;
}

// ---------- Помилки біля полів форми ----------
export function showFieldErrors(form, errors) {
  form.querySelectorAll("[data-error-for]").forEach((span) => {
    const field = span.dataset.errorFor;
    const input = form.elements[field];
    span.textContent = errors[field] || "";
    if (input) input.classList.toggle("is-invalid", Boolean(errors[field]));
  });
}

export function clearFieldErrors(form) {
  showFieldErrors(form, {});
}

// Заблокувати кнопки форми на час запиту (захист від подвійного натискання)
export function setFormBusy(form, busy) {
  form.querySelectorAll("button").forEach((button) => (button.disabled = busy));
}

// ---------- Мітка статусу заявки ----------
export function statusBadge(request, today) {
  if (isOverdue(request, today)) {
    return `<span class="badge badge--overdue">прострочена</span>`;
  }
  const label = STATUS_LABELS[request.status] ?? request.status;
  return `<span class="badge badge--${escapeHtml(request.status)}">${escapeHtml(label.toLowerCase())}</span>`;
}

// ---------- Діалог підтвердження ----------
// Повертає Promise<{ confirmed: boolean, reason: string }>
export function confirmDialog({ title, text, confirmLabel = "Підтвердити", danger = false, withReason = false }) {
  const dialog = $("#confirm-dialog");
  const reasonField = $("#confirm-reason-field");
  const reasonInput = $("#confirm-reason");
  const okButton = $("#confirm-ok");

  $("#confirm-title").textContent = title;
  $("#confirm-text").textContent = text;
  okButton.textContent = confirmLabel;
  okButton.className = danger ? "btn btn--danger-solid" : "btn btn--admin";
  reasonField.hidden = !withReason;
  reasonInput.value = "";

  return new Promise((resolve) => {
    const finish = (confirmed) => {
      okButton.removeEventListener("click", onOk);
      $("#confirm-cancel").removeEventListener("click", onCancel);
      dialog.removeEventListener("cancel", onCancel);
      dialog.close();
      resolve({ confirmed, reason: reasonInput.value.trim() });
    };
    const onOk = () => finish(true);
    const onCancel = (event) => {
      event?.preventDefault?.();
      finish(false);
    };
    okButton.addEventListener("click", onOk);
    $("#confirm-cancel").addEventListener("click", onCancel);
    dialog.addEventListener("cancel", onCancel);
    dialog.showModal();
    (withReason ? reasonInput : $("#confirm-cancel")).focus();
  });
}
