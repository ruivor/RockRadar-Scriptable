// RockRadar Sync.js
// Sincronizador auto-versionado: version.json é a fonte única de versão.
const SYNC_VERSION="2.0.4";
const RAW_BASE="https://raw.githubusercontent.com/ruivor/RockRadar-Scriptable/main";
const files=["RockRadar.js","sources.json","categories.json","watched-artists.json","RockRadar Widget.js","logger.js","RockRadar Logs.js","RockRadar Spotify.js","version.json"];
const fm=FileManager.iCloud(),docs=fm.documentsDirectory(),dir=fm.joinPath(docs,"RockRadar");
function syncLog(level,msg){try{const ld=fm.joinPath(dir,"logs");if(!fm.fileExists(ld))fm.createDirectory(ld,true);const lp=fm.joinPath(ld,"rockradar.log");let s=fm.fileExists(lp)?fm.readString(lp):"";s+=`[${new Date().toISOString()}] [${level}] [RockRadar Sync.js] ${msg}\n`;fm.writeString(lp,s.slice(-120000))}catch{}}
if(!fm.fileExists(dir))fm.createDirectory(dir,true);

async function raw(name){
  // GitHub Contents API em modo raw: evita CDN e elimina Base64.
  const url="https://api.github.com/repos/ruivor/RockRadar-Scriptable/contents/"+name.split("/").map(encodeURIComponent).join("/")+"?ref=main";
  const r=new Request(url);
  r.timeoutInterval=20;
  r.headers={
    "User-Agent":"RockRadar-Scriptable/"+SYNC_VERSION,
    "Accept":"application/vnd.github.raw+json",
    "Cache-Control":"no-cache"
  };
  const body=await r.loadString();
  const status=r.response&&r.response.statusCode?r.response.statusCode:0;
  if(status<200||status>=300)throw new Error("GitHub API HTTP "+status+" em "+name);
  if(!body)throw new Error("GitHub retornou conteúdo vazio para "+name);
  return body;
}

let manifest={rockRadar:"desconhecida",sync:"desconhecida"};
try{
  const manifestText=await raw("version.json");
  const cleaned=manifestText.trim().replace(/\\\\n+$/,"").trim();
  manifest=JSON.parse(cleaned);
  syncLog("INFO","Manifesto remoto: "+JSON.stringify(manifest)+" via GitHub CDN");
}catch(e){
  syncLog("ERROR","Falha ao ler version.json: "+e);
  const a=new Alert();a.title="Rock Radar Sync v"+SYNC_VERSION;a.message="Não consegui consultar version.json. Nada foi atualizado para evitar mistura de versões.\n\n"+e;a.addAction("OK");await a.presentAlert();Script.complete();return;
}

let ok=0,err=[];
for(const name of files){
  try{
    const body=name==="version.json"?JSON.stringify(manifest,null,2):await raw(name);
    const dest=name.endsWith(".json")?fm.joinPath(dir,name):fm.joinPath(docs,name);
    if(name==="RockRadar Spotify.js" && manifest.spotify && body.indexOf('const SPOTIFY_VERSION="'+manifest.spotify+'"')<0) throw new Error("Spotify baixado não corresponde à v"+manifest.spotify);
    if(name==="RockRadar.js" && !body.includes('const RADAR_VERSION = "'+manifest.rockRadar+'"')){
      const got=body.match(/const RADAR_VERSION\s*=\s*["']([^"']+)/)?.[1]||"desconhecida";
      throw new Error("GitHub API retornou RockRadar v"+got+", mas o manifesto pede v"+manifest.rockRadar);
    }
    fm.writeString(dest,body);
    const check=fm.readString(dest);
    if(check!==body) throw new Error("Falha na verificação após gravação em "+dest);
    ok++;
    syncLog("INFO","Atualizado e verificado: "+name+" -> "+dest);
  }catch(e){
    err.push(name+": "+e);
    syncLog("ERROR","Falha em "+name+": "+e);
  }
}

let localRadar="desconhecida";
try{
  const radar=fm.readString(fm.joinPath(docs,"RockRadar.js"));
  localRadar=radar.match(/const RADAR_VERSION\s*=\s*["']([^"']+)/)?.[1]||"desconhecida";
}catch{}

let localSpotify="desconhecida";
try{
  const sp=fm.readString(fm.joinPath(docs,"RockRadar Spotify.js"));
  const marker='const SPOTIFY_VERSION="';
  const p=sp.indexOf(marker);
  if(p>=0){
    const rest=sp.slice(p+marker.length);
    const q=rest.indexOf('"');
    if(q>=0)localSpotify=rest.slice(0,q);
  }
}catch(e){syncLog("ERROR","Falha ao detectar versão local do Spotify: "+e)}
const matched=localRadar===String(manifest.rockRadar);
const spotifyMatched=!manifest.spotify||localSpotify===String(manifest.spotify);
syncLog(matched?"INFO":"ERROR","Versão local "+localRadar+" / remota "+manifest.rockRadar);
const a=new Alert();
a.title="Rock Radar Sync v"+SYNC_VERSION;
a.message=(err.length?`${ok} atualizados. Falhas:\n${err.join("\n")}\n\n`:`${ok} arquivos atualizados.\n\n`)+
  `GitHub: v${manifest.rockRadar}\niPhone: v${localRadar}\n`+
  (matched?"✓ Radar confere":"⚠ Radar NÃO confere")+"\nSpotify: v"+localSpotify+" / v"+(manifest.spotify||"n/a")+"\n"+(spotifyMatched?"✓ Spotify confere":"⚠ Spotify NÃO confere");

a.addAction("OK");
await a.presentAlert();
Script.complete();
