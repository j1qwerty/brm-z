import QRCode from 'qrcode'

let memo: Map<string, string> | null = null

export async function qrDataUrl(text: string, size = 160): Promise<string> {
  if (!memo) memo = new Map()
  const key = `${text}|${size}`
  const hit = memo.get(key)
  if (hit) return hit
  const url = await QRCode.toDataURL(text, { width: size, margin: 1, errorCorrectionLevel: 'M' })
  memo.set(key, url)
  return url
}
