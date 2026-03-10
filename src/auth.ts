/**
 * ThresholdAuth — client-side SDK for Login with Threshold.
 *
 * Handles the three auth tiers (ephemeral → device → authenticated)
 * and the OAuth flow for exchanging authorization codes for user tokens.
 *
 * Usage:
 *   import { ThresholdAuth } from '@threshold-labs/integration/auth'
 *
 *   const auth = new ThresholdAuth({ appId: 'my-app', appToken: 'thld_...' })
 *   auth.startLogin({ redirectUri: 'https://myapp.com/callback' })
 *   // ...after redirect...
 *   const session = await auth.handleCallback(code)
 */

import type { AuthTier } from './contract.js'
import { CAPABILITY_CONTRACT } from './contract.js'

export type { AuthTier }

// ── Types ────────────────────────────────────────────────────────────────────

export interface ThresholdAuthConfig {
  /** Registered app ID (from Ecosystem dashboard) */
  appId: string
  /** App token (thld_ prefixed) — needed for code exchange */
  appToken: string
  /** Override base URL (default: https://thresholdlabs.io) */
  baseUrl?: string
  /** Storage backend (default: localStorage if available) */
  storage?: ThresholdStorage
}

export interface ThresholdStorage {
  getItem(key: string): string | null | Promise<string | null>
  setItem(key: string, value: string): void | Promise<void>
  removeItem(key: string): void | Promise<void>
}

export interface ThresholdSession {
  token: string
  userId: string
  scopes: string[]
  tier: 'authenticated'
}

export interface ThresholdUserinfo {
  userId: string
  displayName: string | null
  imageUrl: string | null
  tier: AuthTier
}

export interface StartLoginOptions {
  /** Where Threshold redirects after auth (must match registered redirect URIs) */
  redirectUri: string
  /** Space-separated scopes (default: "profile signals") */
  scope?: string
  /** Opaque state for CSRF protection — returned in the callback */
  state?: string
}

// ── Storage keys ─────────────────────────────────────────────────────────────

const STORAGE_PREFIX = 'threshold_auth_'
const KEY_TOKEN = `${STORAGE_PREFIX}token`
const KEY_USER_ID = `${STORAGE_PREFIX}user_id`
const KEY_SCOPES = `${STORAGE_PREFIX}scopes`
const KEY_DEVICE_ID = `${STORAGE_PREFIX}device_id`

// ── Class ────────────────────────────────────────────────────────────────────

export class ThresholdAuth {
  private appId: string
  private appToken: string
  private baseUrl: string
  private storage: ThresholdStorage | null

  constructor(config: ThresholdAuthConfig) {
    this.appId = config.appId
    this.appToken = config.appToken
    this.baseUrl = config.baseUrl || CAPABILITY_CONTRACT.baseUrl
    this.storage = config.storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  }

  // ── Tier detection ───────────────────────────────────────────────────────

  /** Get the current auth tier based on stored credentials */
  async getTier(): Promise<AuthTier> {
    if (!this.storage) return 'ephemeral'
    const token = await this.storage.getItem(KEY_TOKEN)
    if (token) return 'authenticated'
    const deviceId = await this.storage.getItem(KEY_DEVICE_ID)
    if (deviceId) return 'device'
    return 'ephemeral'
  }

  /** Get the current session, or null if not authenticated */
  async getSession(): Promise<ThresholdSession | null> {
    if (!this.storage) return null
    const token = await this.storage.getItem(KEY_TOKEN)
    const userId = await this.storage.getItem(KEY_USER_ID)
    const scopesRaw = await this.storage.getItem(KEY_SCOPES)
    if (!token || !userId) return null
    return {
      token,
      userId,
      scopes: scopesRaw ? JSON.parse(scopesRaw) : ['profile', 'signals'],
      tier: 'authenticated',
    }
  }

  // ── Device tier ──────────────────────────────────────────────────────────

