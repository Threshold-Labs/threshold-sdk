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

## What This Means for the SDK

**Threshold holds:**
- Trust graph (grants, trust levels, relationships)
- Structural signatures (content-free fingerprints from `@threshold-labs/core`)
- Vault endpoint registry (where to find an app's data)
- Capability declarations (what an app can share — not the data itself)

**Threshold does not hold:**
- Raw signals
- Edge lists
- Content of any kind

**The vault pattern** (Pattern 4, in development) enables app-to-app data
exchange brokered by Threshold without Threshold ever seeing the payload.
See [issue #21](https://github.com/Threshold-Labs/threshold-sdk/issues/21).

**Patterns 1–3** cover the content-free layer:
- Push structural signatures (content-free by design)
- Push derived heuristics (pre-computed, non-reconstructable signals)
- Read those signatures and heuristics back via the trust graph

The structural signature is the right abstraction boundary. Everything richer
than a signature belongs in the vault.
