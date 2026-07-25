/**
 * 유사 케이스 공용 소스 — 구글시트(gviz) 리더.
 *
 * 홈페이지(치료 전·후)와 진단서 앱이 같은 시트를 읽는 "단일 원본" 구조.
 * 시트: 프라임에스_치료전후_케이스 (sunq818 소유, 6030primes 편집, 링크뷰 공개)
 *
 * 시트 컬럼(케이스 탭):
 *   A 번호 | B 카테고리 | C 제목 | D 태그(쉼표) | E 날짜 | F 설명
 *   G 이미지URL(전1,후1,전2,후2…) | H 원본폴더 | I 전후쌍수
 *
 * 사진 경로는 H(원본폴더) + I(전후쌍수) 로 조립한다. 홈페이지가 쓰는 것과 같은
 * `{폴더}/before01, after01, before02 …` 규칙이고, 실제 파일만 Supabase Storage 에 둔다
 * (홈페이지 원본은 primes.co.kr 에 있으나 HTTP 로만 열려 HTTPS 인 이 앱에서는
 *  mixed content 로 차단됨 — 같은 사진을 webp 로 변환해 Storage 에 올려 둠).
 *
 * G(이미지URL)에 값이 있으면 그 URL 을 우선 사용한다 — 규칙에서 벗어난 예외 케이스용.
 *
 * 앱 케이스 모델로 매핑:
 *   { id, num, title, category, folder, tags: string[], description,
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

/** 케이스 사진이 올라가 있는 Storage 경로 (public 버킷) */
const CASE_IMAGE_BASE =
  `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/dental-reports/library/cases`

/** 이미지 URL 목록(전1,후1,전2,후2…) → [{before_url, after_url}] */
function toPairs(imageCell) {
  const urls = splitList(imageCell)
  const pairs = []
  for (let i = 0; i < urls.length; i += 2) {
    pairs.push({ before_url: urls[i] || '', after_url: urls[i + 1] || '' })
  }
  return pairs
}

/** 폴더명 + 쌍 수 → [{before_url, after_url}] (홈페이지와 동일한 파일명 규칙) */
function pairsFromFolder(folder, pairCount) {
  if (!folder || !(pairCount > 0)) return []
  const pairs = []
  for (let i = 1; i <= pairCount; i++) {
    const n = String(i).padStart(2, '0')
    pairs.push({
      before_url: `${CASE_IMAGE_BASE}/${folder}/before${n}.webp`,
      after_url: `${CASE_IMAGE_BASE}/${folder}/after${n}.webp`,
    })
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
      const folder = val(7)
      const pairCount = Math.round(Number(val(8))) || 0
      // G(이미지URL)가 채워져 있으면 우선, 아니면 폴더 규칙으로 조립
      const explicitPairs = toPairs(val(6))
      cases.push({
        id: num || title,
        num,
        title,
        category,
        folder,
        tags: splitList(val(3)),
        description: val(5),
        pairs: explicitPairs.length ? explicitPairs : pairsFromFolder(folder, pairCount),
      })
    }
    return cases
  } catch (err) {
    console.warn('[caseSheet] 케이스 시트 로드 실패:', err?.message || err)
    return []
  }
}
