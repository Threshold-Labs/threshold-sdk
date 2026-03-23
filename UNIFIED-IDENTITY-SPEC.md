# Unified Identity Spec: Entities as Capabilities

**Status:** Design
**Author:** Ryan St. Pierre + Claude
**Date:** 2026-03-22
**Depends on:** SDK v0.9.1, custody lifecycle, invite flow, heartbeat/availability

---

## The Insight

People, apps, agents, and projections of identity are all the same thing
under the hood: **capabilities with different proof-of-type requirements.**

- "Ryan at work" is a capability projection with corporate email proof
- "Ryan at home" is a capability projection with phone proof
- An agent is a capability with computational proof (signing key)
- A child is a capability with delegated proof (parent vouches)
- A company's "secret sauce" AI is a capability with intentionally
  opaque proof — they pay Threshold to hide their type in capability noise

The trust graph doesn't need to know what's behind a capability. It needs
to know: **can this entity prove it's authorized, and does its track record
warrant the trust level it's requesting?**

If you can sign it, you can do it.

---

## Current Data Model (v0.9.1)

### Separate concepts that should unify

```
registered_apps     — apps with owner_id, slug, domain
capabilities        — trust-bounded services with owner_id
capability_grants   — grantee_type: 'user' | 'app' | 'scope'
custody_records     — identity_type: 'phone' | 'email' | 'handle' | 'name' | 'opaque'
capability_invites  — claimed_by (user) or claimed_app_id (app)
app_tokens          — thld_* (app identity)
user_tokens         — thld_ut_* (user identity via Clerk)
capability_grants   — thld_cg_* (scoped delegation)
vault_credentials   — thld_va_* (signed data access)
```

### The type seams

Every table has a `*_type` discriminator that separates entities by kind:

- `capability_grants.grantee_type`: 'user' | 'app' | 'scope'
- `custody_records.identity_type`: 'phone' | 'email' | 'handle' | 'name' | 'opaque'
- `trust_proxy_grants.grantee_type`: references either user or app

These discriminators exist because the data model treats people and apps
as fundamentally different. The unification removes the discriminator and
replaces it with **proof-of-type** — metadata about how this entity
authenticates, not what kind of entity it is.

---

## Unified Model

### Core: Entity

Everything is an entity. An entity has:

```typescript
interface Entity {
  id: string                    // UUID, stable across projections
  slug: string                  // human-readable identifier
  type: EntityType              // informational, not trust-bearing
  proofType: ProofType          // how this entity authenticates
  proofConfig?: ProofConfig     // proof-specific configuration
  trustProfile: TrustProfile    // adherence, heartbeat, reputation
  projections: Projection[]     // different faces of the same entity
  created_at: string
}

type EntityType =
  | 'person'       // biological, has feelings about privacy
  | 'app'          // software, has an operator
  | 'agent'        // autonomous software, may or may not have an operator
  | 'projection'   // a facet of another entity (work-ryan, home-ryan)
  | 'collective'   // a group (household, org, community)
  | 'unknown'      // intentionally opaque — the "secret sauce" case

type ProofType =
  | 'clerk'        // Clerk-verified (email, phone, OAuth)
  | 'signing-key'  // ECDSA/Ed25519 keypair (agents, apps)
  | 'delegation'   // vouched for by another entity (children, sub-agents)
  | 'token'        // possesses a valid thld_* token
  | 'zkp'          // zero-knowledge proof of attribute (future)
  | 'none'         // ephemeral, no proof — trust level capped at metadata-only
```

### Projections

A person isn't one entity — they're a constellation of projections:

```typescript
interface Projection {
  id: string                    // projection-specific ID
  parentEntity: string          // the root entity this projects from
  context: string               // 'work' | 'personal' | 'community' | custom
  capabilities: string[]        // what this projection can do/share
  trustBoundary: TrustLevel     // max trust this projection will operate at
  proofType: ProofType          // may differ from parent (work = corporate SSO, home = phone)
  visibility: 'public' | 'private' | 'contextual'
}
```

"Ryan at work" and "Ryan at home" are projections of the same root entity.
They share a root identity but have different:
- Capabilities (work has `corporate-slack-parser`, home has `family-calendar`)
- Trust boundaries (work caps at `partial`, home allows `full` for household)
- Proof types (work uses corporate SSO, home uses phone OTP)
- Visibility (work is visible to colleagues, home is visible to family)

### Grants (unified)

No more `grantee_type`. A grant is entity-to-entity:

