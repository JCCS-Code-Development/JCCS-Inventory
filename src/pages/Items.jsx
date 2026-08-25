import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import PageHeader from '../components/admin/PageHeader'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import ScannerLoading from '../components/ui/ScannerLoading'
import EstimateNumberField from '../components/ui/EstimateNumberField'
import ImageLightbox from '../components/ui/ImageLightbox'
import {
  listItems, createItem, updateItem, deactivateItem, lookupItemByBarcode,
  listItemBarcodes, addItemBarcode, removeItemBarcode,
  uploadItemImage, deleteItemImage,
} from '../api/items'
import { listCategories, createCategory } from '../api/categories'
import { listMaterials, createMaterial } from '../api/materials'
import { listVendors } from '../api/vendors'
import { listLocations } from '../api/locations'
import { receiveStock, getCurrentStock } from '../api/stock'
import { useAuthStore } from '../store/authStore'
import { formatCurrency, formatQty } from '../utils/format'
import { compressImage } from '../utils/compressImage'
import { translateCategoryName, translateMaterialName } from '../utils/catalogNames'
import { useConfirm } from '../components/ConfirmProvider'
import { useToast } from '../components/ToastProvider'

const EMPTY = {
  sku: '', barcode: '', name: '', category_id: '', material_id: '', unit_of_measure: 'each',
  vendor_id: '', vendor_item_number: '', dimensions: '', unit_cost: '', reorder_point: '0',
  lead_time_days: '', default_project_id: '', notes: '',
  initial_qty: '', initial_location_id: '',
}
const EMPTY_ADD_STOCK = { qty: '', location_id: '' }
// Lazy: the ~470KB barcode decoder only downloads once someone taps Scan.
const BarcodeScanner = lazy(() => import('../components/ui/BarcodeScanner'))

// Collapsible wrapper for one group of items (a storage location, a vendor,
// a category…). Plain <details>/<summary> — no extra state to wire up, and
// it doubles as the "broad vs. specific" control: collapse a section to
// skim past it, expand it to drill in.
function GroupSection({ title, count, children, defaultOpen = true, itemsLabel }) {
  return (
    <details open={defaultOpen} className="group bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden px-4 py-3 bg-gray-50 flex items-center justify-between text-sm font-semibold text-gray-700">
        <span className="flex items-center gap-2">
          <span className="text-gray-400 inline-block transition-transform group-open:rotate-90">▸</span>
          {title}
        </span>
        <span className="text-xs font-normal text-gray-400">{count} {itemsLabel}</span>
      </summary>
      <div className="border-t border-gray-100">{children}</div>
    </details>
  )
}

