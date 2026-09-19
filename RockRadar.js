// RockRadar.js — Scriptable
const fm=FileManager.iCloud();
const base=fm.joinPath(fm.documentsDirectory(),"RockRadar");
if(!fm.fileExists(base)) fm.createDirectory(base,true);
const p=n=>fm.joinPath(base,n);

async function load(n,fallback){
  const x=p(n);
  try{
    if(fm.fileExists(x)&&fm.isFileStoredIniCloud(x)&&!fm.isFileDownloaded(x)) await fm.downloadFileFromiCloud(x);
    return fm.fileExists(x)?JSON.parse(fm.readString(x)):fallback;
  }catch(e){console.error(n,e);return fallback}
}
function save(n,o){fm.writeString(p(n),JSON.stringify(o,null,2))}
const cfg=await load("sources.json",{sources:[]});
const cats=await load("categories.json",{categories:[],genreTags:{},locationTags:{}});
const watch=await load("watched-artists.json",{artists:[],boost:12});
const state=await load("state.json",{read:[],starred:[]});
const old=await load("cache.json",{items:[]});
const cutoff=Date.now()-45*86400000;

const clean=s=>(s||"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/\s+/g," ").trim();
const key=i=>`${i.sourceId}|${i.url||i.title}`.toLowerCase();
const date=v=>{const d=new Date(v);return isNaN(d)?null:d};

async function get(url){
 const r=new Request(url); r.timeoutInterval=20;
 r.headers={"User-Agent":"Mozilla/5.0 (iPhone; CPU iPhone OS like Mac OS X) AppleWebKit/605.1.15"};
 return await r.loadString();
}
function tag(block,names){
 for(const n of names){
   const m=block.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${n}>`,"i"));
   if(m)return clean(m[1]);
 }
 return "";
}
function classify(text,baseTags=[]){
 const h=(" "+text+" ").toLowerCase(), categories=[], tags=new Set(baseTags); let score=0;
 for(const c of cats.categories||[]){
   if(c.enabled===false)continue;
   let hits=0; for(const k of c.keywords||[])if(h.includes(k.toLowerCase()))hits++;
   if(hits){categories.push(c.id);score+=(c.priority||1)*Math.min(hits,3)}
 }
 for(const [t,ks] of Object.entries(cats.genreTags||{}))if(ks.some(k=>h.includes(k.toLowerCase())))tags.add(t);
 for(const [t,ks] of Object.entries(cats.locationTags||{}))if(ks.some(k=>h.includes(k.toLowerCase())))tags.add(t);
 const artists=[];
 for(const a of watch.artists||[])if(h.includes(a.toLowerCase())){artists.push(a);score+=watch.boost||12}
 if(categories.includes("descobertas"))score+=8;
 if(categories.includes("ao-vivo"))score+=6;
 return {categories:categories.length?categories:["noticias"],tags:[...tags],artists,score};
}
function norm(x){
 const c=classify((x.title||"")+" "+(x.summary||""),x.tags||[]);
 return {...x,date:x.date?date(x.date)?.toISOString()||null:null,summary:clean(x.summary||"").slice(0,500),categories:c.categories,tags:c.tags,artists:c.artists,score:c.score+(x.weight||0)};
}
function feed(xml,s){
 const blocks=xml.match(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/gi)||[];
 return blocks.slice(0,20).map(b=>{
   let u=tag(b,["link","guid"]);
   if(!/^https?:/i.test(u)){const m=b.match(/<link\b[^>]*href=["']([^"']+)["']/i);if(m)u=m[1]}
   return norm({sourceId:s.id,source:s.name,sourceType:s.type,title:tag(b,["title"])||"(sem título)",url:u,date:tag(b,["pubDate","published","updated","dc:date"]),summary:tag(b,["description","summary","content:encoded","content"]),tags:s.defaultTags||[],weight:s.weight||0});
 });
}
async function youtube(s){
 let html=await get(s.url), id="";
 for(const re of [/"channelId":"(UC[^"]+)"/,/"externalId":"(UC[^"]+)"/,/youtube\.com\/channel\/(UC[\w-]+)/]){const m=html.match(re);if(m){id=m[1];break}}
 if(!id)return [];
 return feed(await get("https://www.youtube.com/feeds/videos.xml?channel_id="+id),s);
}
function htmlItems(html,s){
 const out=[],seen=new Set(); let m;
 const re=/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
 while((m=re.exec(html))&&out.length<20){
   const t=clean(m[2]); if(t.length<18||t.length>180)continue;
   let u=m[1]; if(u.startsWith("/"))u=(s.site||s.url).match(/^(https?:\/\/[^\/]+)/)?.[1]+u;
   if(!/^https?:/i.test(u)||seen.has(u))continue; seen.add(u);
   out.push(norm({sourceId:s.id,source:s.name,sourceType:s.type,title:t,url:u,date:null,summary:"",tags:s.defaultTags||[],weight:s.weight||0}));
 }
 return out;
}
async function collect(s){
 if(s.enabled===false)return[];
 try{
   if(s.type==="rss")return feed(await get(s.url),s);
   if(s.type==="youtube")return await youtube(s);
   if(s.type==="html-auto")return htmlItems(await get(s.url),s);
   return [];
 }catch(e){console.error(s.name,e);return[]}
}
let fresh=[];
for(const s of cfg.sources||[])fresh.push(...await collect(s));
const map=new Map();
for(const i of [...fresh,...(old.items||[])])if(!map.has(key(i)))map.set(key(i),i);
let items=[...map.values()].filter(i=>!i.date||new Date(i.date)>=cutoff).map(i=>({...i,isRead:(state.read||[]).includes(key(i)),isStarred:(state.starred||[]).includes(key(i))})).sort((a,b)=>(b.isStarred-a.isStarred)||(b.score-a.score)||(new Date(b.date||0)-new Date(a.date||0))).slice(0,180);
save("cache.json",{updatedAt:new Date().toISOString(),items});

const catName=id=>(cats.categories||[]).find(c=>c.id===id)?.name||id;
const menu=new Alert();menu.title="Rock Radar";menu.message=`${items.length} itens`;menu.addAction("🔥 Para mim");
for(const c of (cats.categories||[]).filter(c=>c.enabled!==false))menu.addAction(c.name);
menu.addAction("⭐ Favoritos");menu.addAction("📚 Tudo");menu.addCancelAction("Fechar");
const idx=await menu.presentSheet();
if(idx<0){Script.complete();return}
const enabled=(cats.categories||[]).filter(c=>c.enabled!==false);
let list,title;
if(idx===0){list=items.filter(i=>i.score>=15||i.artists?.length||i.categories.includes("descobertas")||i.categories.includes("ao-vivo"));title="🔥 Para mim"}
else if(idx<=enabled.length){const id=enabled[idx-1].id;list=items.filter(i=>i.categories.includes(id));title=catName(id)}
else if(idx===enabled.length+1){list=items.filter(i=>i.isStarred);title="⭐ Favoritos"}
else{list=items;title="Rock Radar"}
const table=new UITable(); const h=new UITableRow();h.isHeader=true;h.addText(title,`${list.length} itens`);table.addRow(h);
for(const it of list.slice(0,100)){
 const r=new UITableRow();r.height=74;
 const d=it.date?new Date(it.date).toLocaleDateString("pt-BR"):"";
 r.addText(`${it.isStarred?"⭐":it.sourceType==="youtube"?"▶️":"•"} ${it.title}`,[it.source,d,(it.categories||[]).map(catName).slice(0,2).join(" · "),(it.artists||[]).slice(0,2).join(", ")].filter(Boolean).join(" | "));
 r.onSelect=async()=>{const a=new Alert();a.title=it.title;a.message=`${it.source}\n${(it.tags||[]).slice(0,8).join(" #")}`;a.addAction("Abrir");a.addAction(it.isStarred?"Remover favorito":"Favoritar");a.addAction(it.isRead?"Marcar não lido":"Marcar lido");a.addCancelAction("Voltar");const x=await a.presentSheet(),k=key(it);if(x===0&&it.url){Safari.open(it.url);state.read=[...new Set([...(state.read||[]),k])]}if(x===1){const q=new Set(state.starred||[]);it.isStarred?q.delete(k):q.add(k);state.starred=[...q]}if(x===2){const q=new Set(state.read||[]);it.isRead?q.delete(k):q.add(k);state.read=[...q]}save("state.json",state)};
 table.addRow(r);
}
await table.present(false);Script.complete();