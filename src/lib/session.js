const SESSION_KEY = 'dental-report-session-id'
const PC_NAME_KEY = 'dental-report-pc-name'

export function getSessionId() {
  let id = localStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(SESSION_KEY, id)
  }
  return id
}

export function getPcName() {
  return localStorage.getItem(PC_NAME_KEY) || ''
}

export function setPcName(name) {
  localStorage.setItem(PC_NAME_KEY, name || '')
}

export function getPcLabel() {
  const name = getPcName()
  if (name) return name
  const id = getSessionId()
  return `PC-${id.slice(0, 4)}`
}
