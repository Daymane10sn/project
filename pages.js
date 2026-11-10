// Интерактивные блоки на React. Статичная вёрстка страниц лежит в index.html,
// сюда страницы попадают только в «островки» #ref-root, #agent-root, #market-root, #fav-root, #profile-root.

// общее состояние: пользователь и избранное (хранятся в localStorage)
function useCtx() {
  const [user, setUser] = useStored("nav_user", null);
  const [favs, setFavs] = useStored("nav_favs", []);
  return {
    user, favs,
    setUser: (u) => { setUser(u); window.dispatchEvent(new Event("nav-user")); },
    toggleFav: (id) => setFavs((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id])),
  };
}

// ---------- Справочник ----------
const plural = (n, f) => { const m = n % 10, c = n % 100; return n + " " + (m === 1 && c !== 11 ? f[0] : m >= 2 && m <= 4 && (c < 12 || c > 14) ? f[1] : f[2]); };
const secText = (x) => [x.h, ...(x.p || []), ...(x.list || []), ...(x.rows || []).flat(), ...(x.links || []).map((l) => l.t)].join(" ").toLowerCase();
const xlink = (l) => h("a", { key: l.u, className: "xlink", href: l.u, target: "_blank", rel: "noopener noreferrer" }, l.t + " ↗");

// Статья раздела справочника — открывается прямо в справочнике (#/reference?sec=02)
function RefArticle({ c }) {
  return h("article", { className: "art", style: { "--tone": c.tone, "--tbg": c.bg } },
    h("a", { className: "back", href: "#/reference" }, "← Все разделы"),
    D("art-head", S("num", c.n), h("h2", null, c.title)),
    h("p", { className: "art-intro" }, c.intro),
    ...c.sections.map((sec, i) => h("section", { key: i, className: "art-sec" },
      h("h3", null, sec.h),
      ...(sec.p || []).map((t, j) => h("p", { key: "p" + j }, t)),
      sec.rows && D("rows", ...sec.rows.map(([k, v], j) => h("div", { key: j, className: "row" }, S("k", k), S("v", v)))),
      sec.list && h("ul", null, ...sec.list.map((t, j) => h("li", { key: j }, t))),
      sec.links && D("xlinks", ...sec.links.map(xlink)))),
    D("art-src", S("", "Источники: "), ...c.src.map((l, i) => h("span", { key: l.u }, i ? ", " : "", h("a", { href: l.u, target: "_blank", rel: "noopener noreferrer" }, l.t))),
      h("small", null, "Данные взяты с официальных сайтов ТПУ, актуальны на " + CATS_UPDATED + ". Перед важными действиями проверь их на tpu.ru.")));
}

function Reference({ params }) {
  const [q, setQ] = useState(params.get("q") || "");
  const [tag, setTag] = useState(params.get("tag") || "Все темы");
  const open = CATS.find((c) => c.n === params.get("sec"));
  if (open) return h(RefArticle, { c: open });
  const s = q.trim().toLowerCase();
  const hits = (c) => (s ? c.sections.filter((x) => secText(x).includes(s)) : []);
  const list = CATS.filter((c) => (tag === "Все темы" || c.tag === tag) && (!s || (c.title + " " + c.text + " " + c.kw).toLowerCase().includes(s) || hits(c).length));
  return D("", h("form", { className: "toolbar", role: "search", onSubmit: (e) => e.preventDefault() },
      D("field", S("fi", "⌕"), h("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "Поиск по справочнику: сессия, деканат, стипендия…", "aria-label": "Поиск по справочнику" })),
      h("button", { className: "btn", type: "submit" }, "Найти")),
    h("h2", { className: "h2" }, "Разделы справочника"),
    D("pills", ...TABS.map((t) => h("button", { key: t, className: "pill" + (tag === t ? " on" : ""), onClick: () => setTag(t) }, t))),
    list.length
      ? D("grid3 cats", ...list.map((c) => { const m = hits(c); return h("a", { key: c.n, className: "card cat", href: "#/reference?sec=" + c.n, style: { "--tone": c.tone, "--tbg": c.bg } },
          D("cat-top", S("num", c.n), h("span", null, h("h3", null, c.title), h("p", null, c.text),
            m.length > 0 && h("p", { className: "found" }, "Найдено: " + m.map((x) => x.h).join(" · ")))),
          D("cat-foot", S("", plural(c.sections.length, ["тема", "темы", "тем"])), S("arr", "→"))); }))
      : D("empty", "Ничего не нашлось. Попробуй другое слово или спроси ИИ-агента."));
}

// ---------- ИИ-агент ----------
const answer = (t) => { const x = t.toLowerCase(); const r = KB.find(([re]) => re.test(x)); return r ? [r[1], r[2]] : [FALLBACK]; };
const clock = () => new Date().toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });

