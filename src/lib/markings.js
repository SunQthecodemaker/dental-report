/**
 * 사진 마킹 데이터 직렬화 유틸.
 * <img data-markings="[{...}]"> 형태로 저장.
 */

export function parseMarkingsAttr(str) {
  if (!str) return []
  try {
    const parsed = JSON.parse(str)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

export function serializeMarkings(markings) {
  if (!Array.isArray(markings) || markings.length === 0) return ''
  return JSON.stringify(markings)
}
