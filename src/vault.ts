/**
 * Credential verification utilities — Pattern 4 (vault) and Pattern 6b (data access)
 *
 * Implementers use these to verify Threshold-issued credentials locally,
 * without calling back to Threshold. Verification uses the published
 * ECDSA P-256 public key — data flows never touch Threshold.
 *
 * Usage:
 *   import { verifyVaultCredential, verifyDataCredential } from '@threshold-labs/integration/vault'
 *
 *   // Pattern 4 — vault access
 *   const { grantee, scope, grantId, expiresAt } = await verifyVaultCredential(
 *     bearerToken,
 *     { audience: 'project-control' }
 *   )
 *
 *   // Pattern 6b — trust-scoped data access
 *   const { grantee, trustLevel, ownerId, grantId } = await verifyDataCredential(
 *     bearerToken,
 *     { audience: 'my-capability-id' }
 *   )
 */

// Threshold's ECDSA P-256 public key for vault credential signing.
// Also available at: https://thresholdlabs.io/.well-known/jwks.json
const VAULT_PUBLIC_JWK: JsonWebKey = {
  key_ops: ['verify'],
  ext: true,
  kty: 'EC',
  x: 'xZBQ4gQz1NPD5VGgDet-TpXeJE2QZ9rCwdL0m8GygFM',
  y: 'r0i29kDds4qkbN33GjX95HNpXy-c3_275aZhRJZLg9g',
  crv: 'P-256',
}
const VAULT_PUBLIC_KID = 'vault-signing-1'

const VAULT_ISSUER = 'https://thresholdlabs.io'
const VAULT_TOKEN_PREFIX = 'thld_va_'

export interface VaultCredentialPayload {
  /** The app slug that was granted access (the consumer) */
  grantee: string
  /** The vault app slug this credential is scoped to (should match your app) */
  audience: string
  /** The capability scope granted, e.g. 'edges:read:current' */
  scope: string
  /** The app_data_grants row that authorized this credential */
  grantId: string
  /** When this credential expires */
  expiresAt: Date
}

export class VaultCredentialError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultCredentialError'
  }
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + (4 - str.length % 4) % 4, '=')
  const binary = atob(padded)
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)))
}

/**
 * Verify a Threshold-issued vault credential.
 *
 * Throws VaultCredentialError if the credential is invalid, expired,
 * wrong audience, or has an invalid signature.
 *
 * @param token - The full Bearer token value (with or without 'Bearer ' prefix)
 * @param options.audience - Your vault's app slug. Credential must be scoped to this.
 * @param options.crypto - Optional crypto implementation (defaults to globalThis.crypto)
 */
export async function verifyVaultCredential(
  token: string,
  options: { audience: string; crypto?: Crypto }
): Promise<VaultCredentialPayload> {
  const subtle = (options.crypto ?? globalThis.crypto).subtle

  // Strip prefix
  const raw = token.replace(/^Bearer\s+/i, '').replace(VAULT_TOKEN_PREFIX, '')
  const parts = raw.split('.')
  if (parts.length !== 3) {
    throw new VaultCredentialError('Invalid credential format')
  }

  const [headerB64, payloadB64, sigB64] = parts
  const signingInput = `${headerB64}.${payloadB64}`

  // Decode payload
  let payload: {
    iss?: string; sub?: string; aud?: string; scope?: string;
    grant_id?: string; iat?: number; exp?: number
  }
  try {
    payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)))
  } catch {
    throw new VaultCredentialError('Invalid credential payload')
  }

  // Validate claims
  const now = Math.floor(Date.now() / 1000)
  if (payload.iss !== VAULT_ISSUER) {
    throw new VaultCredentialError(`Invalid issuer: ${payload.iss}`)
  }
  if (payload.aud !== options.audience) {
    throw new VaultCredentialError(`Credential not scoped to this vault (aud: ${payload.aud}, expected: ${options.audience})`)
  }
  if (!payload.exp || payload.exp < now) {
    throw new VaultCredentialError('Credential has expired')
  }
  if (!payload.sub || !payload.scope || !payload.grant_id) {
    throw new VaultCredentialError('Missing required credential claims')
  }

  // Verify signature
  const publicKey = await subtle.importKey(
    'jwk', VAULT_PUBLIC_JWK,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['verify']
  )

  const sigBytes = base64urlDecode(sigB64).buffer as ArrayBuffer
  const signingBytes = new TextEncoder().encode(signingInput).buffer as ArrayBuffer

  const valid = await subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    sigBytes,
    signingBytes
  )

  if (!valid) {
    throw new VaultCredentialError('Invalid credential signature')
  }

  return {
    grantee: payload.sub,
    audience: payload.aud,
    scope: payload.scope,
    grantId: payload.grant_id,
    expiresAt: new Date(payload.exp * 1000),
  }
}

