import { SlideEditor } from './components/SlideEditor'
import { useNostrAuth } from '@cloistr/auth'
import { getOrCreateDocumentId, getServiceConfig } from '@cloistr/collab-common/config'
import {
  Header,
  Footer,
  SharedAuthProvider,
  ToastProvider,
  LoginPrompt,
  ThemeProvider,
  SignerRecovery,
  useSharedSession,
  useToast,
} from '@cloistr/ui/components'
import '@cloistr/ui/styles'
import { useEffect, useRef, useState } from 'react'

// Service configuration from environment
const config = getServiceConfig()

/**
 * Mobile NIP-46 auth recovery.
 *
 * Root cause (confirmed by reading startNostrConnect in @cloistr/auth@0.6.0):
 * The nostrconnect:// approval flow creates temporary WebSockets to
 * relay.cloistr.xyz. Those sockets have NO ws.onclose handler and NO visibility
 * recovery (unlike Nip46Signer which has installVisibilityRecovery). When the
 * mobile OS puts the browser in the background while the user switches to
 * Cloistr Signer to approve, the sockets die. The signer publishes the approval
 * event (kind:24133, ephemeral), but the relay has no active subscription and
 * drops it permanently. The `approved` promise then times out at 30 seconds.
 *
 * The 12-second safety cap in SharedAuthProvider fires first: isResolving
 * releases, the app renders LoginPrompt, and the user sees a sign-in screen even
 * though they hold a valid session.
 *
 * App-level workaround: when the page comes back visible after being backgrounded
 * during the connecting window and auth did not succeed, reload the page once.
 * This restarts the SSO restore flow from scratch with fresh WebSocket
 * connections that will succeed while the browser stays in the foreground.
 *
 * The reload is debounced via sessionStorage so it runs at most once per 30
 * seconds and never loops.
 *
 * Long-term fix: add a ws.onclose handler and visibility recovery to
 * startNostrConnect in @cloistr/auth. File as a package issue.
 */
function useMobileAuthRecovery() {
  const { authState } = useNostrAuth()
  const { info } = useToast()

  // Was auth in a non-complete state when the page was last hidden?
  const wasConnectingRef = useRef(false)

  // Track connecting state through renders
  useEffect(() => {
    if (!authState.isConnected) {
      wasConnectingRef.current = authState.isConnecting
    }
  }, [authState.isConnected, authState.isConnecting])

  useEffect(() => {
    const RELOAD_KEY = 'cloistr:auth:mobile-recovery-reload'

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Record whether we are in a non-authenticated state when going hidden.
        wasConnectingRef.current = !authState.isConnected
        return
      }

      // Page is becoming visible again.
      if (authState.isConnected) return // auth succeeded; nothing to do

      if (!wasConnectingRef.current) return // was not trying to auth when hidden

      // Debounce: do not reload more than once every 30 seconds.
      let lastReload = 0
      try {
        lastReload = parseInt(sessionStorage.getItem(RELOAD_KEY) ?? '0', 10)
      } catch {
        // sessionStorage unavailable in private/restricted contexts; skip.
        return
      }

      const now = Date.now()
      if (now - lastReload < 30000) {
        // Already reloaded recently. Just show the toast so the user can reload
        // manually if the automatic one did not help.
        info(
          'Sign-in was interrupted (you may have switched apps). Reload the page to reconnect.',
          { duration: 12000 },
        )
        return
      }

      try {
        sessionStorage.setItem(RELOAD_KEY, String(now))
      } catch {
        return
      }

      // Auto-reload. The brief flash is intentional: the user will see the
      // SSO restore view ("Signing you in…") instead of the login screen.
      window.location.reload()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [authState.isConnected, info])
}

/**
 * Main content - shows login prompt or slide editor based on auth state
 *
 * Session vs signer reachability are separate facts. An NIP-46 approval
 * timeout or relay hiccup is a SIGNER REACHABILITY failure, not a session
 * expiry, and must not send the user to a credential prompt.
 *
 * The three states that matter:
 *   isConnected   true => render the editor
 *   connectFailed true => render SignerRecovery (session still valid)
 *   neither       true => render LoginPrompt (genuinely not signed in)
 *
 * connectFailed is set when an auth flow (isConnecting) ends without
 * isConnected becoming true. That covers: relay unreachable during NIP-46
 * handshake, approval timeout, or the SSO restore failing to reconnect the
 * signer after a network drop.
 */
function AppContent() {
  const { authState, signer } = useNostrAuth()
  const { isResolving } = useSharedSession()
  const [documentId] = useState(() => getOrCreateDocumentId('slides'))

  useMobileAuthRecovery()

  const isConnected = !!authState?.isConnected && !!signer && !!authState?.pubkey
  const isConnecting = !!authState?.isConnecting || !!authState?.isSwitching || isResolving

  // Part 1+3: detect a failed connect attempt so we can surface SignerRecovery
  // instead of LoginPrompt. wasConnecting tracks whether an auth flow was in
  // progress so we only fire on genuine attempts, not on the initial idle state.
  const [connectFailed, setConnectFailed] = useState(false)
  const wasConnecting = useRef(false)

  useEffect(() => {
    if (isConnecting) {
      wasConnecting.current = true
      setConnectFailed(false)
      return
    }
    if (wasConnecting.current && !isConnected) {
      wasConnecting.current = false
      setConnectFailed(true)
    }
  }, [isConnecting, isConnected])

  // useMobileAuthRecovery (above) already reloads on visibilitychange, scoped
  // to the nostrconnect approval window. The signer-resilience branch added a
  // SECOND visibilitychange reload keyed on connectFailed; keeping both would
  // reload twice for one event. Only the approval-window one is retained.
  // Reconnect for an ALREADY-PAIRED session is handled inside @cloistr/ui
  // 0.27.0 by useRelayReconnect, mounted automatically by SharedAuthProvider,
  // which reconnects relays without a page reload.
  return (
    <div className="slides-app">
      <Header activeServiceId="slides" />

      <main className="slides-main-region">
        {isConnected ? (
          <SlideEditor
            documentId={documentId}
            signer={signer}
            publicKey={authState.pubkey!}
            relayUrl={config.relayUrl}
          />
        ) : connectFailed ? (
          /*
           * Parts 1+3: signer was unreachable — session is still valid.
           * Show recovery; never a credential prompt.
           *
           * onRetry reloads so the SSO restore runs again with fresh sockets.
           * onGoBack clears the failed state so the user can try a different
           * account or just dismisses the panel; it does NOT touch session
           * storage or clear auth.
           */
          <SignerRecovery
            error={authState?.error ?? { code: 'CONNECTION_FAILED' }}
            retrying={isConnecting}
            onRetry={() => {
              setConnectFailed(false)
              window.location.reload()
            }}
            onGoBack={() => setConnectFailed(false)}
          />
        ) : (
          <LoginPrompt
            title="Cloistr Slides"
            subtitle="Collaborative presentations powered by Nostr"
            callToAction="Sign in to create or edit presentations."
          />
        )}
      </main>

      <Footer />
    </div>
  )
}

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <SharedAuthProvider>
          <AppContent />
        </SharedAuthProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}

export default App
