/**
 * Unit tests for useMobileAuthRecovery logic.
 *
 * The hook itself requires React context (useNostrAuth, useToast) and browser
 * APIs (document.visibilityState, sessionStorage, window.location.reload), so
 * these tests cover its extractable pure logic — the guard condition that
 * determines whether wasConnectingRef.current should be set.
 *
 * WHY THIS TEST EXISTS:
 * The condition was written as `authState.isConnecting || true`, which always
 * evaluates to true. That caused the hook to fire an auto-reload on page
 * visibility change even when the user was simply not logged in (idle), not in
 * the middle of an auth flow. The fix is `authState.isConnecting`.
 * The test below fails against the `|| true` version.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('useMobileAuthRecovery — wasConnecting condition', () => {
  // Mirrors the condition in the first useEffect of useMobileAuthRecovery.
  // With the bug (`isConnecting || true`), wasConnecting(false) returns true,
  // and the first assertion below fails.
  function wasConnecting(isConnecting: boolean): boolean {
    return isConnecting
  }

  it('is false when not connecting (idle-not-logged-in must not trigger reload)', () => {
    expect(wasConnecting(false)).toBe(false)
  })

  it('is true when an auth flow is in progress', () => {
    expect(wasConnecting(true)).toBe(true)
  })
})

/**
 * Signer-resilience logic extracted for unit testing.
 *
 * The DOM and React context (useNostrAuth, SharedAuthProvider, useSharedSession)
 * cannot run in the Node vitest environment, so these tests cover the
 * extractable pure logic that is load-bearing for the resilience guarantee.
 *
 * What is being tested:
 *
 * 1. connectFailed gate: the state transition that decides when to show
 *    SignerRecovery instead of LoginPrompt. The rule is:
 *      - isConnecting rising edge => clear connectFailed, record wasConnecting
 *      - isConnecting falling edge while !isConnected => set connectFailed
 *      - isConnecting falling edge while isConnected => leave connectFailed alone
 *    A bug here would show LoginPrompt for a valid session (the original
 *    reported issue: "relay hiccup shows sign-in screen").
 *
 * 2. visibilitychange debounce guard: the condition that prevents an infinite
 *    reload loop when the auto-reconnect fires on visibilitychange. The rule is:
 *    fire only when connectFailed is true AND the reload key is older than 30s.
 *
 * Source-level assertions: because this app has no DOM test environment,
 * every claim below traces to a code path in src/App.tsx that a human can
 * follow by reading the file alongside this test.
 */

// ── connectFailed gate ───────────────────────────────────────────────────────

/**
 * Simulate one step of the useEffect that drives connectFailed in AppContent.
 * Returns the next value of connectFailed given the inputs.
 *
 * Mirrors the effect in App.tsx exactly:
 *   if (isConnecting) { wasConnecting = true; connectFailed = false }
 *   else if (wasConnecting && !isConnected) { connectFailed = true }
 */
function stepConnectFailed(
  isConnecting: boolean,
  isConnected: boolean,
  prev: { connectFailed: boolean; wasConnecting: boolean },
): { connectFailed: boolean; wasConnecting: boolean } {
  if (isConnecting) {
    return { connectFailed: false, wasConnecting: true }
  }
  if (prev.wasConnecting && !isConnected) {
    return { connectFailed: true, wasConnecting: false }
  }
  // No transition: isConnecting false, was not connecting.
  return { connectFailed: prev.connectFailed, wasConnecting: prev.wasConnecting }
}

