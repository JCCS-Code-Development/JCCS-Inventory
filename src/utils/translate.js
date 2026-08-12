// Detects whether a piece of free-typed text (a request description, an
// order note, a discrepancy reason...) is likely English or Spanish, and
// translates it on demand. This app only ever needs to tell those two
// apart, so a small hand-rolled heuristic is plenty — no need to pull in a
// general-purpose language-detection library for a two-language problem.

// Accented characters and punctuation that essentially only show up in
// Spanish — a single hit is already a strong signal.
const ES_CHAR_RE = /[ñáéíóúü¿¡]/i

// Common short words, scored by frequency of whole-word matches. Picked for
// the kind of plain, work-order prose this app actually sees ("need 10
// lights by Friday" / "necesito 10 luces para el viernes"), not general
// text.
const EN_STOPWORDS = new Set([
  'the', 'and', 'is', 'are', 'was', 'were', 'this', 'that', 'with', 'for',
  'from', 'have', 'has', 'had', 'need', 'needed', 'please', 'extra', 'more',
  'less', 'will', 'would', 'should', 'could', 'not', 'we', 'you', 'they',
  'it', 'on', 'in', 'at', 'to', 'of', 'a', 'an', 'if', 'but', 'or', 'so',
  'because', 'when', 'where', 'what', 'who', 'how', 'still', 'already',
  'arrived', 'missing', 'short', 'ordered', 'received', 'again', 'one',
  'two', 'three', 'like', 'similar', 'truck', 'yard', 'been', 'be',
])
const ES_STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'de', 'del', 'que', 'y', 'en', 'un', 'una',
  'unos', 'unas', 'con', 'por', 'para', 'más', 'pero', 'como', 'este',
  'esta', 'estos', 'estas', 'son', 'está', 'están', 'no', 'sí', 'se', 'su',
  'sus', 'al', 'lo', 'le', 'les', 'nos', 'muy', 'ya', 'hay', 'fue', 'ser',
  'hacer', 'necesito', 'necesita', 'necesitamos', 'pedido', 'gracias',
  'favor', 'todavía', 'faltan', 'falta', 'llegó', 'llegaron', 'otra',
  'otro', 'igual', 'parecido', 'camión', 'bodega', 'sido',
])

// null = not enough signal either way (too short, or genuinely ambiguous
// like a SKU or a bare number) — callers should treat that as "don't
// bother offering a translation," not as a language match.
export function detectLanguage(text) {
  if (!text) return null
  const trimmed = text.trim()
  if (trimmed.length < 8) return null // "ok", "yes", "10" etc. — nothing to go on

  if (ES_CHAR_RE.test(trimmed)) return 'es'

  const words = trimmed.toLowerCase().match(/[a-záéíóúñü]+/gi) ?? []
  if (words.length < 2) return null

  let enScore = 0, esScore = 0
  for (const w of words) {
    if (EN_STOPWORDS.has(w)) enScore++
    else if (ES_STOPWORDS.has(w)) esScore++
  }
  if (enScore === 0 && esScore === 0) return null // no recognizable signal — don't guess
  return enScore >= esScore ? 'en' : 'es'
}

// MyMemory's free translation API — no signup, no API key, generous enough
// daily quota for this app's volume of short internal notes. Not a
// production-grade translation service; good enough for "get the gist" on
// a request or a discrepancy note written in the other language.
const CACHE = new Map()

export async function translateText(text, sourceLang, targetLang) {
  const key = `${sourceLang}|${targetLang}:${text}`
  if (CACHE.has(key)) return CACHE.get(key)

  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Translation service unavailable')
  const data = await res.json()
  const translated = data?.responseData?.translatedText
  if (!translated || data?.responseStatus === 403) throw new Error('Translation failed')

  CACHE.set(key, translated)
  return translated
}