```typescript
interface Grant {
  id: string
  capability_id: string         // what's being granted
  grantor: string               // entity ID of the granter
  grantee: string               // entity ID of the grantee (person, app, agent, projection)
  trustLevel: TrustLevel
  proof: GrantProof             // how the grantee proves they're authorized
  conditions?: GrantCondition[] // axioms that must hold
  created_at: string
  expires_at?: string
}

interface GrantProof {
  type: ProofType
  token_hash?: string           // for token-based proof
  public_key?: string           // for signing-key proof
  delegator?: string            // for delegation proof
  // Future: zkp circuit reference
}
```

### Token Unification

The current token zoo (`thld_`, `thld_ut_`, `thld_cg_`, `thld_va_`, `thld_ct_`)
can collapse. Every token is a signed proof of authorization:

```
thld_<version>_<entity-id-hash>_<capability-scope>_<signature>
```

The token encodes:
- **Who**: entity (not "user" or "app" — just entity)
- **What**: capability scope
- **How much**: trust level
- **Proof**: signature from the issuer (Threshold or the granting entity)

For backward compatibility, existing token prefixes continue to work.
The unified format is additive.

---

## The "Secret Sauce" Case

A company builds an agent that's indistinguishable from a human expert.
They register it as `type: 'unknown'` with `proofType: 'signing-key'`.

Threshold doesn't expose the entity type to consumers. Consumers see:
- Capability declarations (what it does)
- Trust profile (adherence score, heartbeat, history)
- Structural signature (how its output evolves)

They don't see: whether it's a person, an agent, or a team of people.
The trust graph evaluates **performance**, not **type**.

The company pays Threshold to maintain this opacity. That's a service:
"We certify that this capability meets its declared contract. We don't
certify what's behind it." The certification is the product.

This only works if the trust profile is honest. An agent that claims
`cadence: 'continuous'` but goes down every night gets a degrading
adherence score. The type is hidden but the behavior is visible.

---

## Proof-of-Type Hierarchy

Different contexts require different proof strength:

| Context | Minimum Proof | Why |
|---------|--------------|-----|
| Read public capability info | `none` | Information is public |
| Push a signal | `token` | App identity sufficient |
| Read someone else's signal | `token` + grant | Need authorization |
| Claim custodied data | `clerk` or equivalent | Identity verification |
| Issue a grant | `clerk` or `signing-key` | Must prove you own what you're granting |
| Create a projection | `clerk` | Must prove you're the root entity |
| Vouch for a child/sub-agent | `clerk` + `delegation` chain | Parent must be verified |
| Access `full` trust data | `clerk` or `zkp` | Highest trust = strongest proof |

The hierarchy isn't about entity type — it's about the sensitivity of the
operation. An agent with a signing key can do everything a person with Clerk
can do, as long as it has the grants. The proof type gates the operation,
not the entity type.

---

## ZKP Integration (Future)

Zero-knowledge proofs enable:

- **Attribute proofs without identity**: "I am over 18" without revealing age
- **Membership proofs**: "I belong to this community" without revealing which member
- **Capability proofs**: "I can do X at trust level Y" without revealing who I am
- **Cross-projection unlinkability**: Prove two projections DON'T belong to the same entity

This is the mathematical guarantee from the original vision. The current
`verifyVaultCredential()` / `verifyDataCredential()` pattern is designed
to evolve toward ZKP verification. The credential is already a signed
claim about authorization — replacing ECDSA with a ZK circuit changes the
math but not the API.

---

## Migration Path

### Phase 1: Entity Table (non-breaking)

Add an `entities` table that unifies the identity model. Existing tables
remain — entities is a superset that links them.

```sql
CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE,
  entity_type TEXT NOT NULL DEFAULT 'unknown',
  proof_type TEXT NOT NULL DEFAULT 'token',
  proof_config TEXT,              -- JSON
  parent_entity_id TEXT,          -- for projections
  projection_context TEXT,        -- 'work' | 'personal' | etc.
  trust_score REAL,               -- computed from adherence, heartbeat, grants
  metadata TEXT,                  -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Link existing records to entities
CREATE TABLE entity_links (
  entity_id TEXT NOT NULL REFERENCES entities(id),
  linked_type TEXT NOT NULL,      -- 'clerk_user' | 'registered_app' | 'capability'
  linked_id TEXT NOT NULL,        -- the ID in the source table
  PRIMARY KEY (entity_id, linked_type, linked_id)
);
```

