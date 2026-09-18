<!--
Sync Impact Report
==================
Version change: 1.0.0 → 1.1.0
Rationale: MINOR bump — one new principle added (VIII), no existing principle
redefined or removed, no backward-incompatible governance change.

Modified principles: none

Added sections:
  - Core Principles: VIII. Grounded AI Query Agent (new) — a copilot-style
    conversational agent (menu-driven suggested questions + freeform input)
    that answers only via read-only tool calls over the parsed save data.

Removed sections: none

Deferred items / TODOs: none.

Templates checked for consistency:
  - .specify/templates/plan-template.md — generic constitution-check gate, no
    principle names hardcoded; no changes required.
  - .specify/templates/spec-template.md — no constitution references; no changes
    required.
  - .specify/templates/tasks-template.md — no constitution references; no changes
    required.
  - .specify/templates/checklist-template.md — no constitution references; no
    changes required.
  - .claude/skills/speckit-checklist/SKILL.md — references constitution generically
    ("load for project principles"); no changes required.

--- Prior report (v1.0.0 initial ratification) ---
Version change: (unversioned template) → 1.0.0
Rationale: Initial ratification. The prior file was the unfilled constitution-template
scaffold (all placeholder tokens); this is the first substantive adoption, so it is
treated as a MAJOR (1.0.0) baseline rather than an incremental bump.
Added: Core Principles I–VII, Technical Constraints, Development Workflow, Governance.
This report is scratch material for human review; may be trimmed before treating the
file as final committed history.
-->

# NauticalBeg Constitution

## Core Principles

### I. Read-Only, Non-Destructive Save Handling
The tool MUST treat every user-supplied EU5 save file as read-only input. Parsing
MUST NOT mutate, re-serialize, or overwrite the original file on disk. Uploaded or
loaded save data MUST NOT be retained on a server beyond the active analysis
session unless the user explicitly opts in to persistence; when server-side
processing is used, save contents MUST be handled as sensitive user data (not
logged, not shared with third parties, deleted promptly after use). Prefer
client-side (in-browser) parsing over server upload whenever feasible, since it
minimizes data handling risk and gives the fastest path to feedback for the user.

**Rationale**: A save file is the user's private play data and, in some cases,
large; treating it as immutable, ephemeral input avoids data-loss and
privacy incidents and keeps the tool trustworthy for a hobbyist audience that will
inspect network traffic and file-system behavior.

### II. Parser Correctness & Test-First Fixtures (NON-NEGOTIABLE)
EU5's save format is undocumented and reverse-engineered. Every parser change
(new field, new structure, new game version support) MUST be accompanied by a
committed sample-fixture (a real or minimized representative save excerpt) and a
regression test asserting the parsed output, written and reviewed BEFORE the
parsing logic is merged. A parser change without an accompanying fixture and test
MUST be rejected in review. Silent partial-parse failures are forbidden: unknown
or unparseable structures MUST be surfaced (explicit warning/error in output), not
dropped silently.

**Rationale**: Without an official schema, tests against real fixtures are the
only guardrail against silent, hard-to-detect regressions when Paradox changes
the save format or when edge cases (rare unit types, unusual game states) are
encountered.

### III. Explicit Format-Version Compatibility
The tool MUST detect and record the EU5 save/game version associated with a
loaded file and route parsing through an explicit version-aware compatibility
layer (adapters or version-gated logic), never silent best-effort guessing across
versions. When a save's version is newer or older than what the tool explicitly
supports, the tool MUST fail loudly with a clear, actionable message rather than
producing a partially-correct or misleading visualization.

**Rationale**: Grand-strategy titles patch frequently and save formats drift;
explicit versioning turns "the map looks wrong" bug reports into a known,
diagnosable compatibility gap instead of silent data corruption.

### IV. Accurate, Unembellished Representation
Visualizations and statistics MUST represent what is actually present in the
parsed save data. Any value that is derived, interpolated, estimated, or
extrapolated (e.g., filling gaps in a time series, projecting a trend) MUST be
visually and textually distinguished from raw parsed values. The tool MUST NOT
present fabricated or placeholder data as if it were real game state.

**Rationale**: Users use this tool to understand the true state of their game;
conflating derived/estimated figures with ground truth undermines the core value
proposition and can mislead strategic decisions the user makes from it.

### V. Performance & Scalability for Large Saves
EU5 saves can be very large (many provinces, countries, and centuries of
history). Parsing and rendering MUST NOT block the main UI thread for
non-trivial files: heavy parsing MUST run off the main thread (e.g., web
workers) or be streamed/chunked, and large datasets in visualizations (maps,
long time-series, big comparison tables) MUST use virtualization, pagination, or
level-of-detail techniques rather than rendering every data point unconditionally.
Any operation expected to take longer than one second MUST show progress
feedback to the user.

**Rationale**: A frozen tab on a multi-hundred-year campaign save is the single
fastest way to lose user trust; grand-strategy save files are exactly the
large-data case this principle exists to cover.

