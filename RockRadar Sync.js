// RockRadar Sync.js
// Sincronizador auto-versionado: version.json é a fonte única de versão.
const SYNC_VERSION="1.6.0";
const RAW_BASE="https://raw.githubusercontent.com/ruivor/RockRadar-Scriptable/main";
const files=["RockRadar.js","sources.json","categories.json","watched-artists.json","RockRadar Widget.js","logger.js","RockRadar Logs.js","RockRadar Spotify.js","RockRadar Sync.js","version.json"];
const fm=FileManager.iCloud(),docs=fm.documentsDirectory(),dir=fm.joinPath(docs,"RockRadar");
function syncLog(level,msg){try{const ld=fm.joinPath(dir,"logs");if(!fm.fileExists(ld))fm.createDirectory(ld,true);const lp=fm.joinPath(ld,"rockradar.log");let s=fm.fileExists(lp)?fm.readString(lp):"";s+=`[${new Date().toISOString()}] [${level}] [RockRadar Sync.js] ${msg}\n`;fm.writeString(lp,s.slice(-120000))}catch{}}
if(!fm.fileExists(dir))fm.createDirectory(dir,true);

async function raw(name){
  // raw.githubusercontent.com pode permanecer em cache no iOS/CDN mesmo com query string.
  // Busca o conteúdo pela API do GitHub, que também permite validar exatamente o commit baixado.
  const api="https://api.github.com/repos/ruivor/RockRadar-Scriptable/contents/"+encodeURIComponent(name).replace(/%2F/g,"/")+"?ref=main&cb="+Date.now();
  const r=new Request(api);
  r.timeoutInterval=20;
  r.headers={"Accept":"application/vnd.github.raw+json","User-Agent":"RockRadar-Scriptable/"+SYNC_VERSION,"Cache-Control":"no-cache"};
  return await r.loadString();
}

let manifest={rockRadar:"desconhecida",sync:"desconhecida"};
try{
  manifest=JSON.parse(await raw("version.json"));
  syncLog("INFO","Manifesto remoto: "+JSON.stringify(manifest)+" via GitHub API");
}catch(e){
  syncLog("ERROR","Falha ao ler version.json: "+e);
  const a=new Alert();a.title="Rock Radar Sync v"+SYNC_VERSION;a.message="Não consegui consultar version.json. Nada foi atualizado para evitar mistura de versões.\n\n"+e;a.addAction("OK");await a.presentAlert();Script.complete();return;
}

let ok=0,err=[];
for(const name of files){
  try{
    const body=name==="version.json"?JSON.stringify(manifest,null,2):await raw(name);
    const dest=name.endsWith(".json")?fm.joinPath(dir,name):fm.joinPath(docs,name);
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

const matched=localRadar===String(manifest.rockRadar);
syncLog(matched?"INFO":"ERROR","Versão local "+localRadar+" / remota "+manifest.rockRadar);
const a=new Alert();
a.title="Rock Radar Sync v"+SYNC_VERSION;
a.message=(err.length?`${ok} atualizados. Falhas:\n${err.join("\n")}\n\n`:`${ok} arquivos atualizados.\n\n`)+
  `GitHub: v${manifest.rockRadar}\niPhone: v${localRadar}\n`+
  (matched?"✓ Versões conferem":"⚠ Versões NÃO conferem");
a.addAction("OK");
await a.presentAlert();
Script.complete();