  /** Get or create a device ID for the device tier */
  async getDeviceId(): Promise<string | null> {
    if (!this.storage) return null
    let deviceId = await this.storage.getItem(KEY_DEVICE_ID)
    if (!deviceId) {
      deviceId = crypto.randomUUID()
      await this.storage.setItem(KEY_DEVICE_ID, deviceId)
    }
    return deviceId
  }

  // ── OAuth flow ───────────────────────────────────────────────────────────

  /**
   * Start the Login with Threshold flow.
   * Redirects the browser to the Threshold authorization page.
   */
  startLogin(options: StartLoginOptions): void {
    const url = new URL('/auth/authorize', this.baseUrl)
    url.searchParams.set('app_id', this.appId)
    url.searchParams.set('redirect_uri', options.redirectUri)
    if (options.scope) url.searchParams.set('scope', options.scope)
    if (options.state) url.searchParams.set('state', options.state)
    window.location.href = url.toString()
  }

  /**
   * Build the authorization URL without redirecting.
   * Useful for <a href> links or custom redirect logic.
   */
  getLoginUrl(options: StartLoginOptions): string {
    const url = new URL('/auth/authorize', this.baseUrl)
    url.searchParams.set('app_id', this.appId)
    url.searchParams.set('redirect_uri', options.redirectUri)
    if (options.scope) url.searchParams.set('scope', options.scope)
    if (options.state) url.searchParams.set('state', options.state)
    return url.toString()
  }

  /**
   * Handle the OAuth callback — exchange authorization code for user token.
   * Call this after the redirect back to your app with ?code=...
   *
   * @returns The session, or throws on failure
   */
  async handleCallback(code: string, redirectUri: string): Promise<ThresholdSession> {
    const res = await fetch(`${this.baseUrl}/auth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.appToken}`,
      },
      body: JSON.stringify({ code, redirect_uri: redirectUri }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string }
      throw new Error(`Token exchange failed: ${err.error}`)
    }

    const data = await res.json() as {
      token: string
      userId: string
      expiresAt: string | null
      scopes: string[]
    }

    // Persist session
    if (this.storage) {
      await this.storage.setItem(KEY_TOKEN, data.token)
      await this.storage.setItem(KEY_USER_ID, data.userId)
      await this.storage.setItem(KEY_SCOPES, JSON.stringify(data.scopes))
    }

    return {
      token: data.token,
      userId: data.userId,
      scopes: data.scopes,
      tier: 'authenticated',
    }
  }

  // ── Authenticated API calls ──────────────────────────────────────────────

  /** Get user info for the current session */
  async getUserinfo(): Promise<ThresholdUserinfo> {
    const session = await this.getSession()
    if (!session) throw new Error('Not authenticated — call handleCallback first')

    const res = await fetch(`${this.baseUrl}/auth/userinfo`, {
      headers: { Authorization: `Bearer ${session.token}` },
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string }
      throw new Error(`getUserinfo failed: ${err.error}`)
    }

    return res.json() as Promise<ThresholdUserinfo>
  }

  /**
   * Logout — revoke the user token server-side and clear local storage.
   * After logout, the auth tier drops to device (if device ID exists) or ephemeral.
   */
  async logout(): Promise<void> {
    const session = await this.getSession()
    if (session) {
      // Best-effort server revocation
      await fetch(`${this.baseUrl}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
      }).catch(() => {})
    }

    // Clear local session regardless
    if (this.storage) {
      await this.storage.removeItem(KEY_TOKEN)
      await this.storage.removeItem(KEY_USER_ID)
      await this.storage.removeItem(KEY_SCOPES)
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Make an authenticated fetch call using the stored user token.
   * Convenience wrapper around fetch that adds the Authorization header.
   */
  async fetch(path: string, init?: RequestInit): Promise<Response> {
    const session = await this.getSession()
    const headers = new Headers(init?.headers)
    if (session) {
      headers.set('Authorization', `Bearer ${session.token}`)
    }
    return fetch(`${this.baseUrl}${path}`, { ...init, headers })
  }
}