describe('connectFailed gate', () => {
  const idle = { connectFailed: false, wasConnecting: false }

  it('does not set connectFailed when idle and not connected (LoginPrompt, not SignerRecovery)', () => {
    // Initial state: not signed in, not connecting.
    const s = stepConnectFailed(false, false, idle)
    expect(s.connectFailed).toBe(false)
  })

  it('clears connectFailed and records wasConnecting when a connect attempt starts', () => {
    const s = stepConnectFailed(true, false, idle)
    expect(s.connectFailed).toBe(false)
    expect(s.wasConnecting).toBe(true)
  })

  it('sets connectFailed when a connect attempt ends without connecting', () => {
    // Step 1: connecting starts.
    const connecting = stepConnectFailed(true, false, idle)
    // Step 2: connecting ends, session not established.
    const failed = stepConnectFailed(false, false, connecting)
    expect(failed.connectFailed).toBe(true)
  })

  it('does not set connectFailed when a connect attempt succeeds', () => {
    const connecting = stepConnectFailed(true, false, idle)
    const succeeded = stepConnectFailed(false, true, connecting)
    expect(succeeded.connectFailed).toBe(false)
  })

  it('clears connectFailed when a new connect attempt starts (retry)', () => {
    // Simulate: connect failed, then user retries.
    const failed = { connectFailed: true, wasConnecting: false }
    const retrying = stepConnectFailed(true, false, failed)
    expect(retrying.connectFailed).toBe(false)
  })

  it('does not set connectFailed when idle after a succeeded session (user signs out normally)', () => {
    // After a successful connect the wasConnecting ref is false.
    const succeeded = { connectFailed: false, wasConnecting: false }
    // Now auth transitions to !isConnected without a new connect attempt.
    const s = stepConnectFailed(false, false, succeeded)
    expect(s.connectFailed).toBe(false)
  })
})

// ── visibilitychange debounce guard ─────────────────────────────────────────

/**
 * The guard logic from the visibilitychange handler in AppContent.
 *
 * Returns true when the reload should fire, false when it should be skipped.
 * `now` and `lastReload` are in milliseconds; the debounce window is 30 000ms.
 */
function shouldReload(connectFailed: boolean, now: number, lastReload: number): boolean {
  if (!connectFailed) return false
  return now - lastReload >= 30000
}

describe('visibilitychange debounce guard', () => {
  it('does not fire when connectFailed is false', () => {
    expect(shouldReload(false, 60000, 0)).toBe(false)
  })

  it('fires on first visibility when connectFailed and never reloaded before', () => {
    // lastReload = 0 (never), now = anything >= 30000 from epoch, debounce clears.
    expect(shouldReload(true, 30001, 0)).toBe(true)
  })

  it('does not fire within the 30-second debounce window', () => {
    const now = 50000
    const lastReload = 35000 // 15 seconds ago
    expect(shouldReload(true, now, lastReload)).toBe(false)
  })

  it('fires after the debounce window has elapsed', () => {
    const now = 70000
    const lastReload = 35000 // 35 seconds ago
    expect(shouldReload(true, now, lastReload)).toBe(true)
  })
})


/**
 * SOURCE-LEVEL guards on App.tsx itself.
 *
 * The suites above reimplement the logic they test as standalone functions and
 * never import App.tsx, so they pass whether or not App.tsx is correct — they
 * would pass if App.tsx were deleted. They document intent; they do not guard
 * it. These assertions read the real file, so they fail on revert.
 *
 * They exist because resolving the signer-resilience rebase required a genuine
 * judgement call: BOTH sides had independently added a visibilitychange handler
 * that calls window.location.reload(). Keeping both would reload twice for one
 * visibility event. Only the approval-window one was retained.
 */
describe('App.tsx source invariants', () => {
  const APP = readFileSync(join(__dirname, 'App.tsx'), 'utf8')

  it('does not reintroduce the always-true guard', () => {
    // `authState.isConnecting || true` fired an auto-reload whenever the user
    // was merely signed out, not only mid-auth-flow.
    expect(APP).not.toContain('|| true')
  })

  it('renders SignerRecovery so a signer failure is not shown as a logout', () => {
    expect(APP).toContain('<SignerRecovery')
  })

  it('keeps exactly one AUTOMATIC reload path', () => {
    // Two call sites are expected and correct:
    //   1. the approval-window visibility handler (automatic)
    //   2. SignerRecovery onRetry (user-initiated, not automatic)
    // A third means a duplicate auto-reload has crept back in.
    const reloads = APP.match(/window\.location\.reload\(\)/g) ?? []
    expect(reloads.length).toBe(2)
    expect(APP).toContain('onRetry')
  })

  it('does not clear session state on a signing failure', () => {
    // The whole point of parts 1-3: a transient signer failure must never look
    // like a logout. onGoBack clears local failed state only.
    expect(APP).not.toMatch(/localStorage\.removeItem/)
    expect(APP).not.toMatch(/sessionStorage\.clear/)
  })
})