function Agent({ params }) {
  const [msgs, setMsgs] = useStored("nav_chat", []);
  const [text, setText] = useState("");
  const box = useRef(null), sent = useRef(false);
  const ask = (t) => {
    if (!t.trim()) return;
    const [a, chips] = answer(t);
    setMsgs((m) => [...m, { from: "me", text: t, time: clock() }]);
    setTimeout(() => setMsgs((m) => [...m, { from: "bot", text: a, chips, time: clock() }]), 500);
  };
  useEffect(() => { const q = params.get("q"); if (q && !sent.current) { sent.current = true; ask(q); } }, []);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [msgs]);
  const all = [{ from: "bot", text: GREETING }, ...msgs];
  return D("chatbox",
        D("chat-head", S("avatar", "✳"), h("span", null, h("b", null, "Нави"), h("small", null, "Онлайн · помощник первокурсника")), S("dot")),
        h("div", { className: "msgs", ref: box, "aria-live": "polite" },
          D("day", "Сегодня"),
          ...all.map((m, i) => h("div", { key: i, className: "msg " + m.from },
            h("p", null, m.text), m.time && h("small", null, m.time),
            m.chips && i === all.length - 1 && D("pills", ...m.chips.map((c) => h("button", { key: c, className: "pill", onClick: () => ask(c) }, c)))))),
        h("form", { className: "composer", onSubmit: (e) => { e.preventDefault(); ask(text); setText(""); } },
          h("input", { value: text, onChange: (e) => setText(e.target.value), placeholder: "Напиши свой вопрос…", "aria-label": "Вопрос агенту" }),
          h("button", { type: "submit", "aria-label": "Отправить" }, "↑")),
        h("p", { className: "note" }, "Ответы носят справочный характер. Проверяй важные детали в официальных источниках."));
}

