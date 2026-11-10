// Маршрутизация: страницы лежат в index.html (<main data-page="...">), здесь они только показываются/скрываются.
const ISLANDS = { reference: [Reference, "ref-root"], agent: [Agent, "agent-root"], market: [Market, "market-root"], favorites: [Favorites, "fav-root"], profile: [Profile, "profile-root"], forum: [Forum, "forum-root"], "forum-new": [NewTopic, "new-root"], topic: [Topic, "topic-root"], login: [Login, "login-root"], register: [Register, "register-root"] };
const PROTECTED = ["profile", "forum-new"];            // только для вошедших
const TAB = { "forum-new": "forum", topic: "forum", login: "profile", register: "profile" };
const roots = {};
let navCount = 0;

function syncUser() {
  const u = store.get("nav_user", null);
  document.querySelectorAll("[data-login]").forEach((a) => (a.textContent = u ? "Профиль" : "Войти / Регистрация"));
  document.getElementById("guest-panel").hidden = !!u;
  document.querySelectorAll("[data-account]").forEach((x) => x.setAttribute("href", u ? "#/profile" : "#/login"));
}

function route() {
  const [p, q] = location.hash.replace(/^#\/?/, "").split("?");
  const params = new URLSearchParams(q || "");
  const name = p || "home";
  const signed = !!store.get("nav_user", null);
  if (PROTECTED.includes(name) && !signed) { location.hash = "#/login?next=" + name; return; }
  if (signed && (name === "login" || name === "register")) { location.hash = "#/profile"; return; }
  const page = document.getElementById("page-" + name) ? name : "404";
  document.querySelectorAll("[data-page]").forEach((el) => (el.hidden = el.dataset.page !== page));
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const on = a.dataset.nav === (TAB[page] || page);
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  document.getElementById("market-title").textContent = params.get("mine") ? "Мои объявления." : "Найди нужное рядом.";
  // каждый переход заново монтирует «островок» — состояние читается из localStorage
  for (const k in ISLANDS) {
    const [C, id] = ISLANDS[k];
    roots[k] = roots[k] || ReactDOM.createRoot(document.getElementById(id));
    roots[k].render(k === page ? h(C, { key: ++navCount, params }) : null);
  }
  syncUser();
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", route);
window.addEventListener("nav-user", syncUser);

// поиск на главной -> справочник
document.getElementById("home-search").addEventListener("submit", (e) => {
  e.preventDefault();
  location.hash = "#/reference?q=" + encodeURIComponent(e.target.q.value.trim());
});
// «Разместить объявление»: без входа ведёт в профиль
document.getElementById("ad-btn").addEventListener("click", () => {
  if (store.get("nav_user", null)) window.dispatchEvent(new Event("ad-toggle")); else location.hash = "#/login";
});

route();
// проверяем токен на сервере; если сессия протухла — перерисовываем страницу (закрытые разделы уведут на вход)
API.check().then((ok) => { if (!ok) route(); });
