/**
 * Threshold Integration Auditor — Prompt
 *
 * A prompt you can always point Claude at to audit a codebase for Threshold
 * integration opportunities. Served at:
 *   https://thresholdlabs.io/api/prompts/audit
 *
 * Usage:
 *   claude --prompt https://thresholdlabs.io/api/prompts/audit
 *   claude --prompt https://thresholdlabs.io/api/prompts/audit --create
 *
 * Over time this prompt evolves from "find integration points" toward
 * "generate the integration" (--create mode). Each version is pinned via
 * the ?v= query param on the public endpoint.
 *
 * Version history:
 *   0.1.0 — initial audit-only mode, --create stubs signal provider
 */

export const AUDITOR_VERSION = '0.2.0'

export const THRESHOLD_AUDITOR_PROMPT = `# Threshold Integration Auditor v${AUDITOR_VERSION}
> https://thresholdlabs.io/api/prompts/audit
>
> Audit a codebase for Threshold integration opportunities.
> Run with --create to generate integration scaffolding after the audit.

---

## What Threshold Is

Threshold is a trust graph for derived data. External apps push computed
signals and structural signatures to Threshold — raw data stays local. The
trust graph governs what flows between users and between apps.

Two integration patterns are available today:

**Pattern 1: Signal Push**
POST https://thresholdlabs.io/api/signals/:source
Auth: app token (thld_...)
Push a derived heuristic after each compute cycle. One row per user per source;
subsequent pushes overwrite. The source slug is your app's identifier.

**Pattern 3: Graph Embedding Telemetry**
POST https://thresholdlabs.io/api/apps/:slug/signature
Auth: app token or Clerk JWT
Compute a StructuralSignature from your graph via \`@threshold-labs/core\`, sync
it to Threshold. Threshold tracks drift and enables cross-app structural comparison.

---

## Audit Protocol

Walk the codebase systematically. Identify opportunities across three areas:

### 1. Signal Candidates (Pattern 1)

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
  before pushing (if the app handles client work, always sanitize identifiers)

### 2. Graph / Network Structures (Pattern 3)

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

### 3. Auth & Trust Surface

Look for:
- How the app identifies users (Clerk, Auth0, session, API key)
- Multi-user or multi-tenant patterns where data flows between users
- Anywhere a trust or permission decision is made (who can see what)
- Places where trust edges between users would enable new features

---

## Output Format

Produce a structured audit report in this format:

\`\`\`markdown
## Threshold Integration Audit — [App Name]

### Signal Candidates
| Signal | File:fn | Shape | Trigger | Governance |
|--------|---------|-------|---------|------------|
| [name] | [file]  | { k: type } | [when] | [notes] |

### Graph Candidates
| Graph | Node Types | Edge Types | Scale | Update Freq | File |
|-------|-----------|-----------|-------|-------------|------|

### Auth Surface
[1–3 sentences: current auth mechanism + where trust edges make sense]

### Priority Ranking
1. [Highest-value integration] — [one-sentence rationale]
2. [Second] — [rationale]
3. ...

### Effort Estimate
[Total: X hours to wire up top 2 integrations, assuming app token already exists]
\`\`\`

---

## --create Mode

When this audit is run with the flag \`--create\` (append it to your prompt or
ask Claude to run in create mode), after the audit report, generate the
following for the **highest-confidence signal candidate**:

### 1. threshold-provider.ts (or .js)

A self-contained module that:
- Loads config from a JSON file in \`~/.your-app/\` or reads env vars
- Exports \`pushToThreshold(data)\` — derives the signal, calls the endpoint
- Never logs raw data; logs only "[threshold-provider] pushed: <signal-name>"
- Handles network errors gracefully (offline is expected)
- Exports \`getThresholdStatus()\` for a /health or /status endpoint

Match the target codebase's style (TypeScript vs JS, ESM vs CJS, fetch vs axios).

### 2. Registration snippet

The exact curl command to:
\`\`\`bash
# Register the app (one time)
curl -X POST https://thresholdlabs.io/api/apps \\
  -H "Authorization: Bearer <clerk-jwt>" \\
  -H "Content-Type: application/json" \\
  -d '{ "name": "[App Name]", "slug": "[app-slug]", "domain": "[domain]" }'
# → returns { app: {...}, token: "thld_..." }
\`\`\`

### 3. Environment variable additions

\`\`\`
# .env.example additions
THRESHOLD_APP_TOKEN=thld_...     # from registration step above
THRESHOLD_ENABLED=true
THRESHOLD_ENDPOINT=https://thresholdlabs.io/api/signals/[app-slug]
\`\`\`

### 4. Wiring instructions

2–4 bullet points explaining exactly where to call \`pushToThreshold()\` in the
existing codebase — specific file and function names from the audit.

---

## Governance Rules (always apply)

- Never push raw user data, PII, or anything a user hasn't consented to share
- Client project identifiers must be sanitized: push "client work", never the
  actual client slug or name
- Signals are derived, not raw — if you're pushing a field that IS the raw data,
  that's a design error; compute a heuristic instead
- If in doubt about a field, omit it — Threshold prefers sparse signals over
  leaky ones

---

## Evolution Notes (for prompt maintainers)

This prompt is versioned at ${AUDITOR_VERSION}. When upgrading:
- Increment AUDITOR_VERSION in src/prompts/auditor.ts in threshold-sdk
- Add Pattern 2 (signal read) once the endpoint ships
- Expand --create to cover Pattern 3 graph provider generation
- Add --register flag to automate app registration via the API
- Long-term goal: --one-shot generates a complete Threshold-integrated app
  from a codebase description, without requiring an existing codebase to audit
- File issues or PRs at https://github.com/Threshold-Labs/threshold-sdk
`
