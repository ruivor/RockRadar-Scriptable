// RockRadar.js — Scriptable
// UI WebView v2
const RADAR_VERSION = "2.11.5"
let log
try {
  const { createLogger } = importModule("logger")
  log = createLogger("RockRadar.js")
} catch (e) {
  log = {
    info:(m,x)=>console.log("[INFO] "+m+(x?" "+JSON.stringify(x):"")),
    warn:(m,x)=>console.warn("[WARN] "+m+(x?" "+JSON.stringify(x):"")),
    error:(m,x)=>console.error("[ERROR] "+m+(x?" "+JSON.stringify(x):""))
  }
}
log.info("Inicialização")

const fm = FileManager.iCloud()
const base = fm.joinPath(fm.documentsDirectory(), "RockRadar")
if (!fm.fileExists(base)) fm.createDirectory(base, true)

// Bootstrap do sincronizador: consulta a versão remota e atualiza o Sync quando necessário.
// Usa um único request à API para resolver o commit e baixa o arquivo por URL imutável.
try {
  const syncPath=fm.joinPath(fm.documentsDirectory(),"RockRadar Sync.js")
  const localSync=fm.fileExists(syncPath)?fm.readString(syncPath):""
  const localSyncVersion=localSync.match(/const SYNC_VERSION=["']([^"']+)/)?.[1]||"0"
  const cr=new Request("https://api.github.com/repos/ruivor/RockRadar-Scriptable/commits/main")
  cr.timeoutInterval=15;cr.headers={"User-Agent":"RockRadar-Scriptable/"+RADAR_VERSION,"Accept":"application/vnd.github+json"}
  const cd=await cr.loadJSON(),cs=cr.response&&cr.response.statusCode?cr.response.statusCode:0
  if(cs>=200&&cs<300&&cd.sha){
    const sr=new Request("https://cdn.jsdelivr.net/gh/ruivor/RockRadar-Scriptable@"+cd.sha+"/RockRadar%20Sync.js")
    sr.timeoutInterval=15
    const fresh=await sr.loadString(),ss=sr.response&&sr.response.statusCode?sr.response.statusCode:0
    const remoteSyncVersion=fresh.match(/const SYNC_VERSION=["']([^"']+)/)?.[1]||"0"
    if(ss>=200&&ss<300&&remoteSyncVersion!=="0"&&remoteSyncVersion!==localSyncVersion){
      fm.writeString(syncPath,fresh)
      if(fm.readString(syncPath)!==fresh)throw new Error("Falha ao verificar Sync gravado")
      log.info("RockRadar Sync atualizado",{de:localSyncVersion,para:remoteSyncVersion})
    }
  } else log.warn("Não foi possível consultar commit para atualizar Sync",{http:cs})
} catch(e){log.warn("Não foi possível atualizar o Sync",{erro:String(e)})}
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
    log.error("Falha ao carregar JSON", {arquivo:n, erro:String(e)})
    return fallback
  }
}
function save(n, o) { fm.writeString(p(n), JSON.stringify(o, null, 2)) }

const cfg = await load("sources.json", {sources:[]})
const cats = await load("categories.json", {categories:[], genreTags:{}, locationTags:{}})
const watch = await load("watched-artists.json", {artists:[], boost:12})
const state = await load("state.json", {read:[], starred:[]})
const spotifyState = await load("spotify-state.json", {added:{}})
const old = await load("cache.json", {items:[]})
const cutoff = Date.now() - 45 * 86400000

function decodeEntities(s) {
  let out = String(s || "")
  const named = {
    amp:"&", lt:"<", gt:">", quot:'"', apos:"'", nbsp:" ",
    ndash:"–", mdash:"—", hellip:"…", rsquo:"’", lsquo:"‘",
    rdquo:"”", ldquo:"“"
  }
  // Alguns feeds (especialmente Blogger) chegam codificados mais de uma vez.
  for (let pass = 0; pass < 3; pass++) {
    const prev = out
    out = out
      .replace(/&#(\d+);/g, (_,n) => {
        try { return String.fromCodePoint(Number(n)) } catch { return _ }
      })
      .replace(/&#x([0-9a-f]+);/gi, (_,n) => {
        try { return String.fromCodePoint(parseInt(n,16)) } catch { return _ }
      })
      .replace(/&([a-z]+);/gi, (m,n) => named[n.toLowerCase()] ?? m)
    if (out === prev) break
  }
  return out
}

