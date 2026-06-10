/**
 * ThresholdClient tests — mocked fetchFn, no network.
 * Run: npm test (node --test over dist/__tests__).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ThresholdClient, type ThresholdClientErrorContext } from '../client.js'

interface RecordedCall {
  url: string
  method: string
  headers: Record<string, string>
  body: string | undefined
}

/** Build a mock fetch that records calls and replays canned responses. */
function mockFetch(responder: (call: RecordedCall) => Response | Error) {
  const calls: RecordedCall[] = []
  const fetchFn = (async (input: unknown, init?: RequestInit) => {
    const call: RecordedCall = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body as string | undefined,
    }
    calls.push(call)
    const result = responder(call)
    if (result instanceof Error) throw result
    return result
  }) as typeof fetch
  return { calls, fetchFn }
}

const okJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const SIGNAL = { source: 'ai-dj', signal: { flowScore: 80 }, pushedAt: '2026-06-10T00:00:00Z' }

test('injects Authorization header from constructor token', async () => {
  const { calls, fetchFn } = mockFetch(() => okJson(SIGNAL))
  const client = new ThresholdClient({ token: 'thld_abc', fetchFn })

  const signal = await client.readSignal('ai-dj')

  assert.equal(calls[0].headers['Authorization'], 'Bearer thld_abc')
  assert.equal(calls[0].url, 'https://thresholdlabs.io/api/signals/ai-dj')
  assert.deepEqual(signal, SIGNAL)
})

test('setToken replaces the auth header on subsequent requests', async () => {
  const { calls, fetchFn } = mockFetch(() => okJson(SIGNAL))
  const client = new ThresholdClient({ token: 'thld_old', fetchFn })

  await client.readSignal('ai-dj')
  client.setToken('thld_ut_new')
  await client.readSignal('ai-dj')

  assert.equal(calls[0].headers['Authorization'], 'Bearer thld_old')
  assert.equal(calls[1].headers['Authorization'], 'Bearer thld_ut_new')
})

test('no Authorization header when no token is set', async () => {
  const { calls, fetchFn } = mockFetch(() => okJson(SIGNAL))
  const client = new ThresholdClient({ fetchFn })

  await client.readSignal('ai-dj')

  assert.equal(calls[0].headers['Authorization'], undefined)
})

test('scope option becomes a query param on read and push', async () => {
  const { calls, fetchFn } = mockFetch((call) =>
    call.method === 'GET' ? okJson(SIGNAL) : okJson({ ok: true })
  )
  const client = new ThresholdClient({ token: 'thld_abc', fetchFn })

  await client.readSignal('grocery', { scope: 'household:abc123' })
  const pushed = await client.pushSignal('grocery', { list: ['milk'] }, { scope: 'household:abc123' })

  assert.equal(calls[0].url, 'https://thresholdlabs.io/api/signals/grocery?scope=household%3Aabc123')
  assert.equal(calls[1].url, 'https://thresholdlabs.io/api/signals/grocery?scope=household%3Aabc123')
  assert.equal(calls[1].method, 'POST')
  assert.equal(pushed, true)
})

test('no query string when scope is omitted', async () => {
  const { calls, fetchFn } = mockFetch(() => okJson(SIGNAL))
  const client = new ThresholdClient({ token: 'thld_abc', fetchFn })

  await client.readSignal('ai-dj')

  assert.equal(calls[0].url.includes('?'), false)
})

test('returns null on 404 without firing onError (absence, not failure)', async () => {
  const errors: ThresholdClientErrorContext[] = []
  const { fetchFn } = mockFetch(() => okJson({ error: 'No signal found' }, 404))
  const client = new ThresholdClient({ token: 'thld_abc', fetchFn, onError: (ctx) => errors.push(ctx) })

  const signal = await client.readSignal('never-pushed')
  const cap = await client.resolveCapability('missing-cap')

  assert.equal(signal, null)
  assert.equal(cap, null)
  assert.equal(errors.length, 0)
})

test('returns null on network error and fires onError', async () => {
  const errors: ThresholdClientErrorContext[] = []
  const { fetchFn } = mockFetch(() => new Error('offline'))
  const client = new ThresholdClient({ token: 'thld_abc', fetchFn, onError: (ctx) => errors.push(ctx) })

  const signal = await client.readSignal('ai-dj')

  assert.equal(signal, null)
  assert.equal(errors.length, 1)
  assert.equal(errors[0].path, '/api/signals/ai-dj')
  assert.equal(errors[0].status, undefined)
  assert.equal((errors[0].error as Error).message, 'offline')
})

