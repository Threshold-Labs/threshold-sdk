# Threshold — Positioning

How Threshold relates to adjacent projects and where it differs.

The short answer: we haven't seen anyone attempting the same combination.
Each of these projects does something Threshold touches, but none of them
are building toward the same thing.

---

## vs. IPFS

**IPFS solves:** "How do I make content available and verifiably intact?"

**Threshold solves:** "How do I make the right things accessible to the right
people at the right level of detail — and what can I learn structurally from
those relationships over time?"

**Trust model.** IPFS is content-addressed — if you have the CID and the data
isn't encrypted, you can get it. There is no native notion of "I trust you with
this capability but not that one." Threshold's entire surface is
trust-differentiated. Capability declarations, the disclosure manifest, the
grant model — all of it expresses what you are willing to share, with whom,
and at what granularity.

**Consumer capability selection.** In IPFS, you retrieve what was stored. The
consumer has no say in the shape of the data. In Threshold, consumers select
capabilities explicitly. That choice is a first-class primitive, not a workaround.

**Temporal discovery.** IPFS can pin versions of content but has no native model
for "what is the current structural trajectory of this entity, and where is it
headed?" Threshold's structural signatures are fundamentally time-series —
discovery of relevant entities happens along the manifold of structural
similarity over time. IPFS has no topology of entities, only of content.

**The analytical layer.** IPFS has none. Threshold's analysis layer operates on
structural signatures that never leave the vault — you get intelligence about
patterns and relationships without the raw data crossing any boundary.

**Economic primitive.** IPFS/Filecoin prices storage and retrieval. Threshold
prices certification — the value is in being the authoritative issuer of trust
credentials, not in storing content.

**Complementarity.** IPFS is a reasonable storage layer for vault data. The
vault pattern doesn't prescribe where data lives — an IPFS-hosted dataset
behind a Threshold vault endpoint is a valid architecture.

---

## vs. Solid (Tim Berners-Lee)

**Solid solves:** "How do I own my data and control which apps can access it?"

Solid gives users a personal data pod — a server where their data lives. Apps
read and write to the pod with the user's permission. It is primarily about
data portability and ownership.

**Where Solid stops.** Solid's permission model is relatively coarse — you
grant an app access to a resource (a folder, a file). There is no structural
analysis layer. No trust-differentiated capability model where "I trust you
with the shape of my graph but not the content." No temporal trajectory
analysis. No attractor or manifold intelligence. The pod is a file system
with access control, not a trust graph with structural intelligence.

**The UI question.** Solid does not have an opinion about visualization. Apps
build whatever UI they want on top of pod data. Threshold is building a UI
layer specifically for navigating trust-differentiated structural data —
including interacting with data you do not have full access to (see below).

**Complementarity.** A Solid pod could serve as a vault endpoint. The Threshold
trust graph could govern which apps get credentials to access which pods.

---

## vs. Runpod / distributed compute marketplaces

**Runpod solves:** "How do I rent GPU compute from node operators at market rates?"

This is compute infrastructure. It has no trust model for data, no structural
analysis, no vault pattern, no temporal knowledge graph.

**Where Threshold overlaps.** The sideslip federation (Threshold's inference
routing layer) operates over compute nodes that could be sourced from marketplaces
like Runpod. The pool architecture — sovereignty boundaries for compute owned
by an entity, governed by trust rules — is adjacent to what Runpod node
operators want. Runpod is a potential distribution channel for exposing nodes
to a broader ecosystem.

**The distinction.** Runpod is neutral infrastructure. Threshold is an opinionated
trust layer on top of compute and data. They are more complementary than competitive.

---

## The UI layer for redacted data

This is the piece we haven't seen meaningfully attempted elsewhere.

Most privacy-preserving systems present users with a binary: you either see
everything (after granting access) or you see nothing. The structural signature
work makes a third option possible: **you see the shape without the content.**

### Metadata resolution reveals structure

What looks like a single node at metadata access level carries three signatures
that reveal its nature without disclosing its content:

- **Temporal signature** — when does it pulse? How regular is its cadence?
- **Attention signature** — how much of a user's focus does it draw over time?
- **Complexity signature** — how much compute does it require to produce?

A node with high complexity, irregular temporal cadence, and variable attention
is almost certainly a rich graph operating at low-frequency intervals — not a
dumb sensor. A node with low complexity and high-frequency regular pulses is
probably an ambient signal. The metadata alone reveals the structural category
without revealing what the node actually contains.

This is the foundation of trust-gated resolution: even at the most restricted
access level, entities are not invisible — they are present, typed, and
structurally positioned. As trust deepens, they resolve from signatures to shapes,
from shapes to labeled nodes, from nodes to navigable subgraphs.

### Multi-axis projection

The same entity graph, projected onto three orthogonal planes simultaneously.
The axes: **Time**, **Attention**, **Complexity/Compute**.

Each plane shows the same nodes reorganized against a different pair of axes.
The node that appears central in the Attention × Time plane may be peripheral
in the Complexity × Attention plane. The same data, read from different vantage
points, reveals different structural relationships. The user can rotate between
projections — not switching to a different dataset, but reorienting the same
topology.

The underlying math is constant. The labels and emphasis are perspectival.
A developer frames the same axes as Projects × Dependencies. A creator frames
them as Audiences × Topics. The projection is the same; the semantic layer on
top shifts to match how the user naturally organizes their world. This is the
Societies / personas angle operating at the interface layer — different
framings of the same structural space.

### GPU-computed interactive topology

The projection is UMAP-class computation running client-side in WebGL/WebGPU.
The compute happens where the person is, not where the data is. The data never
moves; the topology is computed locally from the structural signatures the user
has access to. This makes the visualization interactive — the manifold responds
to navigation in real time — without requiring server-side access to vault data.

The metaball rendering for trust boundaries adds to this: entities that are
structurally similar in the manifold merge as organic shapes. Boundary fuzziness
encodes trust and uncertainty in the visual language directly. Proximity in the
UMAP projection becomes proximity in the visualization. Trust level modulates
how much detail resolves at each boundary.

### What this enables

A user can navigate, reason about, and make decisions based on data they do
not fully have access to. They can see that something significant exists, roughly
what kind of thing it is, and how it relates structurally to things they do have
access to — without the content crossing any trust boundary.

Granting or receiving access is a visible, spatial act in this surface: a node
resolves, a boundary clarifies, a subgraph unfolds. The trust model is not a
settings menu. It is the rendering logic of the interface itself.

We haven't seen this attempted in this way — the combination of trust-gated
metadata resolution, multi-axis structural projection, and GPU-computed
interactive topology over a temporal knowledge graph.

---

## The combination

What Threshold is attempting:

1. A trust graph that governs capability-differentiated access to vaulted data
2. A structural analysis layer that operates on content-free signatures
3. A temporal intelligence layer built on attractor dynamics and manifold
   projection — not language models, because the tokens stay in the vault
4. A certifying protocol that moves from policy guarantees toward cryptographic
   guarantees
5. A UI layer for navigating and interacting with trust-differentiated,
   partially-redacted structural data

No single project in this space is attempting all five. Most are attempting one.
The combination is the thing.