const clean = s => {
  let out = String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")

  // Decodifica primeiro para transformar &lt;div&gt; em <div>.
  out = decodeEntities(out)
  out = out
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<img\b[^>]*>/gi, " ")
    .replace(/<a\b[^>]*>/gi, " ")
    .replace(/<\/a>/gi, " ")
    .replace(/<[^>]+>/g, " ")

  // Segunda rodada cobre feeds duplamente codificados.
  out = decodeEntities(out)
  out = out
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")

  // Última proteção: não exibir markup residual como texto no card.
  out = out
    .replace(/&lt;[^&]{0,500}?&gt;/gi, " ")
    .replace(/(?:^|\s)(?:href|src|style|class)=["'][^"']*["']/gi, " ")

  return decodeEntities(out).replace(/\s+/g, " ").trim()
}

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
    const m = block.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${n}>`, "i"))
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

function extractImage(raw) {
  let h = decodeEntities(String(raw || ""))
  const patterns = [
    /<media:content\b[^>]*\burl=["']([^"']+)["'][^>]*>/i,
    /<media:thumbnail\b[^>]*\burl=["']([^"']+)["'][^>]*>/i,
    /<enclosure\b[^>]*\burl=["']([^"']+)["'][^>]*(?:type=["']image\/[^"']+["'])?[^>]*>/i,
    /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i
  ]
  for (const re of patterns) {
    const m = h.match(re)
    if (m && /^https?:\/\//i.test(m[1])) return betterImageURL(m[1])
  }
  return ""
}

function youtubeVideoId(raw, url) {
  const m1 = String(raw || "").match(/<yt:videoId>([^<]+)<\/yt:videoId>/i)
  if (m1) return m1[1].trim()
  const m2 = String(url || "").match(/[?&]v=([\w-]{6,})|youtu\.be\/([\w-]{6,})/)
  return m2 ? (m2[1] || m2[2]) : ""
}

function betterImageURL(url) {
  let u = decodeEntities(String(url || "")).replace(/&amp;/g,"&")
  if (!u) return ""
  // Blogger/Googleusercontent frequentemente entrega miniaturas /s320/, /w400/ etc.
  u = u.replace(/\/s\d+(?:-[a-z])?\//i, "/s1600/")
       .replace(/\/w\d+(?:-h\d+)?(?:-[a-z])?\//i, "/s1600/")
  return u
}

function pageImage(html) {
  const h = String(html || "")
  const patterns = [
    /<meta\b[^>]*property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*property=["']og:image(?::secure_url)?["'][^>]*>/i,
    /<meta\b[^>]*name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src)?["'][^>]*>/i
  ]
  for (const re of patterns) {
    const m=h.match(re)
    if(m) return betterImageURL(m[1])
  }
  return ""
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
      image: extractImage(b),
      videoId: s.type === "youtube" ? youtubeVideoId(b, u) : "",
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
    log.warn("Falha ao coletar fonte", {fonte:s.name, tipo:s.type, url:s.url, erro:String(e)})
    return []
  }
}

// Ações chamadas pela própria WebView.
async function translatePT(text){const input=String(text||"").trim();if(!input)return "";const chunks=[];let rest=input;while(rest.length){let cut=Math.min(3000,rest.length);if(cut<rest.length){const p=rest.lastIndexOf(" ",cut);if(p>1800)cut=p}chunks.push(rest.slice(0,cut));rest=rest.slice(cut).trim()}const out=[];for(const chunk of chunks){const r=new Request("https://pt.libretranslate.com/translate");r.method="POST";r.timeoutInterval=35;r.headers={"Content-Type":"application/json"};r.body=JSON.stringify({q:chunk,source:"auto",target:"pt",format:"text"});const d=await r.loadJSON();if(!d||!d.translatedText)throw new Error((d&&d.error)||"Serviço de tradução não respondeu");out.push(d.translatedText)}return out.join("\n\n")}
function extractArticle(html){let h=String(html||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<nav[\s\S]*?<\/nav>/gi," ").replace(/<footer[\s\S]*?<\/footer>/gi," ");const main=h.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)||h.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);const body=main?main[1]:h,paras=[];let m;const re=/<(?:h1|h2|h3|p|blockquote)\b[^>]*>([\s\S]*?)<\/(?:h1|h2|h3|p|blockquote)>/gi;while((m=re.exec(body))&&paras.length<120){const t=clean(m[1]);if(t.length>25)paras.push(t)}return paras}
async function showReader(url,title,tr){const r=new Request(url);r.timeoutInterval=30;const html=await r.loadString(),paras=extractArticle(html);if(!paras.length){await Safari.openInApp(url,false);return}let shown=paras;if(tr)shown=(await translatePT(paras.join("\n\n"))).split(/\n\n+/);const toggle=scriptURL({action:"reader",url,title:title||"",translate:tr?"0":"1"});const page=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0;background:#0b0b0c;color:#eee;font-family:-apple-system,sans-serif}.bar{position:sticky;top:0;padding:calc(env(safe-area-inset-top) + 10px) 14px 10px;background:#0b0b0cf5;border-bottom:1px solid #29292e}.bar a{color:#f0a21a;text-decoration:none;font-weight:800;font-size:13px;margin-right:18px}.wrap{max-width:760px;margin:auto;padding:22px 20px 60px}h1{font-size:30px;line-height:1.08}p{font-size:18px;line-height:1.62;color:#ddd}.note{font-size:12px;color:#777}</style></head><body><div class="bar"><a href="${esc(toggle)}">${tr?"ORIGINAL":"🇧🇷 TRADUZIR"}</a><a href="${esc(url)}">SITE ORIGINAL</a></div><div class="wrap"><div class="note">${tr?"Tradução automática para português":"Modo leitura"}</div><h1>${esc(title||"Matéria")}</h1>${shown.map(p=>`<p>${esc(p)}</p>`).join("")}</div></body></html>`;const w=new WebView();await w.loadHTML(page,url);await w.present(true)}
const qp = args.queryParameters || {}
const refreshRequested = qp.action === "refresh"
if(qp.action==="reader"&&qp.url){
  try{await showReader(decodeURIComponent(qp.url),decodeURIComponent(qp.title||""),qp.translate==="1")}
  catch(e){const detail={erro:String(e),message:e&&e.message||"",stack:e&&e.stack||"",url:decodeURIComponent(qp.url||"")};log.error("Falha no leitor/tradução",detail);const a=new Alert();a.title="Tradução indisponível";a.message="Não consegui traduzir esta matéria agora.\n\nErro: "+(detail.message||detail.erro);a.addAction("OK");await a.presentAlert()}
  Script.complete();return
}
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
    if (qp.url) {
      const articleURL = decodeURIComponent(qp.url)
      await Safari.openInApp(articleURL, false)
      // Ao fechar a matéria, reabre o agregador automaticamente.
      Safari.open("scriptable:///run/RockRadar")
    }
    Script.complete()
    return
  }
}

