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
      wasConnectingRef.current = authState.isConnecting || true
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
 * The presentation itself lives in the editor's Yjs document, not here. App
 * used to own a React copy and pass it down, which meant anything arriving
 * through Yjs — a loaded snapshot, a collaborator's edit — had nowhere to go.
 */
function AppContent() {
  const { authState, signer } = useNostrAuth()
  const [documentId] = useState(() => getOrCreateDocumentId('slides'))

  useMobileAuthRecovery()

  return (
    <div className="slides-app">
      <Header activeServiceId="slides" />

      <main className="slides-main-region">
        {authState.isConnected && signer && authState.pubkey ? (
          <SlideEditor
            documentId={documentId}
            signer={signer}
            publicKey={authState.pubkey}
            relayUrl={config.relayUrl}
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