// ── Data Credential Verification (Pattern 6b — #53) ─────────────────────────

export interface DataCredentialPayload {
  /** Who is requesting the data (e.g. "app:uuid" or "user:uuid") */
  grantee: string
  /** Capability slug this credential is scoped to */
  audience: string
  /** Trust level — determines what data the capability should return */
  trustLevel: string
  /** The grant or composition that authorized this credential */
  grantId: string
  /** The capability owner's user ID — whose data is being accessed */
  ownerId: string
  /** When this credential expires */
  expiresAt: Date
}

/**
 * Verify a Threshold-issued data access credential (Pattern 6b).
 *
 * Capabilities use this to verify credentials issued by POST /api/capabilities/:id/data.
 * Same signing infrastructure as vault credentials, but with trust_level and owner_id claims.
 *
 * The trust_level tells the capability how to filter its response:
 * - 'metadata-only': entity counts, tag lists, connection counts
 * - 'redacted': anonymized entity IDs, connection structure intact
 * - 'partial': full structure, quantized weights
 * - 'full': complete dataset
 * - 'subgraph': caller-specified filter (interpret from request params)
 *
 * @param token - The full Bearer token value (with or without 'Bearer ' prefix)
 * @param options.audience - Your capability slug. Credential must be scoped to this.
 * @param options.crypto - Optional crypto implementation (defaults to globalThis.crypto)
 */
export async function verifyDataCredential(
  token: string,
  options: { audience: string; crypto?: Crypto }
): Promise<DataCredentialPayload> {
  const subtle = (options.crypto ?? globalThis.crypto).subtle

  // Strip prefix
  const raw = token.replace(/^Bearer\s+/i, '').replace(VAULT_TOKEN_PREFIX, '')
  const parts = raw.split('.')
  if (parts.length !== 3) {
    throw new VaultCredentialError('Invalid credential format')
  }

  const [headerB64, payloadB64, sigB64] = parts
  const signingInput = `${headerB64}.${payloadB64}`

  // Decode payload
  let payload: {
    iss?: string; sub?: string; aud?: string; trust_level?: string;
    grant_id?: string; owner_id?: string; iat?: number; exp?: number
  }
  try {
    payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)))
  } catch {
    throw new VaultCredentialError('Invalid credential payload')
  }

  // Validate claims
  const now = Math.floor(Date.now() / 1000)
  if (payload.iss !== VAULT_ISSUER) {
    throw new VaultCredentialError(`Invalid issuer: ${payload.iss}`)
  }
  if (payload.aud !== options.audience) {
    throw new VaultCredentialError(`Credential not scoped to this capability (aud: ${payload.aud}, expected: ${options.audience})`)
  }
  if (!payload.exp || payload.exp < now) {
    throw new VaultCredentialError('Credential has expired')
  }
  if (!payload.sub || !payload.trust_level || !payload.grant_id || !payload.owner_id) {
    throw new VaultCredentialError('Missing required credential claims')
  }

  // Verify signature
  const publicKey = await subtle.importKey(
    'jwk', VAULT_PUBLIC_JWK,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['verify']
  )

  const sigBytes = base64urlDecode(sigB64).buffer as ArrayBuffer
  const signingBytes = new TextEncoder().encode(signingInput).buffer as ArrayBuffer

  const valid = await subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    sigBytes,
    signingBytes
  )

  if (!valid) {
    throw new VaultCredentialError('Invalid credential signature')
  }

  return {
    grantee: payload.sub,
    audience: payload.aud,
    trustLevel: payload.trust_level,
    grantId: payload.grant_id,
    ownerId: payload.owner_id,
    expiresAt: new Date(payload.exp * 1000),
  }
}