let fresh = []
if (refreshRequested || !(old.items || []).length) {
  log.info(refreshRequested ? "Atualização manual iniciada" : "Cache vazio; primeira coleta iniciada")
  for (const s of cfg.sources || []) fresh.push(...await collect(s))

  // Só durante atualização manual buscamos imagens em alta resolução.
  const enrichCandidates = fresh
    .filter(i => i.sourceType !== "youtube" && i.url && /^https?:/i.test(i.url))
    .sort((a,b)=>(b.score||0)-(a.score||0))
    .slice(0,36)
  for (const it of enrichCandidates) {
    try {
      const html = await get(it.url)
      const hi = pageImage(html)
      if (hi) it.image = hi
    } catch(e) {
      log.warn("Falha ao buscar imagem da matéria", {url:it.url, erro:String(e)})
    }
  }
} else {
  log.info("Abrindo diretamente do cache", {itens:(old.items||[]).length, atualizadoEm:old.updatedAt||null})
}

const map = new Map()
for (const i of [...fresh, ...(old.items || [])]) {
  if (!map.has(key(i))) map.set(key(i), i)
}

let items = [...map.values()]
  .filter(i => !i.date || new Date(i.date) >= cutoff)
  .map(i => ({
    ...i,
    title:clean(i.title || ""),
    summary:clean(i.summary || "").slice(0, 500),
    image:betterImageURL(i.image || (i.videoId ? "https://i.ytimg.com/vi/" + i.videoId + "/maxresdefault.jpg" : "")),
    isRead:(state.read || []).includes(key(i)),
    isStarred:(state.starred || []).includes(key(i))
  }))
  .sort((a,b) =>
    (Number(b.isStarred) - Number(a.isStarred)) ||
    ((b.score || 0) - (a.score || 0)) ||
    (new Date(b.date || 0) - new Date(a.date || 0))
  )
  .slice(0, 180)

// "Para mim" é uma curadoria curta, não apenas outro filtro.
// Priorizamos favoritos, artistas monitorados e alta afinidade, com recência como desempate.
const personalRank = it => {
  const ageDays = it.date ? Math.max(0, (Date.now() - new Date(it.date).getTime()) / 86400000) : 30
  const recency = Math.max(0, 12 - ageDays)
  const watched = (it.artists || []).length ? 30 : 0
  const starred = it.isStarred ? 50 : 0
  const discovery = (it.categories || []).includes("descobertas") ? 5 : 0
  const live = (it.categories || []).includes("ao-vivo") ? 4 : 0
  return starred + watched + (it.score || 0) + recency + discovery + live
}

