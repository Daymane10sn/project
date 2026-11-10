const h = React.createElement;
const { useState, useEffect, useRef } = React;
const D = (c, ...k) => h("div", { className: c }, ...k);
const S = (c, ...k) => h("span", { className: c }, ...k);

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
function useStored(key, init) {
  const [v, setV] = useState(() => store.get(key, init));
  const set = (f) => setV((p) => { const n = typeof f === "function" ? f(p) : f; store.set(key, n); return n; });
  return [v, set];
}
const allItems = () => [...store.get("nav_ads", []), ...ITEMS];
const money = (p) => (p ? p.toLocaleString("ru") + " ₽" : "Бесплатно");

function ItemGrid({ items, ctx }) {
  return D("grid3 items", ...items.map((i) => {
    const on = ctx.favs.includes(i.id);
    return h("article", { key: i.id, className: "card item" },
      h("div", { className: "thumb", style: { background: i.bg } }, h("span", { "aria-hidden": "true" }, i.emoji)),
      D("item-body", h("h3", null, i.title), h("p", null, i.sub)),
      D("item-foot", h("b", null, money(i.price)),
        h("button", { className: "heart" + (on ? " on" : ""), "aria-pressed": on, "aria-label": on ? "Убрать из избранного" : "В избранное", onClick: () => ctx.toggleFav(i.id) }, on ? "♥" : "♡")));
  }));
}
