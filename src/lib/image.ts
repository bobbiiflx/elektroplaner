/** Verkleinert ein Foto auf höchstens `max` Pixel Kantenlänge und liefert es als JPEG-Data-URL. */
export async function shrinkImage(file: File, max = 1280, quality = 0.72): Promise<string> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * k))
  const h = Math.max(1, Math.round(bmp.height * k))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('Bild konnte nicht verarbeitet werden')
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  return c.toDataURL('image/jpeg', quality)
}
