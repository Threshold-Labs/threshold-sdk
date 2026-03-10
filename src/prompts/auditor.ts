/**
 * Threshold Capability Auditor — Prompt
 *
 * A prompt you can always point Claude at to audit a codebase for Threshold
 * capability opportunities. Served at:
 *   https://thresholdlabs.io/api/prompts/audit
 *
 * Usage:
 *   claude --prompt https://thresholdlabs.io/api/prompts/audit
 *   claude --prompt https://thresholdlabs.io/api/prompts/audit --create
 *
 * Over time this prompt evolves from "find capability candidates" toward
 * "generate the capability" (--create mode). Each version is pinned via
 * the ?v= query param on the public endpoint.
 *
 * Version history:
 *   0.1.0 — initial audit-only mode, --create stubs signal provider
 *   0.4.0 — all 4 patterns live; Pattern 2 documented; vault/capabilities section added
 *   0.7.0 — capability-first rewrite; capability decomposition, composability
 *           analysis, --create scaffolds capability.json
 */

export const AUDITOR_VERSION = '0.8.0'

export const THRESHOLD_AUDITOR_PROMPT = `# Threshold Capability Auditor v${AUDITOR_VERSION}
> https://thresholdlabs.io/api/prompts/audit
>
> Audit a codebase for Threshold capability opportunities.
> Run with --create to generate capability scaffolding after the audit.

---

## What Threshold Is

Threshold is a trust graph for user-owned capabilities. Users own their data
capabilities (connectors, signals, vaults). Apps compose those capabilities
to build features. The trust graph governs what flows between users and apps.

Everything is a capability — a portable, user-owned unit of compute or data
access that any app can compose with user permission.

### Capability Types

| Type | What it is | Example |
|------|-----------|---------|
| \`signal\` | Derived heuristic pushed periodically | focus-score, mood-state |
| \`connector\` | OAuth/API bridge to an external service | spotify-connector, gmail-connector |
| \`graph\` | Entity-relationship structure | interest-graph, social-graph |
| \`embedding\` | Vector representation | taste-embedding, topic-embedding |
| \`vault\` | Raw data behind access control | listening-history, email-archive |
| \`derivation\` | Computed from other capabilities | spotify-taste (from spotify-connector) |
| \`presentation\` | UI/display capability | visualization, card-renderer |

### Trust Levels

\`metadata-only\` → \`redacted\` → \`partial\` → \`full\` → \`subgraph\`

Each capability declares what trust level it operates at and the minimum trust
required to access it.

### Auth Model

| Token | Prefix | Purpose |
|-------|--------|---------|
| App token | \`thld_\` | Identifies the app and its owner |
| Capability grant | \`thld_cg_\` | Scoped per-capability grant |
| User token | \`thld_ut_\` | Issued after Login with Threshold |
| Vault credential | \`thld_va_\` | Short-lived JWT for vault access |

### Key Endpoints

\`\`\`
POST /api/capabilities              — declare a capability (Clerk JWT)
GET  /api/capabilities              — list user's capabilities
POST /api/capabilities/:id/grants   — grant access to a capability
POST /api/apps/:slug/capabilities   — compose capabilities into an app

POST /api/signals/:source           — push a derived signal (app token)
GET  /api/signals/:source           — read a signal (app token or JWT)
POST /api/apps/:slug/signature      — sync graph signature
POST /api/apps/:slug/vault/credential — get vault credential (app token)

POST /api/claims                    — attribution claim (provenance)
POST /api/corrections               — correct a prior signal/claim
\`\`\`

---

## Audit Protocol

Walk the codebase systematically. Identify capabilities across five areas:

### 1. Capability Decomposition

This is the primary audit objective. For every meaningful compute or data unit,
apply the **portability litmus test**:

> Could a stranger clone this module, deploy it on their own machine, register
> it with Threshold, and have it work for any app that needs it?

If yes → it's a capability. If no → it's app-specific logic.

For each candidate, determine:
- **Capability name**: slug (e.g. \`interest-graph\`, \`comms-parser\`)
- **Type**: signal | connector | graph | embedding | vault | derivation | presentation
- **Owner type**: \`user\` (user provisions it) or \`app\` (app provides it)
- **Trust level**: how much data flows through it
- **Minimum trust**: who should be able to access it
- **File + function**: where the core logic lives
- **Cadence**: \`{ expected: "PT1H" }\` (ISO 8601), \`"on-demand"\`, or \`"continuous"\`
- **Composition**: what other capabilities it depends on (\`requiredCapabilities\`)
  or is built from (\`composedOf\`)

### 2. Signal Candidates (existing pattern — now typed as \`type: 'signal'\`)

Look for any place where the app:
- Computes a score, metric, or summary (focus score, risk score, match score)
- Tracks a meaningful state that changes over time (active project, session type,
  mood, mode, priority)
- Derives an insight from raw data (recommendation, anomaly flag, attention signal)
- Has an existing analytics, telemetry, or metrics hook
- Runs on a loop or schedule (cron, polling, event loop, worker)

For each candidate capture:
- **Signal name**: what you'd call this heuristic
- **File + function**: where it's computed
- **Shape**: the JSON object that would be pushed (abbreviated, with types)
- **Trigger**: when it fires (user action / schedule / event)
- **Raw inputs**: what underlying data it derives from (stays local, never pushed)
- **Governance**: any PII or client-confidential data that needs sanitization

### 3. Graph / Network Structures (\`type: 'graph'\`)

Look for any data expressible as nodes + edges:
- Explicit graph data (nodes[], edges[], adjacency lists, relationship tables)
- Entity relationships (people ↔ projects, concepts ↔ sources, skills ↔ roles)
- Hierarchies, trees, dependency graphs, co-occurrence matrices
- Any "X is connected to Y" pattern, even if not yet visualized

For each candidate capture:
- **Graph name**: what this network represents
- **Node types**: the entity categories (e.g. person, concept, project)
- **Edge semantics**: what the connections mean (works_with, cites, depends_on)
- **Scale**: approximate node count range
- **Update frequency**: real-time / on-save / nightly batch
- **File**: where the graph data lives or is computed

### 4. Auth & Trust Surface

Look for:
- How the app identifies users (Clerk, Auth0, session, API key)
- Multi-user or multi-tenant patterns where data flows between users
- Anywhere a trust or permission decision is made (who can see what)
- Places where Login with Threshold could replace or augment existing auth

### 5. Raw Data Worth Vaulting (\`type: 'vault'\`)

Look for any data the app holds that other apps might legitimately want:
- Integration tokens (Spotify, GitHub, calendar) — vault them, derive signals from them
- Raw user data that would be valuable in aggregate but shouldn't be pushed directly
- API results, databases, or file stores with access control needs
- Any place where you'd say "I wish app X could read this, with the user's permission"

For each candidate capture:
- **Capability name**: what you'd call this access scope (e.g. \`edges:read:current\`)
- **Data type**: connector | vault | graph
- **Trust level**: metadata-only | redacted | partial | full | subgraph
- **Minimum trust**: acquaintance | colleague | client | friend | close | partner
- **File**: where the raw data lives or is served

---

## Output Format

Produce a structured audit report in this format:

\`\`\`markdown
## Threshold Capability Audit — [App Name]

### Capability Candidates
| Capability | Type | Trust Level | Owner | Cadence | Composes | File |
|-----------|------|-------------|-------|---------|----------|------|
| [name] | signal/connector/graph/... | partial | user | PT1H | — | [file] |

### Composition Graph

Show how capabilities relate to each other:

[top-level-capability] (type, trust, owner)
  └── [child-capability] (type, trust, owner)
        ├── [grandchild-a] (type, trust, owner)
        └── [grandchild-b] (type, trust, owner)

[standalone-capability] ← consumed by [other-cap], [other-cap-2]

### Dependency Table
| Capability | Requires | Composes Into |
|-----------|----------|---------------|
| [name] | [deps] | [parents] |

### Signal Candidates
| Signal | File:fn | Shape | Trigger | Governance |
|--------|---------|-------|---------|------------|
| [name] | [file]  | { k: type } | [when] | [notes] |

### Graph Candidates
| Graph | Node Types | Edge Types | Scale | Update Freq | File |
|-------|-----------|-----------|-------|-------------|------|

### Vault Candidates
| Capability | Type | Trust Level | Min Trust | File |
|-----------|------|-------------|-----------|------|

### Auth Surface
[1–3 sentences: current auth mechanism + where Login with Threshold fits]

### Priority Ranking
1. [Highest-value capability] — [one-sentence rationale]
2. [Second] — [rationale]
3. ...

### Effort Estimate
[Total: X hours to declare + compose top 2 capabilities, assuming app token already exists]
\`\`\`

---

## --create Mode

When this audit is run with the flag \`--create\` (append it to your prompt or
ask Claude to run in create mode), after the audit report, generate the
following for the **highest-confidence capability candidate**:

### 1. capability.json

A valid \`CapabilityDeclaration\` matching the SDK type:

\`\`\`json
{
  "id": "interest-graph",
  "name": "Interest Graph",
  "description": "Entity-relationship graph of user interests derived from communication patterns",
  "type": "graph",
  "ownerType": "user",
  "trustLevel": "partial",
  "minimumTrust": "friend",
  "composedOf": [],
  "requiredCapabilities": ["comms-parser"],
  "cadence": { "expected": "on-demand" }
}
\`\`\`

### 2. CAPABILITY.md

Human-readable documentation:
- What this capability does
- Who owns it (user or app)
- What it requires
- Trust implications
- How other apps can compose it

### 3. Registration command

\`\`\`bash
# Register the capability
curl -X POST https://thresholdlabs.io/api/capabilities \\
  -H "Authorization: Bearer <clerk-jwt>" \\
  -H "Content-Type: application/json" \\
  -d @capability.json

# Compose it into an app
curl -X POST https://thresholdlabs.io/api/apps/<app-slug>/capabilities \\
  -H "Authorization: Bearer <clerk-jwt>" \\
  -H "Content-Type: application/json" \\
  -d '{ "capabilityId": "interest-graph", "required": true, "role": "primary data source" }'
\`\`\`

### 4. threshold-provider.ts (for signal-type capabilities)

If the top candidate is a signal, also generate a self-contained push module:
- Loads config from env vars or a JSON config file
- Exports \`pushToThreshold(data)\` — derives the signal, calls the endpoint
- Never logs raw data; logs only "[threshold-provider] pushed: <signal-name>"
- Handles network errors gracefully (offline is expected)
- Exports \`getThresholdStatus()\` for a /health or /status endpoint

Match the target codebase's style (TypeScript vs JS, ESM vs CJS, fetch vs axios).

### 5. App registration snippet (if no app exists yet)

\`\`\`bash
curl -X POST https://thresholdlabs.io/api/apps \\
  -H "Authorization: Bearer <clerk-jwt>" \\
  -H "Content-Type: application/json" \\
  -d '{ "name": "[App Name]", "slug": "[app-slug]", "domain": "[domain]" }'
# → returns { app: {...}, token: "thld_..." }
\`\`\`

### 6. Environment variable additions

\`\`\`
# .env.example additions
THRESHOLD_APP_TOKEN=thld_...     # from app registration
THRESHOLD_ENABLED=true
THRESHOLD_ENDPOINT=https://thresholdlabs.io
\`\`\`

### 7. Wiring instructions

2–4 bullet points explaining exactly where to integrate in the existing
codebase — specific file and function names from the audit.

---

## Governance Rules (always apply)

- Never push raw user data, PII, or anything a user hasn't consented to share
- Client project identifiers must be sanitized: push "client work", never the
  actual client slug or name
- Signals are derived, not raw — if you're pushing a field that IS the raw data,
  that's a design error; compute a heuristic instead
- If in doubt about a field, omit it — Threshold prefers sparse signals over
  leaky ones
- Capabilities should be as atomic as possible — one concern per capability
- User-owned capabilities must be portable — no app-specific logic baked in

---

## Evolution Notes (for prompt maintainers)

This prompt is versioned at ${AUDITOR_VERSION}. When upgrading:
- Increment AUDITOR_VERSION in src/prompts/auditor.ts in threshold-sdk
- Add --register flag to automate app + capability registration via the API
- Add Threshold-side derivation candidates to the audit (Spotify taste, future derivations)
- Long-term goal: --one-shot generates a complete Threshold-integrated app
  from a codebase description, without requiring an existing codebase to audit
- File issues or PRs at https://github.com/Threshold-Labs/threshold-sdk
`
