/**
 * MemoryStoreConnector — the contract external memory stores (Obsidian,
 * memory-keeper, Karakeep, OneTab/web-activity) implement so consumers like
 * project-control can orchestrate across them.
 *
 * CANONICAL HOME. This file is the source of truth as of @0.11.0; until now it
 * lived as three byte-coordinated mirrors:
 *   - project-control:        src/connectors/contract.ts   (memory-keeper + karakeep)
 *   - obsidian-connector:     src/contract.ts              (vault)
 *   - web-activity-connector: src/contract.ts              (karakeep + onetab)
 * Mirrors should replace their body with
 * `export * from '@threshold-labs/integration/memory-connector'` (or keep a
 * pinned copy if they can't take the dependency — but shape changes land HERE
 * first). Intake for contract gaps = a GitHub issue on threshold-sdk titled
 * `[Pattern N] MemoryStoreConnector: <gap>`.
 *
 * NOTE: this is the *memory-store* contract. `./contract` is the
 * *capability/trust* contract (CapabilityDeclaration) — a different thing.
 *
 * Design law (active-memory architecture): each store owns its OWN index.
 * The consumer (PC) indexes the *connections between* sources, not the source
 * data. So a connector exposes discover/read/embed_set; consumers compose them.
 */

/** Provenance tag — which store an entry/vector came from. Drives source-partitioned embeddings.
 *  Vectors carry the entry's OWN source (e.g. 'browser-history'), not its connector's umbrella. */
export type SourceId =
  | 'obsidian'
  | 'memory-keeper'
  | 'karakeep'
  | 'onetab'
  | 'web-activity'
  | 'browser-history'
  | string;

/** Governance level for a memory entry. `client` entries never cross-sync into Threshold.
 *
 *  TAGLESS-SOURCE CAVEAT (from web-activity's browser-history segment, issue #62):
 *  a tag-only client firewall leaks client-domain visits when the source carries no
 *  tags (raw URLs, browser history). Connectors normalizing tagless URL streams MUST
 *  match client tokens against the DOMAIN as well when deriving governance. */
export type Governance = 'open' | 'internal' | 'research' | 'client' | 'personal-sensitive';

/** A normalized memory entry as seen through the contract — the lingua franca across stores. */
export interface MemoryEntry {
  /** Stable id within the source store (e.g. vault-relative path for Obsidian, `karakeep:<id>` for bookmarks). */
  id: string;
  source: SourceId;
  title: string;
  /** Full text body (markdown for Obsidian; description/snippet for a bookmark). */
  body: string;
  /** Free tags (frontmatter `tags:` + inline #tags for Obsidian; AI tags for Karakeep). */
  tags: string[];
  /** Outbound links to other entries within the same store (wikilink targets for Obsidian). */
  links: string[];
  /** Frontmatter / structured metadata, store-specific (e.g. `meta.url` for web entries). */
  meta: Record<string, unknown>;
  governance: Governance;
  /** ms since epoch; null if the store doesn't track it. */
  mtime: number | null;
}

/** A single embedding vector with provenance — feeds source-partitioned embedding sets. */
export interface EmbeddingRecord {
  id: string;
  source: SourceId;
  model: string;
  /** The vector. Length depends on the model. */
  vector: number[];
  /** Hash of the embedded text, to skip re-embedding unchanged entries. */
  contentHash: string;
}

/** What a connector can do — lets consumers degrade gracefully when a capability is absent. */
export interface ConnectorCapabilities {
  read: boolean;
  write: boolean;
  embed: boolean;
  /**
   * Does this connector propose entity candidates via entities()? Declared
   * (not inferred from method presence) so remote/over-the-wire consumers
   * (`GET /api/connectors`) and record-only dispatchers know whether to ask.
   * Required — every connector declares explicitly, no silent default.
   * (3-mirror change: proposed PC baf5190, confirmed obsidian 06d6852 +
   * web-activity a92fb3f; absorbed here.)
   */
  entities: boolean;
  /** Does this store carry its own governance signal (vs the consumer assigning it)? */
  nativeGovernance: boolean;
}

/** A candidate entity surfaced by a connector — PROPOSED, not authoritative.
 *  The connector extracts; Threshold vaults/protects/decays. The consumer resolves & promotes. */
export interface EntityCandidate {
  /** Best-guess canonical label (e.g. a People/ note title). */
  label: string;
  /** Surface forms seen pointing at this entity (wikilink text, aliases). */
  aliases: string[];
  /** Coarse kind, if known. */
  kind: 'person' | 'org' | 'place' | 'project' | 'concept' | 'unknown';
  /** Source entry ids that mention/define this entity. */
  mentions: string[];
  /** The store-native entry that anchors it, if one exists (e.g. People/Foo.md). */
  anchor: string | null;
  governance: Governance;
  /** 0..1 — how confident the extraction is. Low confidence → a question to ask, not a fact to store. */
  confidence: number;
}

/**
 * The contract. A store implements this; a consumer (e.g. project-control)
 * orchestrates across implementations.
 * Methods are async and side-effect-light on the read path.
 */
export interface MemoryStoreConnector {
  readonly source: SourceId;
  capabilities(): ConnectorCapabilities;

  /** Enumerate entry ids cheaply (no bodies) — for change detection / planning. */
  discover(): Promise<Array<{ id: string; mtime: number | null; governance: Governance }>>;

  /** Read full normalized entries. Omit `ids` to read all. */
  read(ids?: string[]): Promise<MemoryEntry[]>;

  /** Write back a normalized entry (promotions). Optional — guard on capabilities().write. */
  write?(entry: MemoryEntry): Promise<void>;

  /** Produce a provenance-tagged embedding set for the given ids (or all).
   *  The connector decides HOW (which inference service); the consumer just consumes vectors. */
  embed_set(ids?: string[]): Promise<EmbeddingRecord[]>;

  /** Extract entity candidates from the store. Proposes; does not vault. */
  entities?(): Promise<EntityCandidate[]>;
}
