# Why register? — the Threshold value prop, by audience × player count

The cold-start audit exposed a real gap: a solo builder who registers 5 capabilities today gets
*architecture*, not a *speedup*, because the differentiated thing (trust-gated cross-user exchange)
isn't runnable. That made "why bother registering" unanswerable in single-player. It has an answer.
This doc is the answer, split two ways: **who's being convinced** (a human, or their coding agent)
× **how many people's data is involved** (single-player now, multiplayer later).

The unifying fact: **the capability contract (`capability.json` / `INTEGRATION_CONTRACT`) is the
shared interface for all four cells.** Same artifact convinces the human, the agent, the solo build,
and the network.

```
                 SINGLE-PLAYER (true today)        MULTIPLAYER (the moat)
HUMAN     don't-build-it-twice across your        own your data; share WHEN not WHAT;
          own portfolio; "your app is already     trust-gated exchange between people
          5–6 capabilities"; contained scope
AGENT     registry = cross-session memory;        declarative trust policy — agent calls
          contract = typed interface;             project()/redact() without reasoning
          capability = a context boundary         about the policy (you own it, it's safe)
```

---

## Single-player, human — the adoption door (true *today*, cheap to ship)

1. **Don't build it twice.** A builder with many apps reuses capabilities across their *own*
   portfolio — no trust graph required. an early builder's portfolio-eval is the proof: `local-inference`
   powers all 8 of his POCs, `interest-graph` 5, `overlap` ~4. Register once, compose N times.
   The "floor rises" is true at **n=1 user / n=many apps.**
2. **Overflow containment.** A contract is a boundary: "this does ONE thing, here's its I/O."
   Registering forces the discipline that stops the app-vs-capability collapse (the welding an early builder
   kept doing — `FocusStore` welded into the app, signal logic living in `FocusSessionBar.tsx`).
   Even solo, the contract keeps logic from sprawling into the app.
3. **The recognition moment.** "Your app is already 5–6 of these types" — decomposition as
   *recognition, not translation* (audit §4). The single most persuasive on-ramp, and it works
   before any sharing exists.

> **What this needs to ship:** only a **discoverable registry** — a readable index of declared
> contracts (`threshold registry`). NOT the full typed `invoke`. This is the cheap adoption hook
> that should ride alongside Tier 0. (roadmap tracked privately).

## Single-player, agent — the under-articulated one

Early builders build *with* Claude Code instances. Threshold's value to the **agent** is distinct from its
value to the human, and it's the part the pitch most under-sells:

1. **The registry is the agent's cross-session memory.** An agent re-derives solutions every
   session — it has no memory that "I already solved local-inference." A registry of contracts is
   exactly that memory: "a capability for X exists, here's its shape, compose it" instead of
   rebuilding. **Don't-build-it-twice at the *agent* level.**
2. **The contract is a typed interface the agent reads without reading the impl.** `capability.json`
   tells the agent the I/O shape, trust level, cadence — so it integrates against a contract, not by
   reverse-engineering code. Fewer hallucinated integrations (an early builder's audit: he *invented* I/O types
   at `task-breakdown/index.ts:58` because the contract had none — fix that and the agent stops
   guessing).
3. **A capability is a context boundary.** The agent works *one* capability with a clear contract
   instead of holding the whole app in context. Smaller, cleaner units → better use of the window.

> This cell is why "appeals to coding tools" is real, not a slogan: the registry + contract turn an
> agent's two structural weaknesses (no cross-session memory, must read code to integrate) into
> solved problems.

## Multiplayer, human — the moat (why you *stay*)

Own your data (runs on your infra); share **WHEN you focus without WHAT** (graduated projection);
trust-gated, app-to-app exchange between people. This is the differentiated thing — and per the
audit, the part a cold-start builder *cannot run yet* (`session-vault` declared, unimplemented).
Tier 0 makes it runnable. This is what no competitor has.

## Multiplayer, agent — safe sharing for free

The trust/projection policy is **declarative and owned by Ryan**. The agent calls
`project()` / `redact()` and gets trust-bounded data sharing without having to *reason about* the
policy. The hard part (what each `trustLevel` reveals) is not the agent's problem — it's a contract.

---

## The adoption logic (how to sequence the pitch)

- **Single-player gets you in the door** — reuse + containment + agent-memory. True today, needs
  only a discoverable registry. **This is the pitch to early builders and their agents right now.**
- **Multiplayer is why you stay** — the trust-gated moat. Needs Tier 0. This is the pitch once the
  builder has two people's data to connect.

Don't lead with the moat to a solo builder — they can't run it, and the audit shows that reads as
"great in theory, couldn't build it." Lead with don't-build-it-twice; let the moat pull them deeper.

## One-liners

- **To a human:** *"Register a capability once and never rebuild it — across your apps today, across
  people's trust tomorrow. You own the data; you choose when it's shared, not what."*
- **To a coding agent:** *"The registry is your memory and the contract is your interface — discover
  and compose what already exists instead of re-deriving it every session, and share data through a
  trust policy you don't have to reason about."*
