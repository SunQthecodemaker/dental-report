/**
 * 치아번호 (FDI) → 한글 부위명 변환
 *
 * FDI 표기:
 *   1x: 상악 우측 (환자 기준 오른쪽 위)
 *   2x: 상악 좌측 (환자 기준 왼쪽 위)
 *   3x: 하악 좌측 (환자 기준 왼쪽 아래)
 *   4x: 하악 우측 (환자 기준 오른쪽 아래)
 *
 * 끝자리:
 *   1: 중앙 앞니 / 2: 옆 앞니 / 3: 송곳니
 *   4: 첫 번째 작은어금니 / 5: 두 번째 작은어금니
 *   6: 첫 번째 큰어금니 / 7: 두 번째 큰어금니 / 8: 사랑니
 *
 * 사분면 표기 (#10/#20/#30/#40)은 해당 영역 전체.
 */

const QUADRANT = {
  '1': '오른쪽 위', '2': '왼쪽 위', '3': '왼쪽 아래', '4': '오른쪽 아래',
}

const POSITION = {
  '1': '중앙 앞니',
  '2': '옆 앞니',
  '3': '송곳니',
  '4': '첫 번째 작은어금니',
  '5': '두 번째 작은어금니',
  '6': '첫 번째 큰어금니',
  '7': '두 번째 큰어금니',
  '8': '사랑니',
}

export function toothCodeToKorean(code) {
  const clean = String(code || '').replace(/^#/, '').trim()
  if (!/^\d+$/.test(clean)) return null

  if (clean.length === 1) {
    return QUADRANT[clean] || null
  }
  if (clean.length === 2) {
    const q = clean[0]
    const p = clean[1]
    if (!QUADRANT[q]) return null
    if (p === '0') return QUADRANT[q]
    if (!POSITION[p]) return null
    return `${QUADRANT[q]} ${POSITION[p]}`
  }
  return null
}

export function quadrantAndPositionToKorean(quadrant, position) {
  const q = String(quadrant || '').replace(/^#/, '').trim()
  const p = String(position || '').replace(/번/, '').trim()
  const qFirst = q.length === 2 && q[1] === '0' ? q[0] : q
  if (!QUADRANT[qFirst]) return null
  if (!POSITION[p]) return null
  return `${QUADRANT[qFirst]} ${POSITION[p]}`
}

/**
 * 텍스트 내 치아번호 패턴을 한글로 치환.
 * 다루는 패턴:
 *  - #16 → 오른쪽 위 첫 번째 큰어금니
 *  - #10 → 오른쪽 위
 *  - #10: 4번 → 오른쪽 위 첫 번째 작은어금니
 *  - #10 4번 → 오른쪽 위 첫 번째 작은어금니
 *  - 16 (단독 2자리 FDI) → 치환 안 함 (오탐 방지, 명시적 # 필요)
 */
export function replaceToothCodesInText(text) {
  if (!text || typeof text !== 'string') return text

  let out = text

  out = out.replace(/#(\d{2})\s*[:：]?\s*(\d)번/g, (_, q, p) => {
    const kr = quadrantAndPositionToKorean(q, p)
    return kr || `#${q}: ${p}번`
  })

  out = out.replace(/#(\d{1,2})/g, (match, digits) => {
    const kr = toothCodeToKorean(digits)
    return kr || match
  })

  return out
}

/**
 * summary 객체 전체에 치아번호 치환을 적용한 복사본을 반환.
 * 원본은 수정하지 않음.
 */
export function summaryWithKoreanTeeth(summary) {
  if (!summary) return summary
  return {
    combined: replaceToothCodesInText(summary.combined || ''),
    skeletal: replaceToothCodesInText(summary.skeletal || ''),
    dental:   replaceToothCodesInText(summary.dental || ''),
    etc:      replaceToothCodesInText(summary.etc || ''),
    treatmentPlans: (summary.treatmentPlans || []).map(p => replaceToothCodesInText(p || '')),
    overall:  replaceToothCodesInText(summary.overall || ''),
  }
}
