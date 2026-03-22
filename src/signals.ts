/**
 * Signal helpers — Pattern 1 (Signal Push) and Pattern 2 (Signal Read).
 *
 * These are the most commonly used Threshold patterns. External apps compute
 * derived heuristics locally and push them to Threshold; raw data stays on
 * the app — only the signal is transmitted.
 *
 * Usage:
 *   import { pushSignal, readSignal } from '@threshold-labs/integration'
 */

import { CAPABILITY_CONTRACT } from './contract.js'

// ── Pattern 1: Signal Push ────────────────────────────────────────────────────

export interface PushSignalOptions {
  /** App token (thld_ prefix) */
  token: string
  /** Override base URL (default: https://thresholdlabs.io) */
  baseUrl?: string
  /** Scope ID for scope-scoped signals (Pattern 5) — e.g. "household:abc123" */
  scope?: string
}

export interface PushSignalResult {
  ok: boolean
  pushedAt: string
}

/**
 * Push a derived heuristic signal to Threshold (Pattern 1).
 *
 * Raw data stays on your app — only the computed signal is transmitted.
 * One row per user per source; each push overwrites the previous value.
 * Batch all heuristics for a cycle into a single call via the signal object.
 *
 * @param source - Your app slug (e.g. "project-control", "ai-dj")
 * @param signal - Free-form JSON object — all heuristics for this cycle
 * @param options - Auth token, optional baseUrl override, optional scope
 *
 * @example
 * ```ts
 * await pushSignal('project-control', {
 *   activeProject: 'sideslip',
 *   focusScore: 82,
 *   driftDetected: false,
 *   label: 'Deep work — threshold-sdk',
 *   pushedAt: new Date().toISOString(),
 * }, { token: appToken })
 * ```
 */
export async function pushSignal(
  source: string,
  signal: Record<string, unknown>,
  options: PushSignalOptions
): Promise<PushSignalResult> {
  const baseUrl = options.baseUrl || CAPABILITY_CONTRACT.baseUrl
  const url = new URL(`${baseUrl}/api/signals/${source}`)
  if (options.scope) {
    url.searchParams.set('scope', options.scope)
  }

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.token}`,
    },
    body: JSON.stringify(signal),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string }
    throw new Error(`pushSignal failed: ${err.error}`)
  }

  return res.json() as Promise<PushSignalResult>
}

// ── Pattern 2: Signal Read ────────────────────────────────────────────────────

export interface ReadSignalOptions {
  /** App token (thld_) or Clerk JWT */
  token: string
  /** Override base URL (default: https://thresholdlabs.io) */
  baseUrl?: string
  /** Scope ID for scope-scoped signals (Pattern 5) — e.g. "household:abc123" */
  scope?: string
}

export interface SignalResponse {
  source: string
  signal: Record<string, unknown>
  pushedAt: string
}

/**
 * Read the latest signal for the authenticated user (Pattern 2).
 *
 * App token returns the signal for the token owner.
 * Clerk JWT returns the signal for the logged-in user.
 * Returns null if no signal has been pushed yet for this source.
 *
 * Cross-user reads (user A reading user B's signals) require explicit grants
 * and are not yet implemented — file issues at the threshold-sdk repo to shape this.
 *
 * @param source - The source slug to read from (e.g. "project-control", "spotify-taste")
 * @param options - Auth token, optional baseUrl override, optional scope
 *
 * @example
 * ```ts
 * const signal = await readSignal('project-control', { token: appToken })
 * if (!signal) return // no signal pushed yet
 * const ageMs = Date.now() - new Date(signal.pushedAt).getTime()
 * if (ageMs > 5 * 60 * 1000) return // stale — skip cross-app mapping
 * ```
 */
export async function readSignal(
  source: string,
  options: ReadSignalOptions
): Promise<SignalResponse | null> {
  const baseUrl = options.baseUrl || CAPABILITY_CONTRACT.baseUrl
  const url = new URL(`${baseUrl}/api/signals/${source}`)
  if (options.scope) {
    url.searchParams.set('scope', options.scope)
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${options.token}`,
    },
  })

  if (res.status === 404) return null
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string }
    throw new Error(`readSignal failed: ${err.error}`)
  }

  return res.json() as Promise<SignalResponse>
}
