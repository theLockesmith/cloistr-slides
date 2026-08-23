/**
 * MenuBar — accessible persistent menu bar for Cloistr Slides.
 *
 * Keyboard model (WAI-ARIA Menu pattern):
 *   Menubar:
 *     Left/Right arrow  — move between top-level triggers
 *     Down / Enter / Space — open menu and focus first item
 *   Open menu:
 *     Up/Down arrow     — move between items (wraps)
 *     Left arrow        — close menu; move to previous top-level trigger
 *     Right arrow       — close menu; move to next top-level trigger
 *     Home / End        — first / last item
 *     Enter / Space     — activate (no-op on aria-disabled items)
 *     Escape            — close menu; return focus to trigger
 *   Global:
 *     Escape            — close any open menu
 *     Outside click     — close any open menu
 *
 * Mobile treatment (≤768 px): the full menubar is replaced by a hamburger
 * button that opens a bottom sheet. All six menus are shown as <details>
 * accordion sections with touch-friendly item buttons. A horizontal bar at
 * 390 px would require sub-10 px hit targets or overflow — neither is
 * acceptable. The accordion is the same approach as Google Slides mobile
 * (overflow drawer) adapted to our design system.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────

export interface MenuAction {
  id: string
  label: string
  /** Displayed next to the label; must also be registered as a working shortcut in the host component. */
  shortcut?: string
  disabled?: boolean
  /** Tooltip text shown on hover when disabled. */
  disabledReason?: string
  danger?: boolean
  onClick?: () => void
}

export interface MenuSeparator {
  id: string
  isSeparator: true
}

export type MenuItem = MenuAction | MenuSeparator

