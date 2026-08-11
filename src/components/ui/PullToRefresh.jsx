import { useState, useRef } from 'react'

const THRESHOLD   = 65   // px of pull needed to trigger refresh
const INDICATOR_H = 44   // px — height of the indicator circle slot

export default function PullToRefresh({ children, className = '', style, onRefresh }) {
  const [pullY,      setPullY]      = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const ref    = useRef(null)
  const startY = useRef(null)

  const atTop = () => (ref.current?.scrollTop ?? 0) < 2

  function onTouchStart(e) {
    if (atTop() && !refreshing) startY.current = e.touches[0].clientY
  }

  function onTouchMove(e) {
    if (startY.current === null) return
    if (!atTop()) { startY.current = null; setPullY(0); return }
    const dy = e.touches[0].clientY - startY.current
    if (dy <= 0) { setPullY(0); return }
    // Dampen the pull so it feels resistant
    setPullY(Math.min(dy * 0.48, THRESHOLD + 22))
  }

  function onTouchEnd() {
    if (pullY >= THRESHOLD && !refreshing) {
      setRefreshing(true)
      setPullY(0)
      setTimeout(() => {
        if (onRefresh) {
          onRefresh()
          setTimeout(() => setRefreshing(false), 400)
        } else {
          window.location.reload()
        }
      }, 900)
    } else {
      setPullY(0)
    }
    startY.current = null
  }

  // How far to shift content down (indicator slides up from below this offset)
  const shift    = refreshing ? INDICATOR_H : pullY
  const progress = Math.min(pullY / THRESHOLD, 1)
  const isReady  = pullY >= THRESHOLD

  return (
    <div
      ref={ref}
      className={`overflow-y-auto ${className}`}
      style={{ ...style, overscrollBehavior: 'contain' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Content wrapper — translates down while pulling, revealing the indicator above.
          Only set `transform` when actually shifted: leaving translateY(0px) applied at
          rest forces a permanent GPU compositing layer over all page content, which in
          some browsers subtly changes text antialiasing right at the layer's top edge
          (visible as the page title looking slightly clipped). */}
      <div style={{
        ...(shift ? { transform: `translateY(${shift}px)` } : {}),
        transition: shift === 0 ? 'transform 0.28s ease' : 'none',
        minHeight:  '100%',
        position:   'relative',
      }}>
        {/* Indicator — lives above the content (negative top) */}
        <div
          className="absolute inset-x-0 flex items-center justify-center pointer-events-none"
          style={{ top: -INDICATOR_H, height: INDICATOR_H }}>
          <div className={`w-9 h-9 rounded-full bg-white shadow-lg border border-gray-100
            flex items-center justify-center transition-opacity duration-150
            ${pullY > 10 || refreshing ? 'opacity-100' : 'opacity-0'}`}>
            {refreshing
              ? <svg className="w-[18px] h-[18px] text-brand-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              : <svg
                  className={`w-[18px] h-[18px] transition-colors duration-150 ${isReady ? 'text-brand-500' : 'text-gray-400'}`}
                  style={{ transform: `rotate(${progress * 210}deg)` }}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
            }
          </div>
        </div>

        {children}
      </div>
    </div>
  )
}
