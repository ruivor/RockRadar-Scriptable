// RockRadar Sync.js
// Este sync usa o raw do GitHub e funciona sem token quando o repositório é PÚBLICO.
const RAW_BASE="https://raw.githubusercontent.com/ruivor/RockRadar-Scriptable/main";
const files=["RockRadar.js","sources.json","categories.json","watched-artists.json","RockRadar Widget.js"];
const fm=FileManager.iCloud(),docs=fm.documentsDirectory(),dir=fm.joinPath(docs,"RockRadar");
if(!fm.fileExists(dir))fm.createDirectory(dir,true);
let ok=0,err=[];
for(const name of files){try{const r=new Request(RAW_BASE+"/"+encodeURIComponent(name).replace(/%2F/g,"/"));r.timeoutInterval=20;const c=await r.loadString();const dest=name.endsWith(".json")?fm.joinPath(dir,name):fm.joinPath(docs,name);fm.writeString(dest,c);ok++}catch(e){err.push(name+": "+e)}}
const a=new Alert();a.title="Rock Radar Sync";a.message=err.length?`${ok} atualizados. Falhas:\n${err.join("\n")}`:`${ok} arquivos atualizados.`;a.addAction("OK");await a.presentAlert();Script.complete();