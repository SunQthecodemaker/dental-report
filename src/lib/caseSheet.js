/**
 * 유사 케이스 공용 소스 — 구글시트(gviz) 리더.
 *
 * 홈페이지(치료 전·후)와 진단서 앱이 같은 시트를 읽는 "단일 원본" 구조.
 * 시트: 프라임에스_치료전후_케이스 (sunq818 소유, 6030primes 편집, 링크뷰 공개)
 *
 * 시트 컬럼(케이스 탭):
 *   A 번호 | B 카테고리 | C 제목 | D 태그(쉼표) | E 날짜 | F 설명
 *   G 이미지URL(전1,후1,전2,후2…) | H 원본폴더(참고) | I 전후쌍수(참고)
 *
 * 앱 케이스 모델로 매핑:
 *   { id, num, title, category, tags: string[], description,
 *     pairs: [{ before_url, after_url }] }
 */

export const CASE_SHEET_ID = '14C9bQr2MXj5F-AFwva-Vfy6d-KvJrj0Glw91ZiS_vjY'
export const CASE_CATEGORIES = ['치아교정', '심미치료', '임플란트']

const GVIZ_URL = `https://docs.google.com/spreadsheets/d/${CASE_SHEET_ID}/gviz/tq?tqx=out:json&headers=1&sheet=${encodeURIComponent('케이스')}`

/** "a, b, c" → ['a','b','c'] (공백/빈값 제거) */
function splitList(raw) {
  if (!raw) return []
  return String(raw)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

/** 이미지 URL 목록(전1,후1,전2,후2…) → [{before_url, after_url}] */
function toPairs(imageCell) {
  const urls = splitList(imageCell)
  const pairs = []
  for (let i = 0; i < urls.length; i += 2) {
    pairs.push({ before_url: urls[i] || '', after_url: urls[i + 1] || '' })
  }
  return pairs
}

/** gviz 응답 텍스트 → JSON 객체 (google.visualization.Query.setResponse(...) 래퍼 제거) */
function parseGviz(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error('gviz 응답 파싱 실패')
  return JSON.parse(text.slice(start, end + 1))
}

/**
 * 공용 시트에서 유사 케이스 로드.
 * 실패 시 빈 배열 반환(앱이 멈추지 않도록).
 */
export async function loadCasesFromSheet() {
  try {
    const res = await fetch(GVIZ_URL, { cache: 'no-store' })
    if (!res.ok) throw new Error(`시트 응답 ${res.status}`)
    const json = parseGviz(await res.text())
    const rows = json?.table?.rows || []
    const cases = []
    for (const row of rows) {
      const c = row.c || []
      const val = (i) => (c[i] && c[i].v != null ? String(c[i].v).trim() : '')
      const num = val(0)
      const title = val(2)
      if (!num && !title) continue // 빈 행 skip
      const category = val(1) || '치아교정'
      cases.push({
        id: num || title,
        num,
        title,
        category,
        tags: splitList(val(3)),
        description: val(5),
        pairs: toPairs(val(6)),
      })
    }
    return cases
  } catch (err) {
    console.warn('[caseSheet] 케이스 시트 로드 실패:', err?.message || err)
    return []
  }
}