// The items table itself, reused both flat (groupBy "none") and inside each
// GroupSection. qtyMap, when given, swaps the "Total Units" column for
// on-hand qty at one specific location instead of the cross-location sum.
function ItemsTable({ items, canSeeCost, canManage, onEdit, onDeactivate, onImageClick, qtyMap, qtyLabel, headers, t }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {['', headers.sku, headers.name, headers.category, headers.material, qtyLabel, ...(canSeeCost ? [headers.vendor, headers.unitCost] : []), headers.project, headers.reorderPt, ''].map((h, i) => (
              <th key={`${h}-${i}`} className={`px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide ${i === 0 ? 'w-[128px] min-w-[128px]' : ''}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((it) => {
            const qty = qtyMap ? (qtyMap[it.id] ?? 0) : it.total_qty
            return (
              <tr key={it.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 w-[128px] min-w-[128px]">
                  {it.image_url ? (
                    <button type="button" onClick={() => onImageClick?.(it)}
                      className="block w-24 h-24 rounded-xl overflow-hidden shrink-0 ring-1 ring-black/5 hover:ring-2 hover:ring-brand-400 transition-all cursor-zoom-in">
                      <img src={it.image_url} alt="" className="w-full h-full object-cover" style={{ maxWidth: 'none' }} />
                    </button>
                  ) : (
                    <div className="w-24 h-24 rounded-xl bg-gray-100 flex items-center justify-center text-gray-300 text-3xl shrink-0">📦</div>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{it.sku}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{it.name}</td>
                <td className="px-4 py-3 text-gray-600">{it.category_name ? translateCategoryName(it.category_name, t) : '—'}</td>
                <td className="px-4 py-3 text-gray-600">{it.material_name ? translateMaterialName(it.material_name, t) : '—'}</td>
                <td className="px-4 py-3 text-gray-600">{formatQty(qty, it.unit_of_measure)}</td>
                {canSeeCost && <td className="px-4 py-3 text-gray-600">{it.vendor_name ?? '—'}</td>}
                {canSeeCost && <td className="px-4 py-3 text-gray-600">{formatCurrency(it.unit_cost)}</td>}
                <td className="px-4 py-3 text-gray-600">{it.default_project_name ?? '—'}</td>
                <td className="px-4 py-3">
                  <Badge variant={it.reorder_point > 0 ? 'active' : 'inactive'}>{it.reorder_point}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  {canManage && (
                    <div className="flex justify-end gap-2">
                      <button onClick={() => onEdit(it)} className="text-xs font-semibold text-brand-500 hover:underline">{t('common.edit')}</button>
                      <button onClick={() => onDeactivate(it)} className="text-xs font-semibold text-red-500 hover:underline">{t('common.deactivate')}</button>
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function Items() {
  const { t } = useTranslation()
  const role = useAuthStore((s) => s.user?.role)
  const canManage = role === 'admin' || role === 'specialist' // registering products is the specialist's job too
  const canSeeCost = canManage // basic users just check availability, no pricing
  const confirmDialog = useConfirm()
  const toast = useToast()
  const location = useLocation() // carries { openCreate: true } or { focusSearch: true } from Dashboard quick actions
  const searchRef = useRef(null)

  const tableHeaders = {
    sku: t('common.sku'), name: t('common.name'), category: t('items.category'), material: t('items.material'),
    vendor: t('common.vendor'), unitCost: t('items.unitCost'), project: t('items.project'), reorderPt: t('items.reorderPt'),
  }

  const [items,      setItems]      = useState([])
  const [categories, setCategories] = useState([])
  const [materials,  setMaterials]  = useState([]) // scoped to form.category_id
  const [vendors,    setVendors]    = useState([])
  const [locations,  setLocations]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [modal,      setModal]      = useState(null) // null | 'create' | item obj
  const [form,       setForm]       = useState(EMPTY)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newMaterial, setNewMaterial] = useState('')
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [showNewMaterial, setShowNewMaterial] = useState(false)
  const [showMoreDetails, setShowMoreDetails] = useState(false)
  const [search,     setSearch]     = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)

  // Filters — narrow the working set before grouping/rendering. Vendor is
  // cost-adjacent (see stripCostFields on the API side), so it's only ever
  // offered to roles that can already see vendor/cost columns.
  const [filterCategory, setFilterCategory] = useState('')
  const [filterVendor,   setFilterVendor]   = useState('')
  const [filterLocation, setFilterLocation] = useState('')

  // Click a thumbnail in the table to see the full photo — the item whose
  // image is currently blown up, or null when the lightbox is closed.
  const [lightboxItem, setLightboxItem] = useState(null)

  // Group by — default splits by storage location, then by vendor within
  // each (per the standing request). "None" flattens back to a single table
  // for a broader view; picking Category/Vendor re-centers the whole list
  // around that dimension instead.
  const [groupBy, setGroupBy] = useState(canSeeCost ? 'storage_vendor' : 'storage')

  // Per-location on-hand qty, keyed [locationId][itemId] -> qty. Only needed
  // for storage-based grouping/filtering; items/index.php only ever returns
  // the qty summed across locations.
  const [stockByLocation, setStockByLocation] = useState({})
  const [stockLoading, setStockLoading] = useState(false)

  // Duplicate detection while creating — "add to the existing pile instead
  // of a new one" per how the barcode/name search is meant to help.
  const [nameSuggestions, setNameSuggestions] = useState([])
  const [addStockTo,  setAddStockTo]  = useState(null) // item object, or null
  const [addStockForm, setAddStockForm] = useState(EMPTY_ADD_STOCK)
  const [addStockSaving, setAddStockSaving] = useState(false)
  const [addStockError, setAddStockError] = useState('')

  // Barcode management while editing an existing item — a product can carry
  // more than one (unit vs. box vs. pallet).
  const [itemBarcodes, setItemBarcodes] = useState([])
  const [newBarcode, setNewBarcode] = useState('')
  const [newBarcodeLabel, setNewBarcodeLabel] = useState('')
  const [barcodeError, setBarcodeError] = useState('')

  // Reference photo. Create mode stages a compressed blob locally (there's no
  // item id to upload against until the item actually exists); edit mode
  // uploads immediately, same as barcodes.
  const imageInputRef = useRef(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null)
  const [pendingImageBlob, setPendingImageBlob] = useState(null)
  const [imageUploading, setImageUploading] = useState(false)
  const [imageError, setImageError] = useState('')

  const load = () => {
    setLoading(true)
    Promise.all([
      listItems({ active: 1 }),
      listCategories(),
      canManage ? listVendors({ active: 1 }) : Promise.resolve({ vendors: [] }),
      listLocations({ active: 1 }), // every role browses/groups by storage location, not just canManage
    ]).then(([i, c, v, l]) => {
      setItems(i.items ?? []); setCategories(c.categories ?? []); setVendors(v.vendors ?? [])
      setLocations(l.locations ?? [])
    }).finally(() => setLoading(false))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- canManage is fixed for the session (tied to role)
  useEffect(load, [])

  // Fetches on-hand qty per location for every active item, so "storage"
  // grouping/filtering can tell which location(s) an item actually sits in.
  useEffect(() => {
    if (locations.length === 0) { setStockByLocation({}); return }
    setStockLoading(true)
    Promise.all(locations.map((l) => getCurrentStock(l.id).then((d) => [l.id, d.items ?? []])))
      .then((pairs) => {
        const map = {}
        for (const [locId, rows] of pairs) {
          map[locId] = Object.fromEntries(rows.map((r) => [r.item_id, Number(r.qty_on_hand) || 0]))
        }
        setStockByLocation(map)
      })
      .finally(() => setStockLoading(false))
  }, [locations])

  useEffect(() => {
    if (location.state?.openCreate && canManage) openCreate()
    if (location.state?.focusSearch) searchRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the nav state that got us here
  }, [location.state])

  useEffect(() => {
    if (!form.category_id) { setMaterials([]); return }
    listMaterials(form.category_id).then((d) => setMaterials(d.materials ?? []))
  }, [form.category_id])

  const openCreate = () => {
    setForm(EMPTY); setError(''); setNameSuggestions([]); setAddStockTo(null)
    setShowNewCategory(false); setShowNewMaterial(false); setShowMoreDetails(false)
    setItemBarcodes([]); setNewBarcode(''); setNewBarcodeLabel(''); setBarcodeError('')
    setImagePreviewUrl(null); setPendingImageBlob(null); setImageError('')
    setModal('create')
  }
  const openEdit = (it) => {
    setForm({
      sku: it.sku, barcode: '', name: it.name,
      category_id: String(it.category_id ?? ''), material_id: String(it.material_id ?? ''),
      unit_of_measure: it.unit_of_measure, vendor_id: String(it.vendor_id ?? ''),
      vendor_item_number: it.vendor_item_number ?? '', dimensions: it.dimensions ?? '',
      unit_cost: String(it.unit_cost ?? ''), reorder_point: String(it.reorder_point ?? '0'),
      lead_time_days: it.lead_time_days != null ? String(it.lead_time_days) : '',
      default_project_id: String(it.default_project_id ?? ''), notes: it.notes ?? '',
      initial_qty: '', initial_location_id: '',
    })
    setError(''); setNameSuggestions([]); setAddStockTo(null)
    setShowNewCategory(false); setShowNewMaterial(false); setShowMoreDetails(true) // editing: show everything, nothing to hide
    setNewBarcode(''); setNewBarcodeLabel(''); setBarcodeError('')
    setImagePreviewUrl(it.image_url ?? null); setPendingImageBlob(null); setImageError('')
    listItemBarcodes(it.id).then((d) => setItemBarcodes(d.barcodes ?? []))
    setModal(it)
  }

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const setName = (e) => {
    const value = e.target.value
    setForm(f => ({ ...f, name: value }))
    if (modal === 'create' && value.trim().length >= 3) {
      const q = value.trim().toLowerCase()
      setNameSuggestions(items.filter(i => i.name.toLowerCase().includes(q)).slice(0, 4))
    } else {
      setNameSuggestions([])
    }
  }

  const setCategory = (e) => {
    const value = e.target.value
    setForm(f => ({ ...f, category_id: value, material_id: '' })) // material options change with category
  }

  const handleAddCategory = async () => {
    if (!newCategory.trim()) return
    const { category } = await createCategory({ name: newCategory.trim() })
    setCategories(c => [...c, category])
    setForm(f => ({ ...f, category_id: String(category.id), material_id: '' }))
    setNewCategory(''); setShowNewCategory(false)
  }

  const handleAddMaterial = async () => {
    if (!newMaterial.trim() || !form.category_id) return
    const { material } = await createMaterial({ category_id: form.category_id, name: newMaterial.trim() })
    setMaterials(m => [...m, material])
    setForm(f => ({ ...f, material_id: String(material.id) }))
    setNewMaterial(''); setShowNewMaterial(false)
  }

  // Barcode scan while registering: if it's already someone else's item,
  // offer to add stock to it instead of filling in a barcode that'll just
  // get rejected as a duplicate on save. While editing an existing item,
  // a scan just adds another barcode straight to that item's list.
  const handleBarcodeScanned = async (text) => {
    setScannerOpen(false)
    if (modal !== 'create') { handleAddBarcode(text); return }
    try {
      const existing = await lookupItemByBarcode(text)
      openAddStockTo(existing)
    } catch {
      setForm(f => ({ ...f, barcode: text })) // no match — it's a genuinely new product
    }
  }

  const handleAddBarcode = async (barcodeValue) => {
    const barcode = (barcodeValue ?? newBarcode).trim()
    if (!barcode) return
    setBarcodeError('')
    try {
      await addItemBarcode({ item_id: modal.id, barcode, label: newBarcodeLabel.trim() || null })
      const { barcodes } = await listItemBarcodes(modal.id)
      setItemBarcodes(barcodes ?? [])
      setNewBarcode(''); setNewBarcodeLabel('')
    } catch (err) {
      setBarcodeError(err?.response?.data?.error ?? t('items.couldNotAddBarcode'))
    }
  }

  const handleRemoveBarcode = async (barcodeId) => {
    try {
      await removeItemBarcode(barcodeId)
      setItemBarcodes(bs => bs.filter(b => b.id !== barcodeId))
    } catch (err) {
      setBarcodeError(err?.response?.data?.error ?? t('items.couldNotRemoveBarcode'))
    }
  }

  const handleImagePick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow picking the same file again later
    if (!file) return
    if (!file.type.startsWith('image/')) { setImageError(t('items.notAnImage')); return }

    setImageError('')
    let blob
    try {
      blob = await compressImage(file)
    } catch {
      setImageError(t('items.couldNotProcessImage'))
      return
    }

    if (modal === 'create') {
      setPendingImageBlob(blob)
      setImagePreviewUrl(URL.createObjectURL(blob))
      return
    }

    setImageUploading(true)
    try {
      const { image_url } = await uploadItemImage(modal.id, blob)
      setImagePreviewUrl(image_url)
      load() // refresh the table thumbnail too
    } catch (err) {
      setImageError(err?.response?.data?.error ?? t('items.couldNotUploadPhoto'))
    } finally {
      setImageUploading(false)
    }
  }

  const handleRemoveImage = async () => {
    if (modal === 'create') {
      setPendingImageBlob(null); setImagePreviewUrl(null)
      return
    }
    setImageUploading(true); setImageError('')
    try {
      await deleteItemImage(modal.id)
      setImagePreviewUrl(null)
      load()
    } catch (err) {
      setImageError(err?.response?.data?.error ?? t('items.couldNotRemovePhoto'))
    } finally {
      setImageUploading(false)
    }
  }

  const openAddStockTo = (item) => {
    setAddStockTo(item)
    setAddStockForm(EMPTY_ADD_STOCK)
    setAddStockError('')
  }
  const backToCreate = () => { setAddStockTo(null); setNameSuggestions([]) }

  const handleAddStockSubmit = async () => {
    if (!addStockForm.location_id) { setAddStockError(t('items.chooseLocation')); return }
    if (!addStockForm.qty || parseFloat(addStockForm.qty) <= 0) { setAddStockError(t('items.enterQtyPositive')); return }
    setAddStockSaving(true); setAddStockError('')
    try {
      await receiveStock({ item_id: addStockTo.id, location_id: addStockForm.location_id, qty: parseFloat(addStockForm.qty) })
      setModal(null); setAddStockTo(null); load()
    } catch (err) {
      setAddStockError(err?.response?.data?.error ?? t('common.couldNotSave'))
    } finally { setAddStockSaving(false) }
  }

  const handleSave = async () => {
    if (!form.sku.trim() || !form.name.trim()) { setError(t('items.skuNameRequired')); return }
    if (form.initial_qty && parseFloat(form.initial_qty) > 0 && !form.initial_location_id) {
      setError(t('items.chooseLocationInitial')); return
    }
    setSaving(true); setError('')
    try {
      const payload = {
        ...form,
        sku: form.sku.trim(),
        name: form.name.trim(),
        category_id: form.category_id || null,
        material_id: form.material_id || null,
        vendor_id: form.vendor_id || null,
        default_project_id: form.default_project_id || null,
        unit_cost: form.unit_cost ? parseFloat(form.unit_cost) : 0,
        reorder_point: parseInt(form.reorder_point || '0', 10),
      }
      if (modal === 'create') {
        const created = await createItem(payload)
        // Photo, if one was staged, uploads only after the item actually exists.
        // Soft-fail here — a failed photo shouldn't undo a successful item registration.
        if (pendingImageBlob) {
          try { await uploadItemImage(created.id, pendingImageBlob) }
          catch { /* the item was still created fine; user can add the photo from Edit */ }
        }
      } else {
        await updateItem(modal.id, payload)
      }
      setModal(null); load()
    } catch (err) {
      setError(err?.response?.data?.error ?? t('common.couldNotSave'))
    } finally { setSaving(false) }
  }

  const handleDeactivate = async (it) => {
    if (!await confirmDialog(t('items.deactivateConfirm', { name: it.name }), { danger: true, confirmLabel: t('common.deactivate') })) return
    try { await deactivateItem(it.id); load() }
    catch (err) { toast.error(err?.response?.data?.error ?? t('items.couldNotDeactivate')) }
  }

  const qtyAt = (locationId, itemId) => stockByLocation[locationId]?.[itemId] ?? 0
  const hasStockAnywhere = (itemId) => locations.some((l) => qtyAt(l.id, itemId) > 0)

  const base = items.filter((it) => {
    if (search && !`${it.sku} ${it.name}`.toLowerCase().includes(search.toLowerCase())) return false
    if (filterCategory && String(it.category_id) !== filterCategory) return false
    if (canSeeCost && filterVendor && String(it.vendor_id) !== filterVendor) return false
    if (filterLocation && qtyAt(filterLocation, it.id) <= 0) return false
    return true
  })

  // Buckets a list into [label, items][] pairs, sorted alphabetically with
  // the "everything else" fallback bucket pushed to the end.
  const byKey = (list, keyFn, fallback) => {
    const map = new Map()
    for (const it of list) {
      const key = keyFn(it) || fallback
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(it)
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === fallback) return 1
      if (b === fallback) return -1
      return a.localeCompare(b)
    })
  }

  const noVendorLabel = t('items.noVendorGroup')
  const uncategorizedLabel = t('items.uncategorized')

  const anyFilterActive = !!(search || filterCategory || filterVendor || filterLocation)
  const hasStorageGrouping = groupBy === 'storage' || groupBy === 'storage_vendor'
  const visibleLocations = locations.filter((l) => !filterLocation || String(l.id) === String(filterLocation))

  let groupSections = null // null → render `base` as one flat table (groupBy "none")
  if (hasStorageGrouping) {
    groupSections = visibleLocations.map((loc) => {
      const itemsHere = base.filter((it) => qtyAt(loc.id, it.id) > 0)
      return {
        key: `loc-${loc.id}`, title: loc.name, items: itemsHere, qtyMap: stockByLocation[loc.id],
        subSections: groupBy === 'storage_vendor'
          ? byKey(itemsHere, (it) => it.vendor_name, noVendorLabel).map(([name, list]) => ({ key: `${loc.id}-${name}`, title: name, items: list }))
          : null,
      }
    })
    if (!filterLocation) {
      const unstocked = base.filter((it) => !hasStockAnywhere(it.id))
      if (unstocked.length > 0) {
        groupSections.push({
          key: 'unstocked', title: t('items.notYetStocked'), items: unstocked, qtyMap: null,
          subSections: groupBy === 'storage_vendor'
            ? byKey(unstocked, (it) => it.vendor_name, noVendorLabel).map(([name, list]) => ({ key: `unstocked-${name}`, title: name, items: list }))
            : null,
        })
      }
    }
  } else if (groupBy === 'category') {
    groupSections = byKey(base, (it) => it.category_name, uncategorizedLabel).map(([name, list]) => ({ key: `cat-${name}`, title: translateCategoryName(name, t), items: list, qtyMap: null, subSections: null }))
  } else if (groupBy === 'vendor' && canSeeCost) {
    groupSections = byKey(base, (it) => it.vendor_name, noVendorLabel).map(([name, list]) => ({ key: `ven-${name}`, title: name, items: list, qtyMap: null, subSections: null }))
  }

  const itemsLabel = (n) => n === 1 ? t('items.itemSingular') : t('items.itemPlural')

  return (
    <div className="w-full">
      <PageHeader
        title={t('items.title')}
        subtitle={t('items.subtitle')}
        actions={canManage && <Button onClick={openCreate}>{t('items.addItem')}</Button>}
      />

      <Input ref={searchRef} placeholder={t('items.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4 max-w-sm" />

      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 flex-1 min-w-[10rem]">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('items.groupBy')}</label>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
            {canSeeCost && <option value="storage_vendor">{t('items.groupByStorageVendor')}</option>}
            <option value="storage">{t('items.groupByStorage')}</option>
            <option value="category">{t('items.category')}</option>
            {canSeeCost && <option value="vendor">{t('common.vendor')}</option>}
            <option value="none">{t('items.groupByNone')}</option>
          </select>
        </div>

        <div className="flex flex-col gap-1 flex-1 min-w-[10rem]">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('items.groupByStorage')}</label>
          <select value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
            <option value="">{t('items.allLocations')}</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1 flex-1 min-w-[10rem]">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('items.category')}</label>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
            <option value="">{t('items.allCategories')}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{translateCategoryName(c.name, t)}</option>)}
          </select>
        </div>

        {canSeeCost && (
          <div className="flex flex-col gap-1 flex-1 min-w-[10rem]">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('common.vendor')}</label>
            <select value={filterVendor} onChange={(e) => setFilterVendor(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
              <option value="">{t('items.allVendors')}</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
        )}

        {(filterCategory || filterVendor || filterLocation) && (
          <button type="button" onClick={() => { setFilterCategory(''); setFilterVendor(''); setFilterLocation('') }}
            className="text-xs font-semibold text-gray-500 hover:text-gray-700 pb-2 shrink-0">
            {t('items.clearFilters')}
          </button>
        )}
      </div>

      {loading || stockLoading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div> : (
        base.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <p className="text-center text-gray-400 py-16 text-sm">{anyFilterActive ? t('items.noItemsMatch') : t('items.noItemsYet')}</p>
          </div>
        ) : groupSections === null ? (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <ItemsTable items={base} canSeeCost={canSeeCost} canManage={canManage} onEdit={openEdit} onDeactivate={handleDeactivate} onImageClick={setLightboxItem}
              qtyLabel={t('items.totalUnits')} headers={tableHeaders} t={t} />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {groupSections.map((section) => (
              <GroupSection key={section.key} title={section.title} count={section.items.length} itemsLabel={itemsLabel(section.items.length)}>
                {section.items.length === 0 ? (
                  <p className="text-center text-gray-400 py-8 text-sm">{t('items.nothingHere')}</p>
                ) : section.subSections ? (
                  <div className="flex flex-col gap-2 p-3 bg-gray-50/60">
                    {section.subSections.map((sub) => (
                      <GroupSection key={sub.key} title={sub.title} count={sub.items.length} itemsLabel={itemsLabel(sub.items.length)}>
                        <ItemsTable items={sub.items} canSeeCost={canSeeCost} canManage={canManage} onEdit={openEdit} onDeactivate={handleDeactivate} onImageClick={setLightboxItem}
                          qtyMap={section.qtyMap} qtyLabel={section.qtyMap ? t('items.onHand') : t('items.totalUnits')} headers={tableHeaders} t={t} />
                      </GroupSection>
                    ))}
                  </div>
                ) : (
                  <ItemsTable items={section.items} canSeeCost={canSeeCost} canManage={canManage} onEdit={openEdit} onDeactivate={handleDeactivate} onImageClick={setLightboxItem}
                    qtyMap={section.qtyMap} qtyLabel={section.qtyMap ? t('items.onHand') : t('items.totalUnits')} headers={tableHeaders} t={t} />
                )}
              </GroupSection>
            ))}
          </div>
        )
      )}

      <Modal isOpen={!!modal} onClose={() => setModal(null)}
        title={addStockTo ? t('items.addStockTitle') : modal === 'create' ? t('items.addItemTitle') : t('items.editItemTitle')}>
        {addStockTo ? (
          // ── "This already exists" shortcut — just logs a receipt, doesn't touch the item record ──
          <div className="flex flex-col gap-4">
            <div className="bg-brand-100 text-brand-800 rounded-xl px-4 py-3 text-sm flex items-center gap-3">
              {addStockTo.image_url ? (
                <img src={addStockTo.image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-white/50 flex items-center justify-center text-brand-400 text-lg shrink-0">📦</div>
              )}
              <div>
                <p className="font-semibold">{addStockTo.name}</p>
                <p className="text-xs font-mono opacity-80">{addStockTo.sku}</p>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">{t('common.location')}</label>
              <select value={addStockForm.location_id} onChange={(e) => setAddStockForm(f => ({ ...f, location_id: e.target.value }))}
                className="rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
                <option value="">{t('items.selectLocation')}</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <Input label={`${t('common.quantity')} (${addStockTo.unit_of_measure})`} type="number" step="0.01" inputMode="decimal"
              value={addStockForm.qty} onChange={(e) => setAddStockForm(f => ({ ...f, qty: e.target.value }))} />
            {addStockError && <p className="text-xs text-red-500">{addStockError}</p>}
            <Button onClick={handleAddStockSubmit} loading={addStockSaving} fullWidth>{t('items.addStockTitle')}</Button>
            <button type="button" onClick={backToCreate} className="text-xs font-semibold text-gray-500 hover:text-gray-700 self-center">
              {t('items.differentItem')}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-2">
              <input ref={imageInputRef} type="file" accept="image/*" capture="environment" onChange={handleImagePick} className="hidden" />
              <button type="button" onClick={() => imageInputRef.current?.click()} disabled={imageUploading}
                className="w-28 h-28 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 overflow-hidden flex items-center justify-center hover:border-brand-400 transition-colors disabled:opacity-60">
                {imageUploading ? (
                  <Spinner size="md" />
                ) : imagePreviewUrl ? (
                  <img src={imagePreviewUrl} alt={t('items.itemReferenceAlt')} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl text-gray-300">📷</span>
                )}
              </button>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => imageInputRef.current?.click()} disabled={imageUploading}
                  className="text-xs font-semibold text-brand-500 hover:underline disabled:opacity-60">
                  {imagePreviewUrl ? t('items.changePhoto') : t('items.addPhoto')}
                </button>
                {imagePreviewUrl && (
                  <button type="button" onClick={handleRemoveImage} disabled={imageUploading}
                    className="text-xs font-semibold text-red-500 hover:underline disabled:opacity-60">
                    {t('items.removePhoto')}
                  </button>
                )}
              </div>
              {imageError && <p className="text-xs text-red-500">{imageError}</p>}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">{t('common.name')}</label>
              <Input value={form.name} onChange={setName} placeholder={t('items.namePlaceholder')} />
              {nameSuggestions.length > 0 && (
                <div className="mt-1 border border-amber-200 bg-amber-50 rounded-xl p-2 flex flex-col gap-1">
                  <p className="text-xs font-semibold text-amber-800 px-1">{t('items.alreadyRegistered')}</p>
                  {nameSuggestions.map(s => (
                    <button key={s.id} type="button" onClick={() => openAddStockTo(s)}
                      className="flex items-center gap-2 text-left text-sm px-2 py-1.5 rounded-lg hover:bg-amber-100 transition-colors">
                      {s.image_url ? (
                        <img src={s.image_url} alt="" className="w-7 h-7 rounded-md object-cover shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-md bg-white/60 flex items-center justify-center text-gray-300 text-xs shrink-0">📦</div>
                      )}
                      <span className="font-medium text-gray-900">{s.name}</span>
                      <span className="text-xs text-gray-500 font-mono ml-2">{s.sku}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">{t('items.skuPartNumber')}</label>
              <div className="flex gap-2">
                <Input value={form.sku} onChange={set('sku')} className="flex-1 min-w-0" />
                <Button type="button" variant="secondary" size="md" onClick={() => setScannerOpen(true)} title={t('items.scanBarcode')}>📷</Button>
              </div>
              {form.barcode && <p className="text-xs text-brand-700">{t('items.barcodeCaptured')}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">{t('items.category')}</label>
                  {!showNewCategory && <button type="button" onClick={() => setShowNewCategory(true)} className="text-xs font-semibold text-brand-500">{t('common.addNew')}</button>}
                </div>
                <select value={form.category_id} onChange={setCategory}
                  className="rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
                  <option value="">{t('common.none')}</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{translateCategoryName(c.name, t)}</option>)}
                </select>
                {showNewCategory && (
                  <div className="flex gap-2 mt-1">
                    <Input placeholder={t('items.newCategoryPlaceholder')} value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="flex-1 min-w-0" />
                    <Button type="button" variant="secondary" size="md" onClick={handleAddCategory}>{t('common.add')}</Button>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">{t('items.material')}</label>
                  {form.category_id && !showNewMaterial && <button type="button" onClick={() => setShowNewMaterial(true)} className="text-xs font-semibold text-brand-500">{t('common.addNew')}</button>}
                </div>
                <select value={form.material_id} onChange={set('material_id')} disabled={!form.category_id}
                  className="rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-gray-50 disabled:text-gray-400">
                  <option value="">{form.category_id ? t('common.none') : t('items.pickCategory')}</option>
                  {materials.map(m => <option key={m.id} value={m.id}>{translateMaterialName(m.name, t)}</option>)}
                </select>
                {showNewMaterial && (
                  <div className="flex gap-2 mt-1">
                    <Input placeholder={t('items.newMaterialPlaceholder')} value={newMaterial} onChange={(e) => setNewMaterial(e.target.value)} className="flex-1 min-w-0" />
                    <Button type="button" variant="secondary" size="md" onClick={handleAddMaterial}>{t('common.add')}</Button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">{t('common.vendor')}</label>
              <select value={form.vendor_id} onChange={set('vendor_id')}
                className="rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
                <option value="">{t('common.none')}</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>

            <EstimateNumberField
              key={modal && modal !== 'create' ? modal.id : 'new'}
              label={t('items.assignedProject')}
              initialNumber={modal && modal !== 'create' ? (modal.default_project_number ?? '') : ''}
              initialName={modal && modal !== 'create' ? (modal.default_project_name ?? '') : ''}
              onResolved={(project) => setForm(f => ({ ...f, default_project_id: project ? String(project.id) : '' }))}
              helperText={t('items.estimateHelper')}
            />

            {modal === 'create' && (
              <div className="bg-gray-50 rounded-xl p-3 flex flex-col gap-3">
                <p className="text-sm font-medium text-gray-700">{t('items.totalUnitsOnHand')}</p>
                <div className="grid grid-cols-2 gap-3">
                  <Input placeholder={t('common.quantity')} type="number" step="0.01" value={form.initial_qty} onChange={set('initial_qty')} />
                  <select value={form.initial_location_id} onChange={set('initial_location_id')}
                    className="rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
                    <option value="">{t('items.locationEllipsis')}</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              </div>
            )}

            <button type="button" onClick={() => setShowMoreDetails(v => !v)}
              className="text-sm font-semibold text-gray-500 hover:text-gray-700 flex items-center gap-1 self-start">
              {showMoreDetails ? t('items.fewerDetails') : t('items.moreDetails')}
              <span className="text-xs text-gray-400">{t('items.moreDetailsHint')}</span>
            </button>

            {showMoreDetails && (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <Input label={t('items.unitOfMeasure')} value={form.unit_of_measure} onChange={set('unit_of_measure')} placeholder={t('items.unitPlaceholder')} />
                  <Input label={t('items.vendorItemNumber')} value={form.vendor_item_number} onChange={set('vendor_item_number')} placeholder={t('items.vendorItemPlaceholder')} />
                </div>
                <Input label={t('items.dimensions')} value={form.dimensions} onChange={set('dimensions')} placeholder={t('items.dimensionsPlaceholder')} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label={t('items.unitCost')} type="number" step="0.01" value={form.unit_cost} onChange={set('unit_cost')} />
                  <Input label={t('items.reorderPoint')} type="number" value={form.reorder_point} onChange={set('reorder_point')} helperText={t('items.reorderPointHelper')} />
                </div>
                <Input label={t('items.leadTimeDays')} type="number" value={form.lead_time_days} onChange={set('lead_time_days')}
                  helperText={t('items.leadTimeHelper')} />

                {modal === 'create' ? (
                  <Input label={t('items.barcode')} value={form.barcode} onChange={set('barcode')} placeholder={t('items.barcodePlaceholder')} />
                ) : (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700">{t('items.barcodes')}</label>
                    {itemBarcodes.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {itemBarcodes.map(b => (
                          <div key={b.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                            <div>
                              <span className="text-sm font-mono text-gray-700">{b.barcode}</span>
                              {b.label && <span className="text-xs text-gray-400 ml-2">({b.label})</span>}
                            </div>
                            <button type="button" onClick={() => handleRemoveBarcode(b.id)} className="text-xs font-semibold text-red-500 hover:underline">{t('items.removePhoto')}</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Input placeholder={t('items.barcode')} value={newBarcode} onChange={(e) => setNewBarcode(e.target.value)} className="flex-1 min-w-0" />
                      <Input placeholder={t('items.labelOptional')} value={newBarcodeLabel} onChange={(e) => setNewBarcodeLabel(e.target.value)} className="w-32" />
                      <Button type="button" variant="secondary" size="md" onClick={() => setScannerOpen(true)}>📷</Button>
                      <Button type="button" variant="secondary" size="md" onClick={() => handleAddBarcode()}>{t('common.add')}</Button>
                    </div>
                    {barcodeError && <p className="text-xs text-red-500">{barcodeError}</p>}
                    <p className="text-xs text-gray-500">{t('items.barcodeHelper')}</p>
                  </div>
                )}

                <Input label={t('common.notes')} value={form.notes} onChange={set('notes')} />
              </div>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}
            <Button onClick={handleSave} loading={saving} fullWidth>{t('items.saveItem')}</Button>
          </div>
        )}
      </Modal>

      {scannerOpen && (
        <Suspense fallback={<ScannerLoading />}>
          <BarcodeScanner onClose={() => setScannerOpen(false)} onDetected={handleBarcodeScanned} />
        </Suspense>
      )}

      <ImageLightbox src={lightboxItem?.image_url} alt={lightboxItem?.name ?? ''} onClose={() => setLightboxItem(null)} />
    </div>
  )
}
