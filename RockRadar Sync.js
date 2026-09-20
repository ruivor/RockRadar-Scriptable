// RockRadar Sync.js
// Este sync usa o raw do GitHub e funciona sem token quando o repositório é PÚBLICO.
const RAW_BASE="https://raw.githubusercontent.com/ruivor/RockRadar-Scriptable/main";
const files=["RockRadar.js","sources.json","categories.json","watched-artists.json","RockRadar Widget.js","logger.js","RockRadar Logs.js","RockRadar Sync.js"];
const fm=FileManager.iCloud(),docs=fm.documentsDirectory(),dir=fm.joinPath(docs,"RockRadar");
function syncLog(level,msg){try{const ld=fm.joinPath(dir,"logs");if(!fm.fileExists(ld))fm.createDirectory(ld,true);const lp=fm.joinPath(ld,"rockradar.log");let s=fm.fileExists(lp)?fm.readString(lp):"";s+=`[${new Date().toISOString()}] [${level}] [RockRadar Sync.js] ${msg}\n`;fm.writeString(lp,s.slice(-120000))}catch{}}
if(!fm.fileExists(dir))fm.createDirectory(dir,true);
let ok=0,err=[];
for(const name of files){try{const r=new Request(RAW_BASE+"/"+encodeURIComponent(name).replace(/%2F/g,"/"));r.timeoutInterval=20;const c=await r.loadString();const dest=name.endsWith(".json")?fm.joinPath(dir,name):fm.joinPath(docs,name);fm.writeString(dest,c);ok++;syncLog("INFO","Atualizado: "+name)}catch(e){err.push(name+": "+e);syncLog("ERROR","Falha em "+name+": "+e)}}
syncLog(err.length?"WARN":"INFO",err.length?`${err.length} falha(s) na sincronização`:`Sincronização concluída: ${ok} arquivos`);
const a=new Alert();a.title="Rock Radar Sync";a.message=err.length?`${ok} atualizados. Falhas:\n${err.join("\n")}`:`${ok} arquivos atualizados.`;a.addAction("OK");await a.presentAlert();Script.complete();