// logger.js — Rock Radar shared logger
module.exports.createLogger = function(scriptName) {
  const fm = FileManager.iCloud()
  const base = fm.joinPath(fm.documentsDirectory(), "RockRadar")
  const logsDir = fm.joinPath(base, "logs")
  if (!fm.fileExists(base)) fm.createDirectory(base, true)
  if (!fm.fileExists(logsDir)) fm.createDirectory(logsDir, true)
  const logFile = fm.joinPath(logsDir, "rockradar.log")
  const maxChars = 120000

  function stamp() {
    const d = new Date()
    const pad = n => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  function stringifyMeta(meta) {
    if (meta == null) return ""
    try { return typeof meta === "string" ? meta : JSON.stringify(meta) }
    catch { return String(meta) }
  }

  function write(level, message, meta) {
    try {
      const detail = stringifyMeta(meta)
      const line = `[${stamp()}] [${level}] [${scriptName}] ${message}${detail ? " | " + detail : ""}\n`
      let existing = fm.fileExists(logFile) ? fm.readString(logFile) : ""
      existing += line
      if (existing.length > maxChars) existing = existing.slice(existing.length - maxChars)
      fm.writeString(logFile, existing)
      console.log(line.trim())
    } catch (e) {
      console.error("Logger failure", e)
    }
  }

  return {
    info: (m, meta) => write("INFO", m, meta),
    warn: (m, meta) => write("WARN", m, meta),
    error: (m, meta) => {
      const payload = meta instanceof Error
        ? {message:meta.message, stack:meta.stack || ""}
        : meta
      write("ERROR", m, payload)
    },
    path: logFile
  }
}
