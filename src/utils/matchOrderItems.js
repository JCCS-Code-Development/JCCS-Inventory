// Best-effort matching of OCR'd invoice/receipt text lines against the
// registered item catalog. Invoice layouts vary wildly and OCR text is
// noisy, so this is deliberately a "recommended list" for a human to review
// and correct — never something the caller should save without confirmation.

const QTY_PATTERN = /(?:^|\s)(\d+(?:\.\d+)?)\s*(?:x\b|pcs?\b|ea\b|units?\b)?/i

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function tokenSet(s) {
  return new Set(normalize(s).split(' ').filter((t) => t.length > 1))
}

// Fraction of the item's own tokens found in the line — biased so a short,
// distinctive item name needs most of its words present, while a long name
// can still match on a strong partial overlap. An exact SKU appearing
// verbatim on the line is treated as a sure thing (vendors print their own
// part numbers on invoices far more reliably than free-text descriptions).
function scoreLine(lineTokens, itemTokens, skuNorm, lineNorm) {
  if (skuNorm && skuNorm.length >= 3 && lineNorm.includes(skuNorm)) return 1
  if (itemTokens.size === 0) return 0
  let shared = 0
  for (const t of itemTokens) if (lineTokens.has(t)) shared++
  return shared / itemTokens.size
}

export function suggestOrderLines(rawText, catalog, { minConfidence = 0.34 } = {}) {
  const candidates = catalog.map((it) => ({
    item: it,
    tokens: tokenSet(`${it.name} ${it.vendor_item_number ?? ''}`),
    skuNorm: normalize(it.sku),
  }))

  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length >= 3)
  const suggestions = []
  const seenItemIds = new Set()

  for (const line of lines) {
    const lineNorm = normalize(line)
    const lineTokens = tokenSet(line)

    let best = null
    for (const c of candidates) {
      const s = scoreLine(lineTokens, c.tokens, c.skuNorm, lineNorm)
      if (s >= minConfidence && (!best || s > best.confidence)) best = { item: c.item, confidence: s }
    }
    if (!best || seenItemIds.has(best.item.id)) continue // one suggestion per item — keep its first, strongest line
    seenItemIds.add(best.item.id)

    const qtyMatch = line.match(QTY_PATTERN)
    const qty = qtyMatch ? parseFloat(qtyMatch[1]) : 1

    suggestions.push({
      raw: line,
      item_id: String(best.item.id),
      sku: best.item.sku,
      name: best.item.name,
      qty_ordered: String(qty > 0 ? qty : 1),
      confidence: best.confidence,
    })
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence)
}
