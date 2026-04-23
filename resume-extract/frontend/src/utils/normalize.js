// ─── Phone normalization ──────────────────────────────────────────────────────

export function normalizePhone(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits
  if (digits.length === 13 && digits.startsWith('86') && digits[2] === '1') return digits.slice(2)
  return phone
}

// ─── Email normalization ──────────────────────────────────────────────────────

export function normalizeEmail(email) {
  if (!email) return null
  return email.trim().toLowerCase()
}

// ─── Date normalization ───────────────────────────────────────────────────────

export function normalizeDate(dateStr) {
  if (!dateStr) return null
  const s = dateStr.trim()
  if (/^\d{4}-\d{2}$/.test(s) || /^\d{4}$/.test(s)) return s
  const m = s.match(/(\d{4})[年\-./](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`
  const y = s.match(/(\d{4})/)
  if (y) return y[1]
  return s
}

// ─── Degree normalization ─────────────────────────────────────────────────────

const DEGREE_MAP = {
  博士: '博士',
  phd: '博士',
  doctorate: '博士',
  硕士: '硕士',
  master: '硕士',
  mba: '硕士',
  本科: '本科',
  学士: '本科',
  bachelor: '本科',
  大专: '大专',
  专科: '大专',
  associate: '大专',
  高中: '高中',
  职高: '高中',
}

export function normalizeDegree(degree) {
  if (!degree) return null
  const lower = degree.toLowerCase()
  for (const [key, val] of Object.entries(DEGREE_MAP)) {
    if (lower.includes(key)) return val
  }
  return degree
}

// ─── Years of experience calculation ─────────────────────────────────────────

function parseYM(dateStr) {
  if (!dateStr) return null
  const norm = normalizeDate(dateStr)
  if (!norm) return null
  const m = norm.match(/^(\d{4})-(\d{2})$/)
  if (m) return { year: parseInt(m[1]), month: parseInt(m[2]) }
  const y = norm.match(/^(\d{4})$/)
  if (y) return { year: parseInt(y[1]), month: 1 }
  return null
}

export function calcYearsOfExperience(workItems) {
  if (!workItems || workItems.length === 0) return null
  const now = { year: new Date().getFullYear(), month: new Date().getMonth() + 1 }

  let totalMonths = 0
  for (const item of workItems) {
    const start = parseYM(item.start_date)
    if (!start) continue
    const endStr = item.end_date
    const isPresent = !endStr || /至今|present|now|current/i.test(endStr)
    const end = isPresent ? now : parseYM(endStr)
    if (!end) continue
    const months = (end.year - start.year) * 12 + (end.month - start.month)
    if (months > 0) totalMonths += months
  }

  if (totalMonths <= 0) return null
  const years = Math.floor(totalMonths / 12)
  const months = totalMonths % 12
  if (years === 0) return `${months}个月`
  if (months === 0) return `${years}年`
  return `${years}年${months}个月`
}

// ─── Full normalization ───────────────────────────────────────────────────────

export function normalizeFields(basicInfo, workItems) {
  return {
    phone_std: normalizePhone(basicInfo?.phone),
    email_std: normalizeEmail(basicInfo?.email),
    birth_date_iso: normalizeDate(basicInfo?.birth_date),
    highest_degree_std: normalizeDegree(basicInfo?.highest_degree),
    years_of_experience_calc: calcYearsOfExperience(workItems),
  }
}
