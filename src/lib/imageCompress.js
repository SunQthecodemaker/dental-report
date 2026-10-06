/**
 * 업로드 전 이미지 축소 — Supabase Storage 전송량(egress) 절약용.
 *
 * 긴 변을 MAX_SIDE 로 줄이고 JPEG 로 다시 인코딩한다.
 * 이미 작은 파일이거나 GIF/SVG 는 그대로 둔다. 실패하면 원본을 돌려준다.
 */
const MAX_SIDE = 1600
const QUALITY = 0.82
const SKIP_BELOW = 300 * 1024 // 300KB 이하는 손대지 않음

export async function compressImage(file) {
  if (!file?.type?.startsWith('image/')) return file
  if (/gif|svg/.test(file.type)) return file
  if (file.size <= SKIP_BELOW) return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff' // PNG 투명 영역이 JPEG 에서 검게 나오지 않도록
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()

    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', QUALITY))
    if (!blob || blob.size >= file.size) return file

    const name = (file.name || 'image').replace(/\.\w+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg' })
  } catch {
    return file
  }
}

// 파일명이 매번 고유하므로 한 번 받은 사진은 브라우저가 1년간 재사용해도 안전하다
export const IMAGE_CACHE_CONTROL = '31536000'