// ---------- Барахолка ----------
function Market({ params }) {
  const ctx = useCtx();
  const [q, setQ] = useState(""), [cat, setCat] = useState(MARKET_CATS[0]), [sort, setSort] = useState("new");
  const [form, setForm] = useState(false), [draft, setDraft] = useState({ title: "", price: "", cat: "Учёба" });
  const [ads, setAds] = useStored("nav_ads", []);
  const mine = params.get("mine");
  useEffect(() => { const t = () => setForm((f) => !f); window.addEventListener("ad-toggle", t); return () => window.removeEventListener("ad-toggle", t); }, []);
  const s = q.trim().toLowerCase();
  const list = [...ads, ...ITEMS].filter((i) => (!mine || i.mine) && (cat === MARKET_CATS[0] || i.cat === cat) && (!s || (i.title + " " + i.sub).toLowerCase().includes(s)))
    .sort((a, b) => sort === "new" ? b.ord - a.ord : sort === "cheap" ? a.price - b.price : b.price - a.price);
  const post = (e) => {
    e.preventDefault();
    if (!draft.title.trim()) return;
    setAds((a) => [{ id: "u" + Date.now(), title: draft.title.trim(), sub: draft.cat + " · от тебя", price: Math.max(0, +draft.price || 0), cat: draft.cat, emoji: "📦", bg: "#E4EDE4", ord: Date.now(), mine: true }, ...a]);
    setDraft({ title: "", price: "", cat: "Учёба" }); setForm(false);
  };
  const upd = (k) => (e) => setDraft({ ...draft, [k]: e.target.value });
  return D("", form && h("form", { className: "adform", onSubmit: post },
      D("field", h("input", { value: draft.title, onChange: upd("title"), placeholder: "Что продаёшь?", "aria-label": "Название" })),
      D("field", h("input", { value: draft.price, onChange: upd("price"), type: "number", min: "0", placeholder: "Цена, ₽ (0 — бесплатно)", "aria-label": "Цена" })),
      h("select", { className: "select", value: draft.cat, onChange: upd("cat"), "aria-label": "Категория" }, ...MARKET_CATS.slice(1).map((c) => h("option", { key: c }, c))),
      h("button", { className: "btn", type: "submit" }, "Опубликовать")),
    D("mtool",
      D("field", S("fi", "⌕"), h("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "Что ищем? Например, учебник по матанализу", "aria-label": "Поиск по объявлениям" })),
      h("select", { className: "select", value: cat, onChange: (e) => setCat(e.target.value), "aria-label": "Категория" }, ...MARKET_CATS.map((c) => h("option", { key: c }, c))),
      h("select", { className: "select", value: sort, onChange: (e) => setSort(e.target.value), "aria-label": "Сортировка" },
        h("option", { value: "new" }, "Сначала новые"), h("option", { value: "cheap" }, "Сначала дешёвые"), h("option", { value: "dear" }, "Сначала дорогие"))),
    D("sec-head", h("h2", null, "Свежие объявления"), h("span", { style: { fontSize: 12, color: "var(--muted)" } }, list.length + " объявл.")),
    list.length ? h(ItemGrid, { items: list, ctx }) : D("empty", mine ? "У тебя пока нет объявлений." : "Объявлений не найдено."));
}

// ---------- Избранное ----------
function Favorites() {
  const ctx = useCtx();
  const items = allItems().filter((i) => ctx.favs.includes(i.id));
  return items.length ? h(ItemGrid, { items, ctx }) : D("empty", "Пока пусто. Отмечай объявления на ", h("a", { href: "#/market", style: { color: "var(--green)", fontWeight: 700 } }, "барахолке"), ".");
}

// ---------- Профиль ----------
function Profile() {
  const user = store.get("nav_user", null);
  if (!user) return null;
  return D("", D("who", "Ты вошёл как " + (user.name || user.email) + " · " + user.email),
    h("button", { className: "btn", onClick: () => { API.logout(); location.hash = "#/"; } }, "Выйти из аккаунта"));
}

// ---------- Вход и регистрация (отдельные страницы #/login и #/register) ----------
function AuthForm({ mode }) {
  const reg = mode === "register";
  const [f, setF] = useState({ name: "", email: "", password: "", repeat: "" });
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const nm = f.name.trim();
    if (reg && (nm.length < 3 || nm.length > 50)) return setErr("Имя — от 3 до 50 символов");
    if (!/^\S+@\S+\.\S+$/.test(f.email)) return setErr("Введи email в формате name@university.ru");
    if (f.password.length < 6) return setErr("Пароль — минимум 6 символов");
    if (new TextEncoder().encode(f.password).length > 72) return setErr("Пароль слишком длинный — максимум 72 байта (около 36 русских букв)");
    if (reg && f.password !== f.repeat) return setErr("Пароли не совпадают");
    setErr(""); setBusy(true);
    try {
      await (reg ? API.register(f) : API.login(f));
      location.hash = "#/" + (new URLSearchParams(location.hash.split("?")[1]).get("next") || "profile");
    } catch (x) { setErr(x.message); setBusy(false); }
  };
  const field = (k, label, type, ph, ac) => h("label", null, label, h("input", { type, value: f[k], onChange: set(k), placeholder: ph, autoComplete: ac }));
  return h("form", { className: "af", onSubmit: submit, noValidate: true },
    h("h1", null, reg ? "Создать аккаунт" : "С возвращением"),
    h("p", { className: "sub" }, reg ? "Зарегистрируйся, чтобы писать на форуме и публиковать объявления." : "Войди, чтобы писать на форуме и управлять объявлениями."),
    reg && field("name", "Имя или ник", "text", "Будет видно на форуме, 3–50 символов", "username"),
    field("email", "Email университета или почта", "email", "student@university.ru", "email"),
    field("password", "Пароль", "password", "Минимум 6 символов", reg ? "new-password" : "current-password"),
    reg && field("repeat", "Повтори пароль", "password", "Ещё раз пароль", "new-password"),
    err && h("p", { className: "err", role: "alert" }, err),
    h("button", { className: "btn", type: "submit", disabled: busy }, reg ? "Зарегистрироваться" : "Войти"),
    h("p", { className: "alt" }, reg ? "Уже есть аккаунт? " : "Нет аккаунта? ", h("a", { href: reg ? "#/login" : "#/register" }, reg ? "Войти" : "Зарегистрироваться")));
}
const Login = () => h(AuthForm, { mode: "login" });
const Register = () => h(AuthForm, { mode: "register" });

// ---------- Форум ----------
const FORUM_CATS = ["Учёба", "Документы", "Общежитие", "Студенческая жизнь", "Другое"];
const fdate = (t) => new Date(t).toLocaleDateString("ru", { day: "numeric", month: "long" });
const ava = (n) => S("av", (n || "?").trim()[0].toUpperCase());

function Forum() {
  const [topics, setTopics] = useState(null), [q, setQ] = useState(""), [cat, setCat] = useState("Все темы"), [loadErr, setLoadErr] = useState("");
  useEffect(() => { API.listTopics().then(setTopics).catch((x) => { setLoadErr(x.message); setTopics([]); }); }, []);
  const s = q.trim().toLowerCase();
  const list = (topics || []).filter((t) => (cat === "Все темы" || t.category === cat) && (!s || (t.title + " " + t.body).toLowerCase().includes(s)));
  return D("",
    h("form", { className: "toolbar", role: "search", onSubmit: (e) => e.preventDefault() },
      D("field", S("fi", "⌕"), h("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "Поиск по темам форума…", "aria-label": "Поиск по форуму" })),
      h("a", { className: "btn", href: "#/forum-new" }, "＋ Новая тема")),
    D("pills", ...["Все темы", ...FORUM_CATS].map((t) => h("button", { key: t, className: "pill" + (cat === t ? " on" : ""), onClick: () => setCat(t) }, t))),
    topics === null ? D("empty", "Загружаем темы…")
      : loadErr ? D("empty", loadErr)
      : list.length ? D("", ...list.map((t) => h("a", { key: t.id, className: "card topic", href: "#/topic?id=" + t.id },
          ava(t.author),
          h("span", null, h("h3", null, t.title), h("p", null, t.body.slice(0, 140) + (t.body.length > 140 ? "…" : "")),
            D("tmeta", S("tag", t.category), S("", t.author + " · " + fdate(t.created)), S("", "💬 " + t.comments_count))))))
      : D("empty", "Тем не найдено. Будь первым — создай тему!"));
}

function Topic({ params }) {
  const id = params.get("id"), user = store.get("nav_user", null);
  const [t, setT] = useState(undefined), [text, setText] = useState(""), [err, setErr] = useState(""), [loadErr, setLoadErr] = useState("");
  useEffect(() => { API.getTopic(id).then(setT).catch((x) => { setLoadErr(x.message); setT(null); }); }, []);
  if (t === undefined) return D("empty", "Загружаем…");
  if (!t) return D("empty", (loadErr || "Тема не найдена.") + " ", h("a", { href: "#/forum", style: { color: "var(--green)", fontWeight: 700 } }, "К форуму"));
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    try { setT(await API.addComment(id, text.trim())); setText(""); setErr(""); } catch (x) { setErr(x.message); }
  };
  return D("article",
    h("a", { href: "#/forum", className: "back" }, "← Все темы"),
    h("h1", null, t.title),
    D("tmeta", S("tag", t.category), S("", t.author + " · " + fdate(t.created))),
    D("body", t.body),
    h("h2", { className: "h2" }, "Комментарии (" + t.comments.length + ")"),
    ...t.comments.map((c, i) => h("div", { key: i, className: "comment" }, ava(c.author),
      h("span", null, h("b", null, c.author), S("when", " · " + fdate(c.created)), h("p", null, c.body)))),
    user
      ? h("form", { className: "af wide", onSubmit: send },
          h("label", null, "Твой комментарий", h("textarea", { rows: 4, value: text, onChange: (e) => setText(e.target.value), placeholder: "Напиши ответ…" })),
          err && h("p", { className: "err" }, err), h("button", { className: "btn", type: "submit" }, "Отправить"))
      : D("empty", "Чтобы комментировать, ", h("a", { href: "#/login?next=forum", style: { color: "var(--green)", fontWeight: 700 } }, "войди"), " или ", h("a", { href: "#/register?next=forum", style: { color: "var(--green)", fontWeight: 700 } }, "зарегистрируйся"), "."));
}

function NewTopic() {
  const [f, setF] = useState({ title: "", category: FORUM_CATS[0], body: "" }), [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    if (f.title.trim().length < 5) return setErr("Заголовок — минимум 5 символов");
    if (f.body.trim().length < 30) return setErr("Текст статьи — минимум 30 символов");
    try { const t = await API.createTopic(f); location.hash = "#/topic?id=" + t.id; } catch (x) { setErr(x.message); }
  };
  return h("form", { className: "af wide", onSubmit: submit, noValidate: true },
    h("label", null, "Заголовок", h("input", { value: f.title, onChange: set("title"), placeholder: "О чём твоя тема?" })),
    h("label", null, "Раздел", h("select", { value: f.category, onChange: set("category") }, ...FORUM_CATS.map((c) => h("option", { key: c }, c)))),
    h("label", null, "Текст статьи", h("textarea", { rows: 12, value: f.body, onChange: set("body"), placeholder: "Расскажи подробно. Абзацы разделяй пустой строкой." })),
    err && h("p", { className: "err", role: "alert" }, err),
    h("button", { className: "btn", type: "submit" }, "Опубликовать"));
}