### VI. Visualization Clarity & Accessibility
Every visualization MUST be legible and accessible: color choices MUST remain
distinguishable under common color-vision deficiencies (no red/green-only
encodings for map or chart categories), interactive elements MUST be
keyboard-navigable where practical, and charts MUST NOT use misleading practices
(e.g., truncated/non-zero baselines presented without visual indication, or
inconsistent scales across compared series). Map-based views MUST provide a
non-color-dependent way to identify entities (labels, patterns, or tooltips).

**Rationale**: This is a visualization-first tool competing directly against
EU5's built-in UI; clarity and honesty of presentation are the product's core
differentiators, not a cosmetic afterthought.

### VII. Simplicity & Incremental Scope
Build the smallest feature that answers the current user need. Speculative
features not driven by an actual parsing/visualization requirement (e.g.,
multiplayer collaboration, cloud accounts, save editing/mutation) MUST NOT be
built ahead of demand. New abstractions (plugin systems, generic
format-agnostic parsers, configurable rendering engines) MUST be justified by a
concrete, current requirement, not a hypothetical future one.

**Rationale**: A reverse-engineered save format and a small visualization
surface change fast; premature abstraction here is more likely to be thrown away
than reused, and slows down responding to real format changes.

### VIII. Grounded AI Query Agent
The tool MUST offer a conversational, copilot-style agent surfaced directly in
the UI (e.g., a persistent panel offering both suggested/menu-driven questions
and freeform natural-language input) that lets users ask questions about their
loaded save. This agent MUST answer exclusively by calling well-defined tools
against the parsed internal representation (per the parsing/visualization
decoupling in Technical Constraints); it MUST NOT answer questions about the
user's specific game state from general model knowledge when the save data
itself can answer the question. Every tool exposed to the agent MUST be
read-only against the save data (consistent with Principle I) — the agent
MUST NOT be granted any tool that mutates the save or persists state beyond the
session. Answers involving derived or estimated figures MUST be labeled as such
(per Principle IV), and responses SHOULD surface which underlying data point(s)
or tool call grounded the answer so the user can verify rather than blindly
trust the response. Suggested/menu questions MUST be generated from what the
loaded save actually contains (e.g., the player's own countries, the loaded
time range) rather than generic, save-independent prompts.

**Rationale**: An LLM agent free to answer from parametric knowledge about EU5
mechanics can produce confident, plausible-sounding statements about a specific
player's game state that are simply wrong; grounding every answer in an
auditable, read-only tool call over the actual parsed save — and surfacing
save-aware suggested questions rather than a blank prompt — keeps the copilot
both trustworthy and easy to start using, consistent with the tool's core
promise of accurate representation.

## Technical Constraints

- The tool is web-based; parsing and visualization code MUST run in evergreen
  browsers without requiring a native install for the core experience.
- The tool MUST NOT redistribute Paradox Interactive's copyrighted game assets
  (map textures, icons, localization text bundled with the game) as part of the
  application; only data derived from the user's own save file may be rendered,
  and any reference assets used for presentation (e.g., a base map) MUST be
  either originally created, licensed, or sourced from data the user's own game
  installation/save provides.
- Any server-side component MUST minimize retention of user save data per
  Principle I and MUST document what is stored, for how long, and why.
- The parsing layer MUST be decoupled from the visualization layer (parsed data
  exposed as a stable internal representation) so that new visualizations can be
  added without touching parsing logic, and parser fixes don't require
  visualization changes.

## Development Workflow

- Every pull request touching the parser MUST include or update fixture-based
  tests per Principle II; reviewers MUST verify a fixture exists before approving.
- Every pull request adding or changing a visualization MUST include a manual
  verification note (screenshot or description of what was checked) confirming
  Principle VI (accessibility/clarity) was considered.
- Plans and specs produced via the Spec Kit workflow (`/speckit-plan`,
  `/speckit-specify`) MUST explicitly check proposed work against these
  principles; any deviation MUST be called out and justified in the plan's
  complexity/deviation tracking rather than silently ignored.
- Newly discovered EU5 save-format findings (field meanings, structure
  quirks) SHOULD be captured alongside the fixture/test that encodes them, so
  format knowledge stays version-controlled rather than tribal.

## Governance

This constitution supersedes other informal practices for this project. All
plans, specs, and PRs MUST be checked for compliance with these principles;
any complexity or deviation MUST be explicitly justified in the relevant
document rather than silently introduced.

**Amendment procedure**: Amendments are made by editing this file directly (via
`/speckit-constitution` or an equivalent reviewed change), updating the Sync
Impact Report, and bumping the version per the policy below. An amendment
MUST state what changed and why.

**Versioning policy** (semantic versioning applied to governance content):
- MAJOR: Backward-incompatible principle removal or redefinition that changes
  what was previously required.
- MINOR: A new principle or materially expanded guidance is added.
- PATCH: Wording clarifications, typo fixes, or non-semantic refinements.

**Compliance review**: Reviewers of any plan, spec, or pull request are
responsible for checking it against the Core Principles above before approval.
Repeated or systemic violations should prompt a constitution amendment
(if the rule is wrong) rather than repeated ad-hoc exceptions (if the rule is
right but frequently ignored).

**Version**: 1.1.0 | **Ratified**: 2026-09-17 | **Last Amended**: 2026-09-17
