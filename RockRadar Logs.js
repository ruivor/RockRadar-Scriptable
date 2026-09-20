// RockRadar Logs.js
const fm = FileManager.iCloud()
const base = fm.joinPath(fm.documentsDirectory(), "RockRadar")
const logsDir = fm.joinPath(base, "logs")
const logFile = fm.joinPath(logsDir, "rockradar.log")

if (!fm.fileExists(logFile)) {
  const a = new Alert()
  a.title = "Rock Radar Logs"
  a.message = "Ainda não há logs gravados."
  a.addAction("OK")
  await a.presentAlert()
  Script.complete()
  return
}

if (fm.isFileStoredIniCloud(logFile) && !fm.isFileDownloaded(logFile)) {
  await fm.downloadFileFromiCloud(logFile)
}

const content = fm.readString(logFile)
const lines = content.split("\n").filter(Boolean)
const errors = lines.filter(l => l.includes(" [ERROR] "))
const lastError = errors.length ? errors[errors.length - 1] : ""

const menu = new Alert()
menu.title = "Rock Radar Logs"
menu.message = `${lines.length} registros · ${errors.length} erros`
menu.addAction("Ver logs")
menu.addAction("Copiar último erro")
menu.addDestructiveAction("Limpar logs")
menu.addCancelAction("Fechar")
const choice = await menu.presentSheet()

if (choice === 0) {
  const web = new WebView()
  const esc = s => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  body{margin:0;background:#0b0b0c;color:#eee;font-family:-apple-system;padding:18px}
  h1{font-size:24px;margin:0 0 6px}.meta{color:#888;font-size:12px;margin-bottom:16px}
  pre{white-space:pre-wrap;word-break:break-word;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:#151517;border:1px solid #2a2a2f;border-radius:14px;padding:14px}
  .err{color:#ff8c82}.warn{color:#ffd36a}.info{color:#b8d4ff}</style></head><body>
  <h1>Rock Radar Logs</h1><div class="meta">${lines.length} registros · ${errors.length} erros</div>
  <pre>${esc(lines.slice(-250).join("\n")).replace(/\[ERROR\]/g,'<span class="err">[ERROR]</span>').replace(/\[WARN\]/g,'<span class="warn">[WARN]</span>').replace(/\[INFO\]/g,'<span class="info">[INFO]</span>')}</pre>
  </body></html>`
  await web.loadHTML(html)
  await web.present(true)
} else if (choice === 1) {
  Pasteboard.copyString(lastError || "Nenhum ERROR registrado.")
  const a = new Alert()
  a.title = "Copiado"
  a.message = lastError ? "O último erro foi copiado para a área de transferência." : "Não há erro registrado."
  a.addAction("OK")
  await a.presentAlert()
} else if (choice === 2) {
  fm.writeString(logFile, "")
}
Script.complete()