const personalItems = items
  .filter(it =>
    it.isStarred ||
    (it.artists || []).length > 0 ||
    (it.score || 0) >= 24
  )
  .sort((a,b) => personalRank(b) - personalRank(a))
  .slice(0, 24)

const personalKeys = new Set(personalItems.map(key))

const cacheUpdatedAt = (refreshRequested || !(old.items || []).length)
  ? new Date().toISOString()
  : (old.updatedAt || new Date().toISOString())
save("cache.json", {updatedAt:cacheUpdatedAt, items})
log.info(refreshRequested ? "Atualização concluída" : "Cache carregado", {itens:items.length, fontes:(cfg.sources||[]).filter(s=>s.enabled!==false).length})

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

function primaryArtistFromTitle(title) {
  const t=String(title||"").trim()
  const interview=t.match(/^(?:an?\s+)?interview\s+with\s+.+?\b(?:metallers?|rockers?|band|artists?|musicians?)\s+([A-Z0-9][A-Z0-9 &'’.+-]{1,60})$/i)
  if(interview)return interview[1].trim()
  const meet=t.match(/^(?:introducing|meet|interview(?:ing)?|spotlight(?:\s+on)?)\s*[:\-–—]?\s*([A-Z0-9][A-Z0-9 &'’.+-]{1,60})$/i)
  if(meet)return meet[1].trim()
  const patterns=[
    /^([^:–—-]{2,60})\s+(?:premiere|premieres|release|releases|announce|announces|share|shares|unveil|unveils|debut|debuts)\b/i,
    /^(.+?)\s*[-–—:]\s*(.+?)(?:\s*[\[(](?:album\s+)?review[\])]\s*)?$/i
  ]
  for(const re of patterns){const m=t.match(re);if(m)return m[1].trim().replace(/^(review|premiere)\s*:\s*/i,"")}
  return ""
}
function spotifyHint(it) {
  const title=String(it.title||"").trim()
  const artist=primaryArtistFromTitle(title)
  const split=title.match(/^(.+?)\s*[-–—:]\s*(.+)$/)
  let release=split?split[2].trim():title
  release=release.replace(/\s*[\[(](?:album\s+)?review[\])]\s*$/i,"").trim()
  return {artist,release}
}

function cardHTML(it) {
  const k=key(it)
  const openURL=scriptURL({action:"open",k,url:it.url||""})
  const readerURL=scriptURL({action:"reader",url:it.url||"",title:it.title||"",translate:"0"})
  const starURL=scriptURL({action:"star",k})
  const hint=spotifyHint(it)
  const primaryArtist=hint.artist
  const spotifyURL="scriptable:///run/RockRadar%20Spotify?action=add&artist="+encodeURIComponent(primaryArtist)+"&title="+encodeURIComponent(hint.release)
  const spotifyAdded=primaryArtist && Object.values(spotifyState.added||{}).some(x=>String(x.artist||"").toLowerCase()===primaryArtist.toLowerCase())
  const catsHTML=(it.categories||[]).slice(0,2).map(c=>`<span class="badge category">${esc(catName(c))}</span>`).join("")
  const tagHTML=(it.tags||[]).slice(0,3).map(t=>`<span class="badge tag">#${esc(t)}</span>`).join("")
  const artistHTML=primaryArtist?`<div class="artists">${esc(primaryArtist)}</div>`:""
  const summary=it.summary?`<div class="summary">${esc(it.summary.slice(0,190))}</div>`:""
  const typeIcon=it.sourceType==="youtube"?"▶":"●"
  const mediaURL=it.videoId?"https://i.ytimg.com/vi/"+it.videoId+"/maxresdefault.jpg":(it.image||"")
  const mediaHTML=mediaURL?`<a class="media-link" href="${esc(openURL)}"><div class="media"><img loading="lazy" src="${esc(mediaURL)}" alt="" referrerpolicy="no-referrer"><span class="media-fallback">ROCK RADAR</span>${it.sourceType==="youtube"?'<span class="play">▶</span>':""}</div></a>`:""
  return `
    <article class="card ${it.isRead?"read":""}" data-cats="${esc((it.categories||[]).join(" "))}" data-score="${it.score||0}" data-starred="${it.isStarred?"1":"0"}" data-personal="${personalKeys.has(k)?"1":"0"}">
      <div class="card-top"><div class="source"><span class="source-dot">${typeIcon}</span>${esc(it.source)}</div><div class="date">${esc(relativeDate(it.date))}</div></div>
      ${mediaHTML}
      <a class="title-link" href="${esc(openURL)}"><h2>${esc(it.title)}</h2></a>
      ${artistHTML}${summary}
      <div class="badges">${catsHTML}${tagHTML}</div>
      <div class="card-bottom"><span class="score">Afinidade ${Math.max(0,Math.round(it.score||0))}</span><div class="card-actions"><a class="spotify-add" href="${esc(readerURL)}">LER / 🇧🇷</a><a class="spotify-add ${spotifyAdded?"added":""}" href="${esc(spotifyURL)}">${spotifyAdded?"✓ NO SPOTIFY":"＋ SPOTIFY"}</a><a class="star" href="${esc(starURL)}">${it.isStarred?"★":"☆"}</a></div></div>
    </article>`
}

const totalUnread = items.filter(i => !i.isRead).length
const totalStarred = items.filter(i => i.isStarred).length
const personalCount = personalItems.length

const refreshURL = scriptURL({action:"refresh"})
function updatedLabel(iso) {
  if (!iso) return "Nunca atualizado"
  const d = new Date(iso), ms = Date.now()-d.getTime()
  const min = Math.max(0, Math.floor(ms/60000))
  if (min < 1) return "Atualizado agora"
  if (min < 60) return "Atualizado há " + min + " min"
  const h = Math.floor(min/60)
  if (h < 24) return "Atualizado há " + h + "h"
  const days = Math.floor(h/24)
  return "Atualizado há " + days + (days===1 ? " dia" : " dias")
}

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
h1{font-size:30px;line-height:1;margin:5px 0 0;font-weight:850;letter-spacing:-1.2px}\n.brand-version{margin-top:7px;font-size:10px;letter-spacing:1.2px;color:#6f6f77;font-weight:650}
.stats{text-align:right;color:var(--muted);font-size:12px;line-height:1.4}
.stats strong{color:var(--text)}
.refresh{display:inline-block;margin-top:6px;color:var(--accent);text-decoration:none;font-size:10px;font-weight:800;letter-spacing:.7px;padding:5px 8px;border:1px solid rgba(240,162,26,.3);border-radius:999px;background:rgba(240,162,26,.08)}
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
.media-link{display:block;text-decoration:none;margin:12px -15px 0}
.media{position:relative;width:100%;aspect-ratio:16/9;background:#101012;overflow:hidden;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.media img{position:relative;z-index:2;width:100%;height:100%;display:block;object-fit:cover}
.media-fallback{position:absolute;z-index:1;inset:0;display:flex;align-items:center;justify-content:center;color:#3f3f45;font-size:11px;letter-spacing:2px;font-weight:800}
.play{position:absolute;z-index:3;left:50%;top:50%;transform:translate(-50%,-50%);width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;padding-left:4px;background:rgba(0,0,0,.72);border:1px solid rgba(255,255,255,.45);color:white;font-size:22px;box-shadow:0 5px 18px rgba(0,0,0,.35)}
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
.card-actions{display:flex;align-items:center;gap:12px}\n.spotify-add.added{opacity:.65}\n.spotify-add{font-size:10px;font-weight:800;letter-spacing:.6px;text-decoration:none;color:var(--accent);border:1px solid rgba(240,162,26,.3);border-radius:999px;padding:6px 9px;background:rgba(240,162,26,.08)}\n.star{font-size:25px;line-height:1;text-decoration:none;color:var(--accent)}
.empty{text-align:center;color:var(--muted);padding:70px 30px}
.footer{text-align:center;color:#585860;font-size:10px;padding:20px}

</style>
</head>
<body>
<header class="header">
  <div class="brand-row">
    <div>
      <div class="eyebrow">Heavy underground feed</div>
      <h1>ROCK RADAR</h1>\n      <div class="brand-version">VERSÃO ${RADAR_VERSION} · ${esc(updatedLabel(cacheUpdatedAt))}</div>
    </div>
    <div class="stats"><strong>${totalUnread}</strong> não lidos<br>${items.length} no radar<br><a class="refresh" href="${esc(refreshURL)}">↻ ATUALIZAR</a></div>
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
<div class="version">v${RADAR_VERSION}</div>

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
    else if(filter==='personal') show=card.dataset.personal==='1'
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
try {
  await web.present(true)
  log.info("WebView encerrada normalmente")
} catch (e) {
  log.error("Falha ao apresentar WebView", {erro:String(e), stack:e.stack||""})
  throw e
}
Script.complete()
