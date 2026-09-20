// RockRadar.js — Scriptable
// UI WebView v2

const fm = FileManager.iCloud()
const base = fm.joinPath(fm.documentsDirectory(), "RockRadar")
if (!fm.fileExists(base)) fm.createDirectory(base, true)
const p = n => fm.joinPath(base, n)

async function load(n, fallback) {
  const x = p(n)
  try {
    if (fm.fileExists(x) && fm.isFileStoredIniCloud(x) && !fm.isFileDownloaded(x)) {
      await fm.downloadFileFromiCloud(x)
    }
    return fm.fileExists(x) ? JSON.parse(fm.readString(x)) : fallback
  } catch (e) {
    console.error(n, e)
    return fallback
  }
}
function save(n, o) { fm.writeString(p(n), JSON.stringify(o, null, 2)) }

const cfg = await load("sources.json", {sources:[]})
const cats = await load("categories.json", {categories:[], genreTags:{}, locationTags:{}})
const watch = await load("watched-artists.json", {artists:[], boost:12})
const state = await load("state.json", {read:[], starred:[]})
const old = await load("cache.json", {items:[]})
const cutoff = Date.now() - 45 * 86400000

const clean = s => (s || "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/\s+/g, " ")
  .trim()

const key = i => `${i.sourceId}|${i.url || i.title}`.toLowerCase()
const parseDate = v => {
  const d = new Date(v)
  return isNaN(d) ? null : d
}
const esc = s => String(s ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;")

async function get(url) {
  const r = new Request(url)
  r.timeoutInterval = 20
  r.headers = {"User-Agent":"Mozilla/5.0 (iPhone; CPU iPhone OS like Mac OS X) AppleWebKit/605.1.15"}
  return await r.loadString()
}

function tag(block, names) {
  for (const n of names) {
    const m = block.match(new RegExp(`<${n}(?:\\\\s[^>]*)?>([\\\\s\\\\S]*?)<\\\\/${n}>`, "i"))
    if (m) return clean(m[1])
  }
  return ""
}

function classify(text, baseTags=[]) {
  const h = (" " + text + " ").toLowerCase()
  const categories = []
  const tags = new Set(baseTags)
  let score = 0

  for (const c of cats.categories || []) {
    if (c.enabled === false) continue
    let hits = 0
    for (const k of c.keywords || []) if (h.includes(k.toLowerCase())) hits++
    if (hits) {
      categories.push(c.id)
      score += (c.priority || 1) * Math.min(hits, 3)
    }
  }

  for (const [t, ks] of Object.entries(cats.genreTags || {})) {
    if (ks.some(k => h.includes(k.toLowerCase()))) tags.add(t)
  }
  for (const [t, ks] of Object.entries(cats.locationTags || {})) {
    if (ks.some(k => h.includes(k.toLowerCase()))) tags.add(t)
  }

  const artists = []
  for (const a of watch.artists || []) {
    if (h.includes(a.toLowerCase())) {
      artists.push(a)
      score += watch.boost || 12
    }
  }

  if (categories.includes("descobertas")) score += 8
  if (categories.includes("ao-vivo")) score += 6

  return {
    categories: categories.length ? categories : ["noticias"],
    tags: [...tags],
    artists,
    score
  }
}

function norm(x) {
  const c = classify((x.title || "") + " " + (x.summary || ""), x.tags || [])
  return {
    ...x,
    date: x.date ? parseDate(x.date)?.toISOString() || null : null,
    summary: clean(x.summary || "").slice(0, 500),
    categories: c.categories,
    tags: c.tags,
    artists: c.artists,
    score: c.score + (x.weight || 0)
  }
}

function feed(xml, s) {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/gi) || []
  return blocks.slice(0, 20).map(b => {
    let u = tag(b, ["link","guid"])
    if (!/^https?:/i.test(u)) {
      const m = b.match(/<link\b[^>]*href=["']([^"']+)["']/i)
      if (m) u = m[1]
    }
    return norm({
      sourceId:s.id,
      source:s.name,
      sourceType:s.type,
      title:tag(b,["title"]) || "(sem título)",
      url:u,
      date:tag(b,["pubDate","published","updated","dc:date"]),
      summary:tag(b,["description","summary","content:encoded","content"]),
      tags:s.defaultTags || [],
      weight:s.weight || 0
    })
  })
}

async function youtube(s) {
  let html = await get(s.url), id = ""
  for (const re of [/"channelId":"(UC[^"]+)"/,/"externalId":"(UC[^"]+)"/,/youtube\.com\/channel\/(UC[\w-]+)/]) {
    const m = html.match(re)
    if (m) { id = m[1]; break }
  }
  if (!id) return []
  return feed(await get("https://www.youtube.com/feeds/videos.xml?channel_id=" + id), s)
}

function htmlItems(html, s) {
  const out = [], seen = new Set()
  let m
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi
  while ((m = re.exec(html)) && out.length < 20) {
    const t = clean(m[2])
    if (t.length < 18 || t.length > 180) continue
    let u = m[1]
    if (u.startsWith("/")) u = (s.site || s.url).match(/^(https?:\/\/[^\/]+)/)?.[1] + u
    if (!/^https?:/i.test(u) || seen.has(u)) continue
    seen.add(u)
    out.push(norm({
      sourceId:s.id, source:s.name, sourceType:s.type,
      title:t, url:u, date:null, summary:"",
      tags:s.defaultTags || [], weight:s.weight || 0
    }))
  }
  return out
}

async function collect(s) {
  if (s.enabled === false) return []
  try {
    if (s.type === "rss") return feed(await get(s.url), s)
    if (s.type === "youtube") return await youtube(s)
    if (s.type === "html-auto") return htmlItems(await get(s.url), s)
    return []
  } catch (e) {
    console.error(s.name, e)
    return []
  }
}

// Ações chamadas pela própria WebView.
const qp = args.queryParameters || {}
if (qp.action && qp.k) {
  const decodedKey = decodeURIComponent(qp.k)
  if (qp.action === "star") {
    const q = new Set(state.starred || [])
    q.has(decodedKey) ? q.delete(decodedKey) : q.add(decodedKey)
    state.starred = [...q]
    save("state.json", state)
  }
  if (qp.action === "open") {
    const q = new Set(state.read || [])
    q.add(decodedKey)
    state.read = [...q]
    save("state.json", state)
    if (qp.url) Safari.open(decodeURIComponent(qp.url))
    Script.complete()
    return
  }
}

let fresh = []
for (const s of cfg.sources || []) fresh.push(...await collect(s))

const map = new Map()
for (const i of [...fresh, ...(old.items || [])]) {
  if (!map.has(key(i))) map.set(key(i), i)
}

let items = [...map.values()]
  .filter(i => !i.date || new Date(i.date) >= cutoff)
  .map(i => ({
    ...i,
    isRead:(state.read || []).includes(key(i)),
    isStarred:(state.starred || []).includes(key(i))
  }))
  .sort((a,b) =>
    (Number(b.isStarred) - Number(a.isStarred)) ||
    ((b.score || 0) - (a.score || 0)) ||
    (new Date(b.date || 0) - new Date(a.date || 0))
  )
  .slice(0, 180)

save("cache.json", {updatedAt:new Date().toISOString(), items})

const catName = id => (cats.categories || []).find(c => c.id === id)?.name || id
const enabledCats = (cats.categories || []).filter(c => c.enabled !== false)

function relativeDate(iso) {
  if (!iso) return ""
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const days = Math.floor(diff / 86400000)
  if (days <= 0) return "Hoje"
  if (days === 1) return "Ontem"
  if (days < 7) return `${days} dias`
  return d.toLocaleDateString("pt-BR", {day:"2-digit", month:"short"})
}

function scriptURL(params) {
  const baseURL = "scriptable:///run/RockRadar"
  const q = Object.entries(params)
    .map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&")
  return baseURL + "?" + q
}

function cardHTML(it) {
  const k = key(it)
  const openURL = scriptURL({action:"open", k, url:it.url || ""})
  const starURL = scriptURL({action:"star", k})
  const catsHTML = (it.categories || []).slice(0, 2)
    .map(c => `<span class="badge category">${esc(catName(c))}</span>`).join("")
  const tagHTML = (it.tags || []).slice(0, 3)
    .map(t => `<span class="badge tag">#${esc(t)}</span>`).join("")
  const artistHTML = (it.artists || []).length
    ? `<div class="artists">${esc(it.artists.slice(0,2).join(" · "))}</div>`
    : ""
  const summary = it.summary
    ? `<div class="summary">${esc(it.summary.slice(0, 190))}</div>`
    : ""
  const typeIcon = it.sourceType === "youtube" ? "▶" : "●"

  return `
    <article class="card ${it.isRead ? "read" : ""}" data-cats="${esc((it.categories||[]).join(" "))}" data-score="${it.score||0}" data-starred="${it.isStarred ? "1":"0"}">
      <div class="card-top">
        <div class="source"><span class="source-dot">${typeIcon}</span>${esc(it.source)}</div>
        <div class="date">${esc(relativeDate(it.date))}</div>
      </div>

      <a class="title-link" href="${esc(openURL)}">
        <h2>${esc(it.title)}</h2>
      </a>

      ${artistHTML}
      ${summary}

      <div class="badges">
        ${catsHTML}
        ${tagHTML}
      </div>

      <div class="card-bottom">
        <span class="score">Afinidade ${Math.max(0, Math.round(it.score || 0))}</span>
        <a class="star" href="${esc(starURL)}">${it.isStarred ? "★" : "☆"}</a>
      </div>
    </article>
  `
}

const totalUnread = items.filter(i => !i.isRead).length
const totalStarred = items.filter(i => i.isStarred).length
const personalCount = items.filter(i => i.score >= 15 || i.artists?.length || i.categories.includes("descobertas") || i.categories.includes("ao-vivo")).length

const chips = [
  {id:"personal", name:"Para mim", count:personalCount},
  ...enabledCats.map(c => ({id:c.id, name:c.name, count:items.filter(i => i.categories.includes(c.id)).length})),
  {id:"starred", name:"Favoritos", count:totalStarred},
  {id:"all", name:"Tudo", count:items.length}
]

const html = `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<style>
:root{
  --bg:#0b0b0c;
  --surface:#151517;
  --surface2:#1d1d20;
  --text:#f5f5f6;
  --muted:#9a9aa1;
  --line:#29292e;
  --accent:#f0a21a;
  --accent2:#ffcb65;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",sans-serif}
body{padding-bottom:42px}
.header{
  position:sticky;top:0;z-index:20;
  padding:calc(env(safe-area-inset-top) + 14px) 18px 12px;
  background:rgba(11,11,12,.94);
  backdrop-filter:blur(18px);
  border-bottom:1px solid var(--line);
}
.brand-row{display:flex;justify-content:space-between;align-items:flex-end;gap:12px}
.eyebrow{font-size:11px;letter-spacing:2.1px;color:var(--accent);font-weight:700;text-transform:uppercase}
h1{font-size:30px;line-height:1;margin:5px 0 0;font-weight:850;letter-spacing:-1.2px}
.stats{text-align:right;color:var(--muted);font-size:12px;line-height:1.4}
.stats strong{color:var(--text)}
.chips{
  display:flex;gap:8px;overflow-x:auto;padding:13px 0 2px;
  scrollbar-width:none;-webkit-overflow-scrolling:touch
}
.chips::-webkit-scrollbar{display:none}
.chip{
  border:1px solid var(--line);background:var(--surface);color:#d7d7db;
  padding:8px 11px;border-radius:999px;white-space:nowrap;font-size:12px;font-weight:650
}
.chip span{opacity:.55;margin-left:4px}
.chip.active{background:var(--text);color:#0d0d0e;border-color:var(--text)}
.feed{padding:14px 14px 0}
.section-title{display:flex;align-items:center;justify-content:space-between;margin:4px 4px 11px;color:var(--muted);font-size:12px}
.card{
  position:relative;background:linear-gradient(180deg,var(--surface2),var(--surface));
  border:1px solid var(--line);border-radius:18px;padding:15px 15px 12px;margin:0 0 12px;
  box-shadow:0 5px 22px rgba(0,0,0,.18)
}
.card:after{
  content:"";position:absolute;left:15px;right:15px;bottom:-7px;height:1px;background:rgba(255,255,255,.025)
}
.card.read{opacity:.58}
.card-top,.card-bottom{display:flex;justify-content:space-between;align-items:center;gap:12px}
.source{font-size:11px;color:#c9c9ce;font-weight:700;letter-spacing:.25px;text-transform:uppercase}
.source-dot{color:var(--accent);margin-right:7px;font-size:9px}
.date{font-size:11px;color:var(--muted)}
.title-link{text-decoration:none;color:inherit}
h2{font-size:20px;line-height:1.16;margin:10px 0 8px;font-weight:780;letter-spacing:-.45px}
.artists{font-size:12px;color:var(--accent2);font-weight:700;margin-bottom:7px}
.summary{font-size:13px;line-height:1.42;color:#b8b8bd;margin-bottom:11px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.badges{display:flex;gap:6px;flex-wrap:wrap;margin:5px 0 12px}
.badge{font-size:10px;font-weight:760;padding:5px 7px;border-radius:7px}
.badge.category{background:rgba(240,162,26,.12);color:#ffc35c;border:1px solid rgba(240,162,26,.18)}
.badge.tag{background:#222226;color:#98989f;border:1px solid #2b2b30}
.card-bottom{border-top:1px solid var(--line);padding-top:10px}
.score{font-size:10px;color:#74747c;text-transform:uppercase;letter-spacing:.7px}
.star{font-size:25px;line-height:1;text-decoration:none;color:var(--accent)}
.empty{text-align:center;color:var(--muted);padding:70px 30px}
.footer{text-align:center;color:#585860;font-size:10px;padding:20px}
</style>
</head>
<body>
<header class="header">
  <div class="brand-row">
    <div>
      <div class="eyebrow">Heavy underground feed</div>
      <h1>ROCK RADAR</h1>
    </div>
    <div class="stats"><strong>${totalUnread}</strong> não lidos<br>${items.length} no radar</div>
  </div>
  <div class="chips">
    ${chips.map((c,i)=>`<button class="chip ${i===0?"active":""}" data-filter="${esc(c.id)}">${esc(c.name)} <span>${c.count}</span></button>`).join("")}
  </div>
</header>

<main class="feed">
  <div class="section-title"><span id="sectionName">Para mim</span><span id="visibleCount"></span></div>
  <div id="cards">
    ${items.map(cardHTML).join("")}
  </div>
  <div class="empty" id="empty" style="display:none">Nada nessa categoria ainda.</div>
</main>
<div class="footer">Rock Radar · dados coletados das fontes configuradas</div>

<script>
const chips=[...document.querySelectorAll('.chip')]
const cards=[...document.querySelectorAll('.card')]
const countEl=document.getElementById('visibleCount')
const nameEl=document.getElementById('sectionName')
const empty=document.getElementById('empty')

function applyFilter(filter, label){
  chips.forEach(c=>c.classList.toggle('active',c.dataset.filter===filter))
  let visible=0
  cards.forEach(card=>{
    const cats=(card.dataset.cats||'').split(' ')
    const score=Number(card.dataset.score||0)
    const starred=card.dataset.starred==='1'
    let show=false
    if(filter==='all') show=true
    else if(filter==='starred') show=starred
    else if(filter==='personal') show=score>=15 || cats.includes('descobertas') || cats.includes('ao-vivo')
    else show=cats.includes(filter)
    card.style.display=show?'block':'none'
    if(show) visible++
  })
  nameEl.textContent=label
  countEl.textContent=visible+' itens'
  empty.style.display=visible?'none':'block'
  window.scrollTo({top:0,behavior:'smooth'})
}
chips.forEach(c=>c.addEventListener('click',()=>applyFilter(c.dataset.filter,c.childNodes[0].textContent.trim())))
applyFilter('personal','Para mim')
</script>
</body>
</html>`

const web = new WebView()
await web.loadHTML(html)
await web.present(true)
Script.complete()
