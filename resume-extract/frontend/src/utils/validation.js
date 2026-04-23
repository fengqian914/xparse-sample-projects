// ─── Resume validation ────────────────────────────────────────────────────────
// Returns a score 0-100 and a list of issues.

function isValidPhone(phone) {
  if (!phone) return false
  return /^1[3-9]\d{9}$/.test(phone.replace(/\D/g, ''))
}

function isValidEmail(email) {
  if (!email) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

function parseYear(dateStr) {
  if (!dateStr) return null
  const m = dateStr.match(/(\d{4})/)
  return m ? parseInt(m[1]) : null
}

export function validateResume(extraction) {
  const issues = []
  let score = 100
  const sf = extraction?.standard_fields
  if (!sf) return { score: 0, issues: ['无法获取抽取结果'] }

  const bi = sf.basic_info ?? {}

  // Name (25 pts)
  if (!bi.name) {
    score -= 25
    issues.push({ severity: 'error', message: '姓名缺失' })
  }

  // Phone (15 pts)
  if (!bi.phone) {
    score -= 10
    issues.push({ severity: 'warning', message: '手机号缺失' })
  } else if (!isValidPhone(bi.phone)) {
    score -= 5
    issues.push({ severity: 'info', message: `手机号格式异常: ${bi.phone}` })
  }

  // Email (10 pts)
  if (!bi.email) {
    score -= 5
    issues.push({ severity: 'info', message: '邮箱缺失' })
  } else if (!isValidEmail(bi.email)) {
    score -= 5
    issues.push({ severity: 'warning', message: `邮箱格式异常: ${bi.email}` })
  }

  // Education (20 pts)
  if (!sf.education || sf.education.length === 0) {
    score -= 20
    issues.push({ severity: 'error', message: '教育经历缺失' })
  } else {
    for (let i = 0; i < sf.education.length; i++) {
      const e = sf.education[i]
      if (!e.school) {
        score -= 5
        issues.push({ severity: 'warning', message: `教育经历 ${i + 1}：学校名称缺失` })
        break
      }
      const startY = parseYear(e.start_date)
      const endY = parseYear(e.end_date)
      if (startY && endY && endY < startY) {
        score -= 5
        issues.push({ severity: 'warning', message: `教育经历 ${i + 1}（${e.school}）结束年份早于开始年份` })
      }
    }
  }

  // Work experience (25 pts)
  if (!sf.work_experience || sf.work_experience.length === 0) {
    score -= 10
    issues.push({ severity: 'info', message: '工作经历缺失（可能为应届生）' })
  } else {
    for (let i = 0; i < sf.work_experience.length; i++) {
      const w = sf.work_experience[i]
      if (!w.company) {
        score -= 5
        issues.push({ severity: 'warning', message: `工作经历 ${i + 1}：公司名称缺失` })
        break
      }
      const startY = parseYear(w.start_date)
      const endY = parseYear(w.end_date)
      const isPresent = !w.end_date || /至今|present|now/i.test(w.end_date)
      if (startY && endY && !isPresent && endY < startY) {
        score -= 5
        issues.push({ severity: 'warning', message: `工作经历 ${i + 1}（${w.company}）时间段异常` })
      }
    }
  }

  // Skills (5 pts)
  if (!sf.skills || sf.skills.length === 0) {
    score -= 5
    issues.push({ severity: 'info', message: '技能信息缺失' })
  }

  return { score: Math.max(0, score), issues }
}
