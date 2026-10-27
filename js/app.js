// Вебзастосунок обліку та видачі книг бібліотеки коледжу
// Етап 1: завантаження та показ каталогу книг із json-server.

// Адреса навчального API (json-server запускається командою: npx json-server db.json)
const API_URL = "http://localhost:3000";

// ---------- Робота з API ----------

// Отримати колекцію (books, readers, loans) з json-server
async function getCollection(name) {
  const response = await fetch(`${API_URL}/${name}`);
  if (!response.ok) {
    throw new Error(`Сервер повернув помилку ${response.status}`);
  }
  return response.json();
}

// ---------- Допоміжні функції ----------

// Захист від вставлення HTML-коду з даних
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Показати повідомлення над вмістом сторінки
function showMessage(text, type = "error") {
  const box = document.getElementById("message");
  box.textContent = text;
  box.className = `message message--${type}`;
  box.hidden = false;
}

function hideMessage() {
  document.getElementById("message").hidden = true;
}

// ---------- Каталог книг ----------

// Сформувати рядки таблиці книг
function renderBooks(books) {
  const tbody = document.getElementById("books-body");
  const count = document.getElementById("books-count");

  count.textContent = `назв: ${books.length}`;

  if (books.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted center">Каталог порожній</td></tr>`;
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
        </tr>`;
    })
    .join("");
}

async function loadBooks() {
  try {
    const books = await getCollection("books");
    hideMessage();
    renderBooks(books);
  } catch (error) {
    document.getElementById("books-body").innerHTML =
      `<tr><td colspan="7" class="muted center">Дані не завантажено</td></tr>`;
    showMessage(
      "Не вдалося підключитися до json-server. Запустіть у терміналі: npx json-server db.json"
    );
    console.error(error);
  }
}

// ---------- Вкладки ----------

function initTabs() {
  const buttons = document.querySelectorAll(".tabs__btn");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;

      buttons.forEach((b) => b.classList.toggle("is-active", b === button));
      document.querySelectorAll(".tab-panel").forEach((panel) => {
        panel.hidden = panel.id !== `tab-${tab}`;
      });
    });
  });
}

// ---------- Запуск ----------

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  loadBooks();
});