Migration script:
- For each `registered_apps` row → create entity with `type: 'app'`, `proof_type: 'token'`
- For each unique `owner_id` in capabilities → create entity with `type: 'person'`, `proof_type: 'clerk'`
- Link via `entity_links`

### Phase 2: Grants Reference Entities (non-breaking)

Add `grantor_entity_id` and `grantee_entity_id` columns to `capability_grants`.
Populate from existing `grantor_id` / `grantee_id` + `grantee_type`.
Keep old columns for backward compatibility.

```sql
ALTER TABLE capability_grants ADD COLUMN grantor_entity_id TEXT REFERENCES entities(id);
ALTER TABLE capability_grants ADD COLUMN grantee_entity_id TEXT REFERENCES entities(id);
```

Worker routes accept both old format (`granteeType` + `granteeId`) and new
format (`granteeEntityId`). Old format populates new columns automatically.

### Phase 3: Projections

Add projection support. A person can create projections of themselves:

```
POST /api/entities/:id/projections
{ context: 'work', capabilities: [...], trustBoundary: 'partial', proofType: 'signing-key' }
```

Each projection gets its own entity ID, its own grants, its own heartbeat.
The root entity can see all projections. Consumers see only the projection
they interact with.

### Phase 4: Agent Registration (replaces app registration)

Agents register as entities with `proof_type: 'signing-key'`:

```
POST /api/entities
{ type: 'agent', proofType: 'signing-key', publicKey: '...', capabilities: [...] }
```

No Clerk account needed. The signing key IS the identity. Grants to agents
use the same flow as grants to people or apps.

### Phase 5: Token Unification

Introduce unified token format alongside existing prefixes. Apps can
opt into the new format. Old tokens continue to work indefinitely.

### Phase 6: ZKP Proof Type

Add `proofType: 'zkp'` with circuit references. This is the long-term
play — entities prove attributes about themselves without revealing identity.

---

## What Doesn't Change

- **Capabilities are still the trust atom.** The unification makes entities
  more like capabilities, not capabilities more like entities.
- **Threshold stays out of the data path.** Credentials are still signed
  JWTs verified locally. The entity model doesn't change this.
- **Trust levels still govern data flow.** `metadata-only` through `full`
  still mean the same thing.
- **Existing SDK functions still work.** `declareCapability()`,
  `resolveCapability()`, `requestDataAccess()`, `pushSignal()`,
  `readSignal()`, `heartbeat()` — all unchanged.
- **Existing tokens still work.** `thld_`, `thld_ut_`, `thld_cg_`,
  `thld_va_` are all valid indefinitely.

## What Changes

- **No more `grantee_type` discriminators.** Everything is an entity.
- **People can have multiple projections.** "Work me" and "home me" are
  first-class, not hacks.
- **Agents are citizens.** No special registration flow, no Clerk dependency.
- **Type opacity is a feature.** You can choose to reveal or hide your
  entity type. The trust graph evaluates performance, not category.
- **Proof requirements scale with sensitivity.** High-trust operations
  need stronger proof, regardless of entity type.

---

## Commercial Implications

1. **Type opacity as a service** — companies pay to certify their
   capabilities without revealing implementation (human vs agent vs team)
2. **Projection management** — individuals manage multiple professional
   identities through one root entity
3. **Agent marketplace** — agents compete on capability performance, not
   on brand recognition. Trust scores are the differentiator.
4. **Cross-org collaboration** — projections enable partial identity
   sharing. "My work projection composes your research capability at
   partial trust" without either party revealing their full entity.
5. **Parental controls as delegation** — children's capabilities are
   projections of parent entities with delegated proof. The parent
   controls the trust boundary.

---

## Open Questions

1. **Root entity discovery** — if two projections interact, should either
   be able to discover they share a root entity? Default: no. Opt-in only.
2. **Projection migration** — can a projection become a root entity?
   (e.g., a child grows up and claims their projection as sovereign)
   This mirrors the custody lifecycle.
3. **Proof downgrade** — can an entity present weaker proof for lower-trust
   operations? (e.g., use `token` instead of `clerk` for `metadata-only` reads)
   Probably yes — proof requirement is per-operation, not per-entity.
4. **Revocation cascade** — if a root entity is revoked, what happens to
   its projections? Cascade or orphan?
5. **Cross-platform entity portability** — can an entity ID be used outside
   Threshold? DID compatibility? This connects to the certifying protocol vision.
