import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resolveServiceAddresses } from './serviceAddresses'

/**
 * Why this test exists.
 *
 * This app decided its relay in App.tsx, its file host from a literal in
 * SlideEditor.tsx, and its signer not at all (the shared auth provider fell
 * back to a hardcoded production default). A staging deployment of this image
 * would have uploaded to the production file host and signed in against the
 * production signer.
 *
 * resolveServiceAddresses is the single place that decision now happens. The
 * assertions below are the app's half of the done criteria: production
 * unchanged, and a staging environment reaching no production host.
 */
const GLOBAL = '__CLOISTR_CONFIG__'

const PRODUCTION_RELAY = 'wss://relay.cloistr.xyz'
const PRODUCTION_SIGNER = 'https://signer.cloistr.xyz'

function setRuntimeConfig(value: unknown): void {
  ;(globalThis as any).window = { [GLOBAL]: value }
}

/**
 * "Production" means a cloistr.xyz host that is NOT under the staging
 * subdomain. Parse the host rather than matching a substring: staging hosts
 * legitimately end with cloistr.xyz.
 */
function isProductionHost(value: string): boolean {
  const host = new URL(value).hostname
  return host.endsWith('cloistr.xyz') && !host.endsWith('.staging.cloistr.xyz')
}

beforeEach(() => {
  delete (globalThis as any).window
})

afterEach(() => {
  delete (globalThis as any).window
})

describe('with no runtime configuration, which is production', () => {
  it('still uses the production relay', () => {
    expect(resolveServiceAddresses().relayUrl).toBe(PRODUCTION_RELAY)
  })

  it('still uses the production signer', () => {
    expect(resolveServiceAddresses().signerUrl).toBe(PRODUCTION_SIGNER)
  })

  it('reports production as the environment', () => {
    expect(resolveServiceAddresses().environment).toBe('production')
  })
})

describe('with a staging runtime configuration', () => {
  const staging = {
    relayUrl: 'wss://relay.staging.cloistr.xyz',
    blossomUrl: 'https://files.staging.cloistr.xyz',
    signerUrl: 'https://signer.staging.cloistr.xyz',
    discoveryUrl: 'https://discover.staging.cloistr.xyz',
    environment: 'staging',
  }

  it('follows the relay it was given', () => {
    setRuntimeConfig(staging)
    expect(resolveServiceAddresses().relayUrl).toBe(staging.relayUrl)
  })

  it('follows the file host it was given', () => {
    setRuntimeConfig(staging)
    expect(resolveServiceAddresses().blossomUrl).toBe(staging.blossomUrl)
  })

  it('follows the signer it was given', () => {
    setRuntimeConfig(staging)
    expect(resolveServiceAddresses().signerUrl).toBe(staging.signerUrl)
  })

  it('follows the discovery host it was given', () => {
    setRuntimeConfig(staging)
    expect(resolveServiceAddresses().discoveryUrl).toBe(staging.discoveryUrl)
  })

  it('reaches NO production host at all', () => {
    setRuntimeConfig(staging)
    const resolved = resolveServiceAddresses()
    for (const value of [
      resolved.relayUrl,
      resolved.blossomUrl,
      resolved.signerUrl,
      resolved.discoveryUrl,
    ]) {
      expect(isProductionHost(value), `${value} resolves to a production host`).toBe(false)
    }
  })

  it('reports staging as the environment', () => {
    setRuntimeConfig(staging)
    expect(resolveServiceAddresses().environment).toBe('staging')
  })
})

describe('partial configuration', () => {
  it('overrides only what it names and leaves the rest at production', () => {
    setRuntimeConfig({ relayUrl: 'wss://relay.staging.cloistr.xyz' })
    const resolved = resolveServiceAddresses()
    expect(resolved.relayUrl).toBe('wss://relay.staging.cloistr.xyz')
    expect(resolved.signerUrl).toBe(PRODUCTION_SIGNER)
  })

  it('treats an empty value as absent, because unset variables substitute to empty strings', () => {
    setRuntimeConfig({ relayUrl: '', signerUrl: '' })
    const resolved = resolveServiceAddresses()
    expect(resolved.relayUrl).toBe(PRODUCTION_RELAY)
    expect(resolved.signerUrl).toBe(PRODUCTION_SIGNER)
  })
})
