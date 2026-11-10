// Слой данных. Все методы идут на FastAPI-бэкенд (main.py), данные лежат в app.db.
// Эндпоинты: POST /api/register, POST /api/login, GET /api/me,
//            GET /api/topics, GET /api/topics/:id, POST /api/topics, POST /api/topics/:id/comments
// JWT-токен хранится в localStorage ("nav_token") и подставляется в запросы автоматически.
const TOKEN_KEY = "nav_token";

// хвосты старой localStorage-версии (там были пароли открытым текстом) — чистим
try { localStorage.removeItem("nav_users"); localStorage.removeItem("nav_topics"); } catch (e) {}

async function apiFetch(path, { method = "GET", body, auth = true } = {}) {
  const token = auth ? store.get(TOKEN_KEY, null) : null;
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = "Bearer " + token;
  let res;
  try {
    res = await fetch("/api" + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    throw new Error("Нет связи с сервером. Запусти бэкенд: uvicorn main:app");
  }
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    if (res.status === 401 && token) API._clear(); // токен просрочен или недействителен
    const d = data && data.detail;
    const err = new Error(typeof d === "string" ? d : "Проверь введённые данные");
    err.status = res.status;
    throw err;
  }
  return data;
}

const API = {
  me: () => store.get("nav_user", null),
  _session({ access_token, user }) {
    store.set(TOKEN_KEY, access_token);
    const s = { id: user.id, name: user.username, email: user.email };
    store.set("nav_user", s);
    window.dispatchEvent(new Event("nav-user"));
    return s;
  },
  _clear() {
    store.set(TOKEN_KEY, null);
    store.set("nav_user", null);
    window.dispatchEvent(new Event("nav-user"));
  },
  // проверка сессии при загрузке страницы: false — сессия была, но недействительна (и сброшена)
  async check() {
    const had = !!API.me();
    if (!store.get(TOKEN_KEY, null)) { if (had) API._clear(); return !had; }
    try {
      const u = await apiFetch("/me");
      store.set("nav_user", { id: u.id, name: u.username, email: u.email });
      return true;
    } catch (e) { return e.status !== 401; } // сервер недоступен — сессию не трогаем
  },
  async register({ name, email, password }) {
    return API._session(await apiFetch("/register", { method: "POST", auth: false, body: { username: name.trim(), email: email.trim(), password } }));
  },
  async login({ email, password }) {
    return API._session(await apiFetch("/login", { method: "POST", auth: false, body: { email: email.trim(), password } }));
  },
  logout() { API._clear(); },
  listTopics: () => apiFetch("/topics"),
  async getTopic(id) {
    try { return await apiFetch("/topics/" + encodeURIComponent(id)); }
    catch (e) { if (e.status === 404 || e.status === 422) return null; throw e; }
  },
  async createTopic({ title, category, body }) {
    if (!API.me()) throw new Error("Войди в аккаунт, чтобы создать тему");
    return apiFetch("/topics", { method: "POST", body: { title: title.trim(), category, body: body.trim() } });
  },
  async addComment(id, body) {
    if (!API.me()) throw new Error("Войди в аккаунт, чтобы комментировать");
    return apiFetch("/topics/" + encodeURIComponent(id) + "/comments", { method: "POST", body: { body: body.trim() } });
  },
};