export interface MenuDef {
  id: string
  label: string
  items: MenuItem[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isSep(item: MenuItem): item is MenuSeparator {
  return 'isSeparator' in item && (item as MenuSeparator).isSeparator === true
}

// ── Dropdown ───────────────────────────────────────────────────────────────

function Dropdown({
  items,
  onActivate,
  onClose,
  onMovePrev,
  onMoveNext,
}: {
  items: MenuItem[]
  onActivate: (item: MenuAction) => void
  onClose: () => void
  onMovePrev: () => void
  onMoveNext: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  // Focus the first item on mount. All items are focusable (including
  // aria-disabled ones) per the ARIA menu pattern — screen readers expect to
  // reach disabled items and hear them announced as unavailable.
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')
    first?.focus()
  }, [])

  const getAllItems = () =>
    Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const all = getAllItems()
    const idx = all.indexOf(document.activeElement as HTMLButtonElement)

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault(); e.stopPropagation()
        all[(idx + 1) % all.length]?.focus()
        break
      }
      case 'ArrowUp': {
        e.preventDefault(); e.stopPropagation()
        all[(idx - 1 + all.length) % all.length]?.focus()
        break
      }
      case 'ArrowLeft': {
        e.preventDefault(); e.stopPropagation()
        onClose(); onMovePrev()
        break
      }
      case 'ArrowRight': {
        e.preventDefault(); e.stopPropagation()
        onClose(); onMoveNext()
        break
      }
      case 'Home': {
        e.preventDefault()
        all[0]?.focus()
        break
      }
      case 'End': {
        e.preventDefault()
        all[all.length - 1]?.focus()
        break
      }
      case 'Escape': {
        e.preventDefault(); e.stopPropagation()
        onClose()
        break
      }
      // Enter/Space are handled natively by the button element's click handler.
    }
  }

  return (
    <div ref={ref} role="menu" className="slides-menubar-dropdown" onKeyDown={handleKeyDown}>
      {items.map((item) => {
        if (isSep(item)) {
          return <div key={item.id} role="separator" className="slides-menubar-sep" />
        }
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            tabIndex={-1}
            className={[
              'slides-menubar-menuitem',
              item.disabled ? 'is-disabled' : '',
              item.danger ? 'is-danger' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-disabled={item.disabled}
            title={item.disabled && item.disabledReason ? item.disabledReason : undefined}
            onClick={() => {
              if (!item.disabled) onActivate(item)
            }}
          >
            <span className="slides-menubar-menuitem-label">{item.label}</span>
            {item.shortcut && (
              <kbd className="slides-menubar-menuitem-shortcut" aria-hidden="true">
                {item.shortcut}
              </kbd>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── MenuBar ────────────────────────────────────────────────────────────────

interface Props {
  menus: MenuDef[]
}

export function MenuBar({ menus }: Props) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([])
  const barRef = useRef<HTMLElement>(null)

  // Close on outside click
  useEffect(() => {
    if (openIdx === null && !mobileOpen) return
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenIdx(null)
        setMobileOpen(false)
      }
    }
    document.addEventListener('mousedown', handler, { capture: true })
    return () => document.removeEventListener('mousedown', handler, { capture: true })
  }, [openIdx, mobileOpen])

  // Global Escape closes everything (backup in addition to Dropdown's own handler)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenIdx(null)
        setMobileOpen(false)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const moveFocus = (idx: number, andOpen: boolean) => {
    if (andOpen) setOpenIdx(idx)
    else if (openIdx !== null) setOpenIdx(idx)
    triggerRefs.current[idx]?.focus()
  }

  const onTriggerKeyDown = (e: React.KeyboardEvent, idx: number) => {
    switch (e.key) {
      case 'ArrowLeft': {
        e.preventDefault()
        moveFocus((idx - 1 + menus.length) % menus.length, false)
        break
      }
      case 'ArrowRight': {
        e.preventDefault()
        moveFocus((idx + 1) % menus.length, false)
        break
      }
      case 'ArrowDown':
      case 'Enter':
      case ' ': {
        e.preventDefault()
        setOpenIdx(idx)
        break
      }
      case 'Escape': {
        e.preventDefault()
        setOpenIdx(null)
        triggerRefs.current[idx]?.focus()
        break
      }
    }
  }

  const activateItem = useCallback((item: MenuAction) => {
    setOpenIdx(null)
    if (!item.disabled) item.onClick?.()
  }, [])

  return (
    <nav ref={barRef} className="slides-menubar" aria-label="Application menu">
      {/* ── Desktop: full menu bar ── */}
      <div role="menubar" className="slides-menubar-inner">
        {menus.map((menu, idx) => (
          <div key={menu.id} className="slides-menubar-entry">
            <button
              ref={(el) => {
                triggerRefs.current[idx] = el
              }}
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={openIdx === idx}
              className={`slides-menubar-trigger${openIdx === idx ? ' is-open' : ''}`}
              onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
              onKeyDown={(e) => onTriggerKeyDown(e, idx)}
            >
              {menu.label}
            </button>

            {openIdx === idx && (
              <Dropdown
                items={menu.items}
                onActivate={activateItem}
                onClose={() => {
                  setOpenIdx(null)
                  triggerRefs.current[idx]?.focus()
                }}
                onMovePrev={() => moveFocus((idx - 1 + menus.length) % menus.length, true)}
                onMoveNext={() => moveFocus((idx + 1) % menus.length, true)}
              />
            )}
          </div>
        ))}
      </div>

      {/* ── Mobile: hamburger button ── */}
      <button
        type="button"
        className="slides-menubar-hamburger"
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={mobileOpen}
        aria-haspopup="dialog"
        onClick={() => setMobileOpen((o) => !o)}
      >
        <span className={`slides-hamburger-icon${mobileOpen ? ' is-open' : ''}`}>
          <span />
          <span />
          <span />
        </span>
      </button>

      {/* ── Mobile overlay ── */}
      {mobileOpen && (
        <div
          className="slides-mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Application menu"
        >
          <div className="slides-mobile-menu-header">
            <strong>Menu</strong>
            <button
              type="button"
              className="slides-mobile-menu-close"
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
            >
              ✕
            </button>
          </div>
          <div className="slides-mobile-menu-body">
            {menus.map((menu) => (
              <details key={menu.id} className="slides-mobile-section">
                <summary className="slides-mobile-section-title">{menu.label}</summary>
                <div className="slides-mobile-section-items">
                  {menu.items.map((item) => {
                    if (isSep(item)) {
                      return <div key={item.id} role="separator" className="slides-menubar-sep" />
                    }
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={[
                          'slides-mobile-item',
                          item.disabled ? 'is-disabled' : '',
                          item.danger ? 'is-danger' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        aria-disabled={item.disabled}
                        title={
                          item.disabled && item.disabledReason ? item.disabledReason : undefined
                        }
                        onClick={() => {
                          if (!item.disabled && item.onClick) {
                            setMobileOpen(false)
                            item.onClick()
                          }
                        }}
                      >
                        <span>{item.label}</span>
                        {item.shortcut && (
                          <kbd className="slides-mobile-shortcut">{item.shortcut}</kbd>
                        )}
                      </button>
                    )
                  })}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </nav>
  )
}