test('pushSignal returns false on network error — never throws', async () => {
  const { fetchFn } = mockFetch(() => new Error('offline'))
  const client = new ThresholdClient({ token: 'thld_abc', fetchFn })

  assert.equal(await client.pushSignal('ai-dj', { flowScore: 50 }), false)
})

test('fires onError with status and error body on non-ok response', async () => {
  const errors: ThresholdClientErrorContext[] = []
  const { fetchFn } = mockFetch(() => okJson({ error: 'Unauthorized' }, 401))
  const client = new ThresholdClient({ token: 'thld_bad', fetchFn, onError: (ctx) => errors.push(ctx) })

  const pushed = await client.pushSignal('ai-dj', { flowScore: 50 })

  assert.equal(pushed, false)
  assert.equal(errors.length, 1)
  assert.equal(errors[0].status, 401)
  assert.equal(errors[0].path, '/api/signals/ai-dj')
  assert.deepEqual(errors[0].error, { error: 'Unauthorized' })
})

test('resolveCapability hits the resolve route and returns the parsed body', async () => {
  const resolved = {
    endpoint: 'http://localhost:9111/vault',
    trustLevel: 'partial',
    status: 'active',
    reliability: 'healthy',
    availability: 'live',
    lastSeen: '2026-06-10T00:00:00Z',
    declaration: null,
  }
  const { calls, fetchFn } = mockFetch(() => okJson(resolved))
  const client = new ThresholdClient({ token: 'thld_cg_grant', fetchFn })

  const cap = await client.resolveCapability('cap-123')

  assert.equal(calls[0].url, 'https://thresholdlabs.io/api/capabilities/cap-123/resolve')
  assert.equal(calls[0].method, 'GET')
  assert.deepEqual(cap, resolved)
})

test('requestDataAccess POSTs to the data route', async () => {
  const access = {
    endpoint: 'http://localhost:9111/vault/graph/edges',
    credential: 'thld_va_jwt',
    trustLevel: 'partial',
    capabilityId: 'cap-123',
    expiresAt: '2026-06-10T00:15:00Z',
  }
  const { calls, fetchFn } = mockFetch(() => okJson(access))
  const client = new ThresholdClient({ token: 'thld_cg_grant', fetchFn })

  const result = await client.requestDataAccess('cap-123')

  assert.equal(calls[0].url, 'https://thresholdlabs.io/api/capabilities/cap-123/data')
  assert.equal(calls[0].method, 'POST')
  assert.deepEqual(result, access)
})

test('pushSignature wraps the signature with a viewName (default "main")', async () => {
  const { calls, fetchFn } = mockFetch(() => okJson({ ok: true }))
  const client = new ThresholdClient({ token: 'thld_abc', fetchFn })

  const ok = await client.pushSignature('ai-dj', { nodes: 5 })
  await client.pushSignature('ai-dj', { nodes: 5 }, { viewName: 'target' })

  assert.equal(ok, true)
  assert.equal(calls[0].url, 'https://thresholdlabs.io/api/apps/ai-dj/signature')
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(calls[0].body!), { viewName: 'main', signature: { nodes: 5 } })
  assert.deepEqual(JSON.parse(calls[1].body!), { viewName: 'target', signature: { nodes: 5 } })
})

test('custom baseUrl is honored and trailing slash trimmed', async () => {
  const { calls, fetchFn } = mockFetch(() => okJson(SIGNAL))
  const client = new ThresholdClient({ baseUrl: 'http://localhost:8787/', token: 'thld_abc', fetchFn })

  await client.readSignal('ai-dj')

  assert.equal(calls[0].url, 'http://localhost:8787/api/signals/ai-dj')
})

test('returns null and fires onError on malformed JSON body', async () => {
  const errors: ThresholdClientErrorContext[] = []
  const { fetchFn } = mockFetch(() => new Response('not-json', { status: 200 }))
  const client = new ThresholdClient({ token: 'thld_abc', fetchFn, onError: (ctx) => errors.push(ctx) })

  const signal = await client.readSignal('ai-dj')

  assert.equal(signal, null)
  assert.equal(errors.length, 1)
  assert.equal(errors[0].status, 200)
})
