// RockRadar Widget.js
const fm=FileManager.iCloud(), cache=fm.joinPath(fm.joinPath(fm.documentsDirectory(),"RockRadar"),"cache.json");
const w=new ListWidget();w.setPadding(12,12,12,12);const h=w.addText("ROCK RADAR");h.font=Font.boldSystemFont(13);w.addSpacer(6);
let d={items:[]};try{if(fm.fileExists(cache)&&fm.isFileStoredIniCloud(cache)&&!fm.isFileDownloaded(cache))await fm.downloadFileFromiCloud(cache);if(fm.fileExists(cache))d=JSON.parse(fm.readString(cache))}catch{}
for(const i of (d.items||[]).filter(x=>!x.isRead).slice(0,config.widgetFamily==="large"?6:3)){const t=w.addText(i.title);t.font=Font.semiboldSystemFont(12);t.lineLimit=2;t.url=i.url;const s=w.addText(`${i.source} · ${i.categories?.[0]||""}`);s.font=Font.systemFont(9);s.textOpacity=.65;w.addSpacer(5)}
w.url="scriptable:///run/RockRadar";w.refreshAfterDate=new Date(Date.now()+3600000);Script.setWidget(w);if(!config.runsInWidget)await w.presentMedium();Script.complete();