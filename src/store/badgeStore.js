import { create } from 'zustand'
import { listRequests } from '../api/requests'
import { listOrders } from '../api/orders'

// Drives the small "something needs your attention" bubbles on the
// Requests/Counts/Orders nav items. Requests + Orders come from the server
// (re-fetched on a timer and right after any action that could change
// them); the Counts draft is purely local — there's no server-side concept
// of an in-progress count session, so Counts.jsx owns persisting its own
// checklist progress under this key and just flips the reactive flag below
// to match. Exported so Counts.jsx writes to the exact same key this reads.
export const COUNTS_DRAFT_STORAGE_KEY = 'inventory-counts-draft'

const readCountsDraftFlag = () => {
  try { return !!localStorage.getItem(COUNTS_DRAFT_STORAGE_KEY) } catch { return false }
}

export const useBadgeStore = create((set) => ({
  openRequestsCount: 0,
  ordersAttentionCount: 0,
  hasCountsDraft: readCountsDraftFlag(),

  // Only specialists/admins act on requests or orders, so this is a no-op
  // (and stays a no-op, badge-wise) for a basic user.
  refresh: async (canManage) => {
    if (!canManage) return
    try {
      const [reqData, orderData] = await Promise.all([
        listRequests({ status: 'open' }),
        listOrders(),
      ])
      set({
        openRequestsCount: (reqData.requests ?? []).length,
        // "Needs attention" = an open discrepancy against it, or the
        // delivery was started but hasn't been fully checked in yet.
        // Plain 'placed' (nothing's arrived at all) is just normal
        // waiting, not something to flag.
        ordersAttentionCount: (orderData.orders ?? [])
          .filter((o) => o.has_open_discrepancy || o.status === 'partially_received' || o.status === 'awaiting_item_setup').length,
      })
    } catch {
      // Transient network blip — badges just stay at their last known value.
    }
  },

  // localStorage itself is written by Counts.jsx (it needs to store more
  // than a flag — the actual draft data); this just keeps the badge's
  // reactive state in sync with that within the current tab.
  setCountsDraft: (has) => set({ hasCountsDraft: has }),
}))
