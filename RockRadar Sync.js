// RockRadar Sync.js
const SYNC_VERSION="1.3.0";
// Este sync usa o raw do GitHub e funciona sem token quando o repositório é PÚBLICO.
const RAW_BASE="https://raw.githubusercontent.com/ruivor/RockRadar-Scriptable/main";
const files=["RockRadar.js","sources.json","categories.json","watched-artists.json","RockRadar Widget.js","logger.js","RockRadar Logs.js","RockRadar Sync.js"];
const fm=FileManager.iCloud(),docs=fm.documentsDirectory(),dir=fm.joinPath(docs,"RockRadar");
function syncLog(level,msg){try{const ld=fm.joinPath(dir,"logs");if(!fm.fileExists(ld))fm.createDirectory(ld,true);const lp=fm.joinPath(ld,"rockradar.log");let s=fm.fileExists(lp)?fm.readString(lp):"";s+=`[${new Date().toISOString()}] [${level}] [RockRadar Sync.js] ${msg}\n`;fm.writeString(lp,s.slice(-120000))}catch{}}
if(!fm.fileExists(dir))fm.createDirectory(dir,true);
let ok=0,err=[];
for(const name of files){try{const r=new Request(RAW_BASE+"/"+encodeURIComponent(name).replace(/%2F/g,"/")+"?cb="+Date.now());r.timeoutInterval=20;const c=await r.loadString();const dest=name.endsWith(".json")?fm.joinPath(dir,name):fm.joinPath(docs,name);fm.writeString(dest,c);if(name==="RockRadar.js"&&!c.includes('const RADAR_VERSION = "2.4.0"'))throw new Error("GitHub retornou RockRadar.js antigo; esperado v2.4.0");ok++;syncLog("INFO","Atualizado: "+name)}catch(e){err.push(name+": "+e);syncLog("ERROR","Falha em "+name+": "+e)}}
syncLog(err.length?"WARN":"INFO",err.length?`${err.length} falha(s) na sincronização`:`Sincronização concluída: ${ok} arquivos`);
const a=new Alert();a.title="Rock Radar Sync v"+SYNC_VERSION;a.message=err.length?`${ok} atualizados. Falhas:\n${err.join("\n")}`:`${ok} arquivos atualizados.\nRock Radar esperado: v2.4.0`;a.addAction("OK");await a.presentAlert();Script.complete();