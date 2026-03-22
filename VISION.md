# Threshold — Vision

## What Threshold Is

Threshold is a trust broker, not a data store.

Apps hold their own data in vaults. Threshold holds the trust graph — who has
granted whom access to what — and structural signatures that describe the shape
of data without revealing its content. When app B needs data from app A,
Threshold issues a credential. The data flows A → B directly. Threshold never
sees it.

This is an architectural guarantee, not a policy commitment. Even Threshold as
platform operator cannot reverse-engineer what apps are doing or how users
behave in them.

## Why This Model

### For users

The usual model is: give an app your data and trust their promises. Threshold
inverts this. Users hold data in a vault and bring it to apps on their terms.
They can revoke access. They can take their data elsewhere. The vault is
portable.

Over time, the platform surfaces a question users have never been able to
answer clearly: *what have I trusted different people and apps to do for me,
and was it worth it?* That legibility creates the conditions for a market.

### For developers

Apps declare exactly what they do — which data they need, what they compute,
what they return. That declaration is the product surface, not the codebase.
Apps compete on declared capabilities rather than on who can build the most
features. The best focus tracker wins the focus-tracking trust allocation.
The best email triager wins that slot. Each function gets hardened by
competition.

The long tail rewards experimentation. Users with specific needs can find apps
that serve those needs precisely because capabilities are enumerable and
comparable.

### For the platform

Threshold earns by brokering high-trust connections, not by holding data. The
trust graph is the network effect — the richer it gets, the better the
matching between users who need a capability and apps that provide it.

## Why Attractors and UMAP, Not LLMs

Threshold will not see the tokens. That is a feature.

Structural signatures — the one artifact Threshold does hold — are points in
a high-dimensional topological space. They describe the *shape* of a graph:
density, clustering coefficient, degree distribution. You cannot reconstruct
topology or infer content from them. This is mathematically guaranteed.

What you can do with signature trajectories over time is attractor analysis.
A graph's structural evolution traces a path through that space. Some
configurations are stable attractors — the graph keeps returning to them.
Others are transient. The attractor a graph settles into is a meaningful
signal about the system it represents, entirely without knowing the content.

UMAP projects that high-dimensional structural space into something navigable.
Clusters emerge. Users whose vaults have similar structural properties appear
near each other. Cross-app structural comparison becomes possible without any
content crossing any boundary.

This is why the analysis layer is built on attractors and dimensionality
reduction rather than language models. LLMs need tokens. Threshold's value
comes from what it can say about structure when the tokens stay in the vault.

## The Economic Primitive

The trust model contains pricing primitives:

- **Trust level** (partner → acquaintance) encodes willingness to share and
  reciprocal value expectation
- **Vault richness** — the depth and age of a user's data — is the
  contribution they bring to an exchange
- **Attractor position** — where a user's graph has settled structurally —
  is a signal of how much is being computed on their behalf
- **Grant scope** (signature:read vs edges:read) is the access tier

Apps that reliably move users toward desirable structural attractors —
denser trust graphs, lower drift, more stable focus patterns — are
demonstrably more valuable. You can price that movement without ever seeing
the tokens that produced it.

Over time: what data can I bring to X in exchange for a service becomes a
legible, negotiable, revocable relationship rather than a one-way extraction.

## The Certifying Protocol

Threshold is not building a platform that holds your data safely. It is building
a protocol that certifies what you are allowed to share, with whom, and under
what conditions — and eventually, one where that certification is enforced by
mathematics rather than policy.

The near-term roadmap moves the trust model from architectural guarantee
(Threshold is not in the data path) to mathematical guarantee (Threshold is
cryptographically incapable of accessing vault data, regardless of intent).
The trust graph will be implemented in the cryptography, not just the database.

Apps integrating with Threshold today are building on a surface designed with
this end state in mind. The vault model, the disclosure manifest, the grant
schema — all of these are shaped by where the protocol is going. Migration will
be clean.

The business model follows from protocol position. Certificate authorities,
OAuth providers, PKI roots — they established the certifying role before the
monetization was obvious. The value is in being the authoritative issuer. What
gets built on top of that is a design question for later.

