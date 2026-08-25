// Categories and materials are DB rows, not i18n keys — admins/leads can add
// more any time from the Items page (see api/schema.sql), so most of them
// really are freeform. But the starter set schema.sql seeds on install is a
// fixed, known vocabulary, and those are the names every install actually
// uses day to day. This maps that starter set's exact English name (as
// stored) to a translated label; anything not in the map — a category or
// material someone added later — just renders as whatever was typed in,
// same as before.
const CATEGORY_KEYS = {
  'Paint & Coatings': 'paintCoatings',
  'Flooring': 'flooring',
  'Electrical': 'electrical',
  'Plumbing': 'plumbing',
  'Millwork': 'millwork',
  'Fasteners & Hardware': 'fastenersHardware',
  'Concrete': 'concrete',
  'Office Materials': 'officeMaterials',
  'Tools & Equipment': 'toolsEquipment',
  'Solid Surface Countertops': 'solidSurfaceCountertops',
}

const MATERIAL_KEYS = {
  'Vinyl': 'vinyl',
  'Hardwood': 'hardwood',
  'Tile': 'tile',
  'Carpet': 'carpet',
  'Latex': 'latex',
  'Oil-Based': 'oilBased',
  'Primer': 'primer',
  'Steel': 'steel',
  'Stainless Steel': 'stainlessSteel',
  'Poplar': 'poplar',
  'Pine': 'pine',
  'Oak': 'oak',
  'MDF': 'mdf',
}

export const translateCategoryName = (name, t) => {
  const key = name ? CATEGORY_KEYS[name] : null
  return key ? t(`items.categoryNames.${key}`) : name
}

export const translateMaterialName = (name, t) => {
  const key = name ? MATERIAL_KEYS[name] : null
  return key ? t(`items.materialNames.${key}`) : name
}
