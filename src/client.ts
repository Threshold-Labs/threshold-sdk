/**
 * ThresholdClient — isomorphic typed HTTP client for the Threshold platform API.
 *
 * Works identically in React Native, browsers, and Cloudflare Workers:
 * - Global `fetch` only (injectable via `fetchFn` for tests / custom transports)
 * - No Node-only dependencies, no URL/Buffer polyfills, no crypto requirement
 *
 * Error model is tolerant by design — mobile apps must not crash offline.
 * Network failures and non-ok responses resolve to `null` (reads) or `false`
 * (writes). Wire `onError` for observability instead of try/catch at call sites.
 *
 * Usage:
 *   import { ThresholdClient } from '@threshold-labs/integration/client'
 *
 *   const client = new ThresholdClient({ token: appToken })
 *   const signal = await client.readSignal('project-control')
 *   if (signal) console.log(signal.signal, signal.pushedAt)
 */

import { CAPABILITY_CONTRACT } from './contract.js'
import type { ResolvedCapability, DataAccessResult } from './contract.js'
import type { SignalResponse } from './signals.js'

export type { ResolvedCapability, DataAccessResult, SignalResponse }

/** Context passed to the onError observability callback. */
export interface ThresholdClientErrorContext {
  /** The request path (without baseUrl), e.g. '/api/signals/ai-dj' */
  path: string
  /** HTTP status code, if a response was received */
  status?: number
  /** The thrown error (network failure, JSON parse failure) or response error body */
  error?: unknown
}

export interface ThresholdClientOptions {
  /** Platform base URL (default: https://thresholdlabs.io) */
  baseUrl?: string
  /** thld_ app token, thld_ut_ user token, or thld_cg_ grant token */
  token?: string
  /** Injectable fetch — defaults to the global. Useful for tests and custom transports. */
  fetchFn?: typeof fetch
  /**
   * Observability callback — fired on network errors and non-ok responses.
   * 404 is treated as absence (a normal miss, e.g. "no signal pushed yet")
   * and does NOT fire this callback.
   */
  onError?: (ctx: ThresholdClientErrorContext) => void
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, string | undefined>
}

export class ThresholdClient {
  private baseUrl: string
  private token: string | undefined
  private fetchFn: typeof fetch | undefined
  private onError: ((ctx: ThresholdClientErrorContext) => void) | undefined

  constructor(options: ThresholdClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? CAPABILITY_CONTRACT.baseUrl).replace(/\/+$/, '')
    this.token = options.token
    this.fetchFn = options.fetchFn
    this.onError = options.onError
  }

  /** Set or replace the auth token (e.g. after Login with Threshold completes). */
  setToken(token: string): void {
    this.token = token
  }

  // ── Signals (Patterns 1–2) ────────────────────────────────────────────────

  /**
   * Read the latest signal for the authenticated user (Pattern 2).
   * Pass `opts.scope` for scope-scoped signals (Pattern 5).
   * Returns null if no signal exists yet, the request fails, or you're offline.
   */
  async readSignal(source: string, opts?: { scope?: string }): Promise<SignalResponse | null> {
    return this.request<SignalResponse>(`/api/signals/${encodeURIComponent(source)}`, {
      query: { scope: opts?.scope },
    })
  }

  /**
   * Push a derived signal to Threshold (Pattern 1).
   * Pass `opts.scope` for scope-scoped signals (Pattern 5).
   * Returns true on success; false on any failure (never throws).
   */
  async pushSignal(
    source: string,
    signal: Record<string, unknown>,
    opts?: { scope?: string }
  ): Promise<boolean> {
    const result = await this.request<{ ok: boolean }>(
      `/api/signals/${encodeURIComponent(source)}`,
      { method: 'POST', body: signal, query: { scope: opts?.scope } }
    )
    return result !== null
  }

  // ── Capabilities (Patterns 6a/6b) ─────────────────────────────────────────

  /**
   * Resolve a capability at runtime (Pattern 6a) — endpoint, trust level,
   * status, availability. Returns null if not found or unreachable.
   */
  async resolveCapability(capabilityId: string): Promise<ResolvedCapability | null> {
    return this.request<ResolvedCapability>(
      `/api/capabilities/${encodeURIComponent(capabilityId)}/resolve`
    )
  }

  /**
   * Request a trust-scoped data access credential (Pattern 6b).
   * Present `result.credential` as a Bearer token directly to `result.endpoint` —
   * Threshold stays out of the data path. Returns null on any failure.
   */
  async requestDataAccess(capabilityId: string): Promise<DataAccessResult | null> {
    return this.request<DataAccessResult>(
      `/api/capabilities/${encodeURIComponent(capabilityId)}/data`,
      { method: 'POST' }
    )
  }

  // ── Structural signature (Pattern 3) ──────────────────────────────────────

  /**
   * Push a structural signature computed by @threshold-labs/core (Pattern 3).
   * `opts.viewName` defaults to 'main'. Returns true on success.
   */
  async pushSignature(
    appSlug: string,
    signature: unknown,
    opts?: { viewName?: string }
  ): Promise<boolean> {
    const result = await this.request<{ ok: boolean }>(
      `/api/apps/${encodeURIComponent(appSlug)}/signature`,
      { method: 'POST', body: { viewName: opts?.viewName ?? 'main', signature } }
    )
    return result !== null
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  /**
   * Single request path — auth header injection, query building, and the
   * tolerant error model all live here. Never throws.
   */
  private async request<T>(path: string, options: RequestOptions = {}): Promise<T | null> {
    // Build the URL without `new URL` — React Native's URL support is partial.
    let qs = ''
    if (options.query) {
      const pairs = Object.entries(options.query)
        .filter((entry): entry is [string, string] => entry[1] !== undefined)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      if (pairs.length > 0) qs = `?${pairs.join('&')}`
    }
    const url = `${this.baseUrl}${path}${qs}`

    const headers: Record<string, string> = {}
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'

    const doFetch = this.fetchFn ?? fetch

    let res: Response
    try {
      res = await doFetch(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      })
    } catch (error) {
      this.onError?.({ path, error })
      return null
    }

    if (res.status === 404) return null // absence, not an error

    if (!res.ok) {
      const errorBody: unknown = await res.json().catch(() => undefined)
      this.onError?.({ path, status: res.status, error: errorBody })
      return null
    }

    try {
      return (await res.json()) as T
    } catch (error) {
      this.onError?.({ path, status: res.status, error })
      return null
    }
  }
}