See [issue #24](https://github.com/Threshold-Labs/threshold-sdk/issues/24) for
the public roadmap on cryptographic trust.

## Anomaly-Driven Annotation

The question "how is X related to Y?" is the wrong question. That produces
taxonomy, not signal. Threshold does not ask users to label relationships.

The right question is: **what just happened that the system didn't predict?**

The system has structural signatures, heartbeats, composition graphs, trust
levels. It can project what should happen next. When something happens that
doesn't fit — a capability fires outside its cadence, two apps with no shared
compositions suddenly converge structurally, a user grants access to something
they've never engaged with — that's an anomaly the system can't account for.

The interaction model:

1. **System projects** based on what it knows (signatures, compositions,
   cadence, trust)
2. **System surfaces anomalies** — events it can't explain from its current
   projection
3. **User annotates the anomaly** — not "what is this" but "what happened
   that I know and you don't"
4. **System binds a control** — creates a new dimension/axis from the
   annotation
5. **Landscape reshapes** — other entities reposition based on the new axis
6. **User adjusts the control** — "more of this, less of that" in the new
   dimension

Example: the system detects that your community-digest capability and someone
else's reading-history capability just converged structurally, but you have no
trust edge connecting you. Instead of "how are these related?" it asks: "Did
something happen?" The user says "we met at an event." The system now has a
new dimension — event-encounter — that reshapes the entire landscape. Other
entities that share that dimension shift position. The user didn't label a
pair — they **introduced a new axis** that everything orients around.

The annotation is multiplicative, not additive.

Labels emerge from accumulated annotations. If 20 users annotate anomalies
that all point to "we met at events," the system names that axis
"event-encounter" and starts predicting it. Markets form around named axes
that have enough signal — not because we asked people to name markets, but
because the anomalies clustered.

This is what "gesticulative superpowers" means in practice. The user's
annotation doesn't describe a static relationship. It dynamically binds a
control surface to a part of the landscape that was previously dark. The
system couldn't see event-encounters before. Now it can, and it applies that
lens everywhere, not just to the pair that triggered the annotation.

## The Custody Gradient

The original vision assumed users show up first, then generate data. Reality
is the opposite — data about you exists before you do.

vibeswith indexes your WhatsApp community. ideas parses your comms. An event
indexer scrapes your conference attendance. All of this data exists about
people who have never heard of Threshold.

The custody lifecycle makes the trust model honest:

- **Custodial** (zero trust): the app holds data about you. You don't know,
  you haven't consented. The app declares "I hold data about identity X" —
  making custody explicit rather than pretending it doesn't exist.
- **Claimable** (low trust): you claim your identity. You know the data
  exists. The app knows you know. You're evaluating.
- **Transferring**: you create a Threshold account. Data migrates from app
  custody to your vault.
- **Sovereign** (earned trust): you own the data. The app retains access
  only via standard capability grants at a declared trust level.

Trust is a gradient, not a binary. The SDK models the full journey, not just
the end state. Most "privacy-first" platforms skip the custodial phase
entirely, which means they can only serve users who already trust them —
a chicken-and-egg problem that kills adoption.

## What This Means for the SDK

**Threshold holds:**
- Trust graph (grants, trust levels, relationships)
- Structural signatures (content-free fingerprints from `@threshold-labs/core`)
- Vault endpoint registry (where to find an app's data)
- Capability declarations (what an app can share — not the data itself)
- Custody records (who holds data about whom, and the terms of transfer)
- Heartbeat/availability state (which capabilities are live right now)

**Threshold does not hold:**
- Raw signals (apps push derived heuristics, not source data)
- Edge lists or graph content
- Vault data of any kind

**The capability model** (v0.8.0+) replaces the integration model. Everything
is a capability — connectors, signals, vaults, derivations, presentations.
Users own capabilities. Apps compose them. Trust is per-capability.

**The custody model** (v0.9.1) extends ownership to pre-claim data. Apps
declare custody. Users claim. Data transfers. The app downgrades from holder
to consumer.

**Patterns 1–6** cover the full lifecycle:
- Push/read derived signals (Pattern 1/2)
- Sync structural signatures (Pattern 3)
- Vault credential exchange (Pattern 4)
- Shared contexts / scopes (Pattern 5)
- Capability resolution + trust-scoped data access (Pattern 6)

The structural signature remains the right abstraction boundary for what
Threshold holds. Everything richer belongs in the vault. But the operational
layer — heartbeats, custody, availability — is what makes the vault model
work in practice.
