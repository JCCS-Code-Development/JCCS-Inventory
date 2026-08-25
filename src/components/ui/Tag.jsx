// A small colored pill for one piece of metadata — a distinct color per
// "category" of tag (qty/location = neutral, vendor hint = blue, project =
// brand) so a row of them reads at a glance instead of blurring into one
// line of same-weight text. Not the same thing as Badge (status pills with
// fixed semantic variants) — this is just categorical tagging.
const TONES = {
  neutral: 'bg-gray-100 text-gray-700',
  blue:    'bg-sky-50 text-sky-700',
  brand:   'bg-brand-100 text-brand-800',
}

export default function Tag({ tone = 'neutral', children }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${TONES[tone]}`}>{children}</span>
}
