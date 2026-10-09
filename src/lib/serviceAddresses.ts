import { getServiceConfig, type ServiceConfig } from '@cloistr/collab-common/config'

/**
 * Where this app's services live.
 *
 * Resolution order, highest first: configuration the container wrote at
 * startup, then the value compiled in at build time, then the shared default.
 * With no runtime configuration this returns exactly what the build args set,
 * which is why adopting this changed nothing for production.
 *
 * One named home for the decision, with a test. Before this, the relay was
 * decided in App.tsx, the file host was a literal in SlideEditor.tsx, and the
 * signer was not decided here at all (the shared auth provider fell back to its
 * own hardcoded production default). None of that could be asserted about
 * without rendering the app.
 */
export function resolveServiceAddresses(): ServiceConfig {
  return getServiceConfig()
}
