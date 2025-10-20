# Gel MCP Server Deep Dive & Transformation Blueprint

## 0. Preface & Reading Guide
- Scope: Comprehensive audit of MCP compliance areas (tool design, resource delivery, prompts, roots, sampling, elicitation, context control, error handling & recovery, streaming/progress UX, observability, token efficiency, workflow patterns) across the current TypeScript codebase.
- Inputs: User-supplied best-practice reports (2024–2025) plus live inspection of repo state as of this analysis cycle.
- Methodology: For every practice pillar, document present behavior, enumerate gaps with code references, and prescribe implementation steps with validation strategies.
- Output format expectations: intentionally exhaustive, line-dense markdown structured for both human review and downstream tooling (LLM prompts, issue trackers, project plans).
- Navigation hints: major sections numbered, subsections include bracketed identifiers (e.g., `[TD]` for Tool Design) to ease cross-referencing.
- Line cadence: The document is purposefully expansive (thousands of lines) to satisfy requirements for extreme detail; skim headings first, then deep-dive where action is required.
- Legend:
  - `REF:` points to source lines using `path:line` syntax.
  - `BP:` tags the best-practice source concept.
  - `TASK-ID:` unique backlog identifiers for execution tracking.
  - `RISK:` enumerates risk level (Low/Med/High) and blast radius.
  - `TEST:` indicates validation artifacts to be created.

## 1. Executive Synthesis Snapshot
- Current server version: `src/app.ts:4` (`version: "1.2.0"`).
- Active tools registered via `registerAllTools` in `src/tools/index.ts:9`–`16`: `connection`, `schema`, `query`, `docs`, `prompts`, `execute-typescript`.
- Dormant/unregistered tool modules present: `cache.ts`, `session-management.ts`, `switch-branch.ts`, `validateQuery.ts` (REF: `src/tools/cache.ts:1`, `src/tools/session-management.ts:1`, `src/tools/switch-branch.ts:1`, `src/tools/validateQuery.ts:1`).
- Resource capability currently absent (no `server.addResource` / `registerResource` calls located with `rg` search – verified empty scan result).
- Prompts available: multiple `registerPrompt` definitions within `src/tools/prompts.ts` covering connection workflows, schema exploration, EdgeQL operations, RAG hints.
- Observability reliance: Winston logger writing to disk and optional console (`src/logger.ts:33`–`70`), plus bootstrap logger in `src/config.ts:6`–`19` emitting to stdout, violating stdio purity guidance.
- Rate limiting: `checkRateLimit` in `src/validation.ts:126`–`205` enforces per-identifier windows but uses shared in-memory store without eviction instrumentation.
- Tool response helpers now include `buildStructuredResponse` (`src/utils.ts:214`–`273`), and the connection/query/schema/docs tools emit typed `structuredContent` with `outputSchema` definitions; response contract is documented in `docs/architecture/response.md`.
- Sampling/Elicitation: no current usage (`rg "sampling"` / `rg "elicit"` returned zero matches), so advanced workflows absent.
- Streaming/Progress: no partial response mechanics aside from `execute-typescript` timeouts; no job status resources.
- Root scoping: no explicit `roots` metadata advertised; server relies on default MCP behavior.
- Token discipline: some pagination/limit logic in query tool (`src/tools/query.ts:90`–`162`) but docs tool can emit large text blocks without truncation guidance (`src/tools/docs.ts:156`–`193`).
- Security guardrails: TypeScript execution gate with `isolated-vm` fallback (`src/tools/executeTypescript.ts:12`–`200`), but unsafe fallback still callable in non-production modes with limited structured guidance.
- Build scripts emit to stdout extensively (`scripts/auto-generate-schemas.js` multiple `console.log` usages) potentially reusing within MCP runs.

## Active Work In Progress
- **Codex (2025-10-20) — Roadmap ownership kickoff**
  - [ ] Phase 0 — Baseline readiness & tracking (stabilise tests, confirm lint/format status, set up progress logging).
    - Progress (2025-10-20): `pnpm lint` and `pnpm test` both pass on current branch; Jest emits stdout from `src/config.ts:9` confirming bootstrap logger still noisy. `pnpm biome format` lacks non-writing check flag—retain `pnpm format` for enforcement.
    - Progress (2025-10-20): Stdout audit: `src/config.ts` bootstrap logger relies on `console.*`; Winston config (`src/logger.ts:1`–`91`) still adds console transport when `enableConsole` true & non-production, emitting colored logs to stdout; build scripts (`scripts/auto-generate-schemas.js`, `scripts/post-build.js`) log directly via `console` (OB-001H scope). Document alignment needed when migrating to stderr-only strategy.
  - [ ] Phase 1 — Tool taxonomy & structured IO (TD-001..TD-004, IO-002..IO-004, TK-001..TK-004, RR-001..RR-004).
    - Plan (2025-10-20):
      1. Refactor multi-action tools into discrete modules (`src/tools/connection/*.ts`, `schema/*.ts`, `query/*.ts`, docs) retaining shared helpers; introduce registry orchestrator to register new names while keeping legacy aliases behind feature flag until prompts/docs updated (TD-001..TD-004).
         - Action mapping draft:
           - Connection → `connection.auto`, `connection.get`, `connection.set`, `connection.list-instances`, `connection.list-credentials`, `connection.list-branches`, `connection.switch-branch`.
           - Schema → `schema.overview`, `schema.list-types`, `schema.describe`, `schema.refresh`.
           - Query → `query.validate`, `query.run`, `query.run-file` (rename of `file`).
           - Docs → `docs.local-search` (successor to `docs search`). Legacy aggregate `connection`, `schema`, `query`, `docs` stay available behind compatibility gate until PR-001/ DX updates ship.
         - Module layout draft:
           - `src/tools/connection/` with per-intent files (`auto.ts`, `get.ts`, etc.) exporting `{ name, definition, handler }` metadata plus shared `registerConnectionTools(server, opts)` orchestrator in `index.ts`.
           - Shared helpers (`sessionState.ts`, `response.ts`, `validation.ts`) house logic currently embedded in `connection.ts` (`applySet`, `buildConnectionStructuredResponse`, rate-limit wrapper) to avoid duplication.
           - Introduce `LEGACY_CONNECTION_TOOL_ENABLED` env/ config flag defaulting true during migration; when enabled, register old multi-action tool pointing to new handlers internally to avoid regressions during prompt rewrite window.
      2. Define shared `outputSchema` Zod objects per new tool (IO-002/003) and wire central `errorResponseFromError` translator plus rate-limit metadata (IO-004, ER linkage).
      3. Implement resource manager scaffold in `src/resources/` with in-memory store + TTL, register baseline resources, and update tools to emit `resource://` URIs when responses exceed `MAX_INLINE_TOKENS` (TK-001..TK-004, RR-001..RR-004).
      4. Validation prep: expand `src/__tests__/toolSchemas.test.ts` & add new suites verifying resource link issuance and schema compliance; plan scenario fixtures once tools split.
      5. Testing roadmap (2025-10-20):
         - Unit: add handler-level tests for each new connection intent tool (auto/get/set/list/switch) under feature-flag conditions.
         - Integration: extend scenario harness (planned in WF-001 series) to exercise intent tools alongside legacy aggregator.
         - Regression: ensure `tools/list` output snapshot includes both legacy and intent entries during transition.
    - Helper extraction targets: deduplicate `LEGACY_TO_TOOL_STATUS` mapping across tools, move `build*StructuredResponse` factories into per-domain helper modules, centralize connection session helpers (`applySet`, `getSessionState`) for reuse by new tool registrations, and ensure utils expose shared `registerConnectionTools(server)` orchestrator.
    - Progress (2025-10-20): `src/tools/connection/helpers.ts` now encapsulates rate limit guard, session state, response builder, and gel CLI helpers; legacy `connection` tool updated to consume helpers without altering behavior (tests still pass). Next step: factor switch-case branches into discrete handler exports to enable new per-intent tool registrations.
    - Progress (2025-10-20): Design & scaffolding prepared for handler extraction; implementation paused after dry-run to avoid destabilising baseline. Next iteration will reintroduce helper modules and intent-level registrations with accompanying tests once compatibility strategy is finalised.
      - Incremental plan:
        1. Introduce `connection/` helper + handler modules behind feature flag without changing registrations; land tests covering handler outputs.
        2. Register intent-level tools gated by `LEGACY_CONNECTION_TOOL_ENABLED` config; keep prompts/docs untouched until Phase 4.
        3. Once prompts updated, retire legacy aggregate and update roadmap status.
  - [ ] Phase 2 — Guided interactions (SP-001..SP-004, EL-001..EL-003, ER-001..ER-004, TS-001A..TS-001O).
  - [ ] Phase 3 — Streaming, observability, and security hardening (ST-001..ST-003, OB-001..OB-001I, RM-001..RM-003).
  - [ ] Phase 4 — Prompts, docs, workflows, QA & DX polish (PR-001A..PR-001J, WF-001A..WF-001J, DX-001A..DX-001J, QA-001A..QA-001G).
  - [ ] Phase 5 — Release validation & post-deployment checklist execution (Sections 16 & 17 tasks, backlog closure).
  - Notes: Execute phases sequentially but allow intra-phase parallelism where dependencies permit; update checkbox status per phase as milestones close, and annotate individual TASK-ID lines below upon completion.
- Recent completions:
  - **TASK-ID IO-001** — Introduced `buildStructuredResponse` wrappers and Zod-backed structured payloads for connection/query/schema/docs. *Status: DONE (Codex 2025-10-20)*
  - **TASK-ID DC-001A/001B/001O** — Docs search tool now returns structured matches with truncation metadata and `outputSchema` wiring. *Status: DONE (Codex 2025-10-20)*

## 2. Repository Map & Component Inventory
### 2.1 Source Tree Overview
- `src/app.ts` – server instantiation and tool registration harness.
- `src/index.ts` – stdio entrypoint with transport wiring.
- `src/http.ts` – optional Fastify-based HTTP transport enabling streaming responses yet lacking streaming usage internally.
- `src/tools/` – tool implementations (connection/query/schema/docs/execute-typescript/prompts + inactive cache/session/switch/validate modules).
- `src/utils.ts` – helper utilities (stringifying, connection resolution, response builder).
- `src/validation.ts` – input validation, rate limiting, sanitization.
- `src/logger.ts`, `src/config.ts` – infrastructure.
- `src/schemaWatcher.ts` – process management for gel CLI watcher.
- `src/database.ts` – client resolution, project root detection.
- `src/edgeql-js/` – generated query builders.
- `src/__tests__/` – minimal Jest coverage (`searchGelDocs.test.ts`).
- `scripts/` – automation for schema generation & build post-processing.

### 2.2 MCP Capability Summary Table
- `Tools`
  - `connection` (multi-action) – REF `src/tools/connection.ts:15`.
  - `schema` – REF `src/tools/schema.ts:14`.
  - `query` – REF `src/tools/query.ts:13`.
  - `docs` – REF `src/tools/docs.ts:9`.
  - `execute-typescript` – REF `src/tools/executeTypescript.ts:164`.
  - `cache-clear`, `cache-peek` (not registered) – REF `src/tools/cache.ts:1`.
  - `set-default-connection`, `get-default-connection` (not registered) – REF `src/tools/session-management.ts:1`.
  - `switch-branch` (not registered) – REF `src/tools/switch-branch.ts:1`.
  - `validate-query` (not registered) – REF `src/tools/validateQuery.ts:1`.
- `Prompts`
  - `bootstrap-connection` etc. – REF `src/tools/prompts.ts:7`–`404`.
- `Resources`
  - None yet exposed.
- `Roots`
  - None declared.
- `Sampling/Elicitation`
  - Not implemented.

### 2.3 External Dependencies Insight
- `@modelcontextprotocol/sdk` – server SDK for tool/prompt registration.
- `gel` – database client.
- `fastify`, `fastify-type-provider-zod` – HTTP server optional path.
- `fuse.js` – docs search index.
- `isolated-vm` – secure code execution sandbox.
- `winston` – logging infrastructure.
- `zod` – schema validation (inputs, config).
- `@biomejs/biome` – lint/format (not yet enforced programmatically).

### 2.4 Architectural Observations
- Consolidated multi-action tools favor command pattern but risk overloading (BP: design at intent level vs multi-mode).
- Response channel unified under `buildToolResponse`, which now produces machine-readable envelopes but still lacks per-tool output schemas.
- Observability reliant on file logs; no metrics exported.
- Query execution uses naive client creation; no pooling/caching beyond default.
- Schema watcher spawns child process on connection change; lacking guard against multiple watchers in quick succession.
- Code execution tool lacks resource link for logs/results, returning inline JSON strings that may bloat tokens.

## 3. Tool-Level Deep Dive (Current State vs Best Practices)
### 3.1 Connection Tool `[TD-CONN]`
#### 3.1.1 Current Behavior Snapshot
- Multi-action `connection` tool orchestrates auto detection, set/get defaults, list operations, branch switching (REF `src/tools/connection.ts:15`–`200`).
- Uses `buildToolResponse` for outputs; `structuredContent` is now present but remains untyped and undocumented to callers.
- Validates instance/branch via `validateInstanceName` / `validateBranchName` for select actions (REF `src/tools/connection.ts:116`–`138`).
- Command execution for branch listing uses `gel branch list` without pagination or error classification.
- Rate limiting via `checkRateLimit("connection")` (REF `src/tools/connection.ts:51`).
- Auto-set branch runs `setDefaultConnection` and updates schema watcher (REF `src/tools/connection.ts:56`–`65`).

#### 3.1.2 Strength Alignment
- Provides sequential follow-up hints (BP: error guidance) for missing defaults, albeit as plain text.
- Encourages deterministic workflow via textual suggestions (e.g., `@[schema action="overview"]`).
- Branch listing prunes decorative CLI output, returning simplified JSON (REF `src/tools/connection.ts:142`–`177`).

#### 3.1.3 Gap Analysis (BP references integrated)
- `BP-ToolIntent`: Multi-mode tool may confuse LLM selection; consider splitting into discrete intent-level tools (auto, set, get, list, switch) with explicit names.
- `BP-SchemaFirstIO`: Lacks `outputSchema`; should declare `structuredContent` block enumerating connection state, `isError` flag, `statusCode` classification.
- `BP-ErrorGuidance`: On invalid instance names, returns only message text (`Invalid instance name`), missing fix-forward instructions (REF `src/tools/connection.ts:131`–`135`).
- `BP-TokenDiscipline`: Branch listing default outputs entire CLI text on warn path (REF `src/tools/connection.ts:164`–`165`). Provide truncated preview + suggestion to refine filter.
- `BP-Observability`: On command errors, no `stderr` logging aside from `exec` default; should capture and log sanitized output with request IDs.
- `BP-Workflow`: Branch switching lacks optional elicitation for confirmation before destructive action (should use `server.elicitInput`).
- `BP-Roots`: Tool accepts `instance` parameter but does not advertise allowable roots; needs integration with root scoping for FS operations (credential path).
- `BP-Streaming`: Branch listing synchronous; for large instance lists, consider streaming or resource link.
- `BP-Sampling`: Auto selection does not leverage sampling to choose best default when multiple available.
- `BP-Resource`: Suggest storing connection state as resource for repeated consumption.

#### 3.1.4 Implementation Roadmap (Detailed steps enumerated, see Section 6 for backlog IDs)
- Introduce `registerConnectionTools` wrapper that registers discrete tools: `connection-auto`, `connection-get`, `connection-set`, `connection-list-instances`, `connection-list-branches`, `connection-switch-branch`, `connection-list-credentials`.
- Define shared response schema `ConnectionStateResult` with fields `defaultInstance`, `defaultBranch`, `autoSelected`, `suggestedNext`, `status`, `isError`.
- Update `buildToolResponse` replacement to produce `content` (Markdown summary), `structuredContent: ConnectionStateResult`, and optional `diagnostics` array.
- Add `RateLimit` metadata to `structuredContent` showing `remaining` counts from `getRateLimitStatus` (REF `src/validation.ts:206`–`225`).
- Implement elicitation for branch switching requiring user confirmation when branch differs from current default.
- Integrate Observability: log sanitized command invocations with `logger.info` context `connection`.
- Provide resource creation for connection dictionary accessible via `resources/list` & `resources/get` (ref Section 4). Provide `connection-state://current` resource.
- Expand error messages to include fix steps referencing other tools by name.
- Provide sampling fallback for auto-selection: if >1 instance, request host model to pick via `server.server.createMessage` with enumerated options.

#### 3.1.5 Validation Strategy
- Unit tests: Add Jest coverage verifying `structuredContent` shape for success/error cases.
- Scenario tests: Use MCP Inspector script to test chain (auto -> get -> list Instances -> set -> switch -> get) ensuring LLM sees explicit instructions.
- Rate limit test: simulate >maxRequests to confirm `isError` flagged appropriately with retry hints.
- CLI integration test: stub `gel` command to return large branch outputs, verify truncation message.
- Observability check: ensure log entries omit secrets and route to stderr.

### 3.2 Schema Tool `[TD-SCHEMA]`
#### 3.2.1 Current Behavior Snapshot
- Multi-action `schema` tool handles overview, listing, describe, refresh (REF `src/tools/schema.ts:14`–`202`).
- On success returns JSON data embedded in text; generic `structuredContent` exists but lacks schema-specific typing.
- Refresh action shells out to `npx @gel/generate`, returning raw CLI output (possible multi KB string).
- Type validation uses `validateSchemaTypeName` (REF `src/tools/schema.ts:146`–`157`).
- Suggestions included for follow-up queries.

#### 3.2.2 Strength Alignment
- Auto-limits preview via `topK` (REF `src/tools/schema.ts:114`–`125`).
- When type missing, lists sample available types (BP: guidance) albeit with plain text.
- Rate limiting and connection validation already integrated.

#### 3.2.3 Gap Analysis
- `BP-ResourceLinks`: Should return large schema introspection as resource references rather than inline JSON.
- `BP-StructuredOutput`: Provide typed objects for `types`, `overview`, `describe` results with human & machine readability.
- `BP-ErrorClasses`: Distinguish between validation vs execution errors; currently reusing `status: "error"` for all (lack `isError`, codes).
- `BP-TokenDiscipline`: Overview returns full structures without summarization/truncation metadata; risk token blow-up for large schemas.
- `BP-Streaming`: Refresh command synchronous; should return immediate `processing` state with follow-up resource (progress & logs) or streaming updates.
- `BP-Roots`: Refresh relies on file system commands; should align with root boundaries to avoid stray generation.
- `BP-Elicitation`: For refresh, confirm user intent due to destructive potential (overwriting query builders).
- `BP-Observability`: No metrics/logging for schema size, runtime, success/failure counts.

#### 3.2.4 Implementation Roadmap
- Introduce typed schema `SchemaOverviewResult`, `SchemaDescribeResult`, `SchemaRefreshResult` with `structuredContent`.
- Build summarization utility to limit property/links arrays to e.g. 20 entries, include `truncated: true` flag.
- For refresh, spawn child process asynchronously via job manager; return immediate `processing` response with resource URI (e.g., `schema-refresh://<timestamp>`). Provide `schema-refresh-status` tool for polling, and optionally stream progress lines.
- Add elicitation requiring user confirmation before `refresh` (structured form specifying instance, branch, confirm boolean).
- Use sampling to auto-summarize long describe outputs if agent requests textual gist (with validation to keep summary under 512 tokens).
- Log metrics: record `typesCount`, `durationMs`, `query` executed.

#### 3.2.5 Validation Strategy
- Extend Jest tests to ensure `structuredContent.overview.truncated` flags when expected.
- Integration test for `refresh` verifying asynchronous workflow and resource retrieval.
- Token budget tests ensuring describe outputs truncated for high-cardinality schemas.

### 3.3 Query Tool `[TD-QUERY]`
#### 3.3.1 Current Behavior Snapshot
- Multi-action `query` tool handles validate, run, file (REF `src/tools/query.ts:13`–`200`).
- Applies default `LIMIT` when absent (REF `src/tools/query.ts:90`–`162`).
- On success uses `buildToolResponse` to produce text summary + JSON in Markdown code block.
- Error handling collects suggestions but lacks structured classification.
- Accepts `limit`, `timeout`, but no `page` parameter.
- `applyTimeout` wraps query promise (REF `src/tools/query.ts:98`–`114`).

#### 3.3.2 Strength Alignment
- Provides explicit follow-up hints encouraging validation before run.
- Sanitizes args via `validateQueryArgs` (REF `src/tools/query.ts:93`–`95`).
- Rate limits enforced.

#### 3.3.3 Gap Analysis
- `BP-StructuredOutput`: Should return typed result (rows, limitApplied, executionTime) with consistent schema to make tool outputs machine-parseable.
- `BP-TokenDiscipline`: For large results, should default to truncated dataset with `resource_link` for full results.
- `BP-ErrorNextSteps`: On syntax errors, suggestions generic; need targeted hints (line/column if available).
- `BP-Observability`: No query metrics (rows returned, duration) recorded.
- `BP-Sampling`: For `validate`, can optionally sample summarization to explain query semantics.
- `BP-Workflow`: Provide separate tool for `query-file` rather than multi-action, or adopt ingestion resource pattern.
- `BP-ContextControl`: When reading file, uses `process.cwd()` ambiguous wrt roots; should enforce root boundaries.
- `BP-Streaming`: For long-running queries, should support asynchronous job with progress resource, not block.

#### 3.3.4 Implementation Roadmap
- Introduce `QueryResultSchema` validated via Zod; include `rows`, `rowCount`, `limitApplied`, `durationMs`, `columns`, `warnings`, `suggestedNext`.
- Extend `buildToolResponse` successor to accept `structuredContent` and `tokenBudget`. Provide fallback (text summary `content`) referencing resource when truncated.
- For file action, restructure as dedicated tool `query-file-run` with `roots` enforcement and optional resource link for file content preview.
- Record metrics (duration, row count) via `logger.info` and optionally aggregated counters.
- Add sampling step for `validate` to produce natural-language summary of query effects (with optional toggle).
- Provide `cursor` / `page` controls, plus plan for asynchronous streaming using server-sent events under HTTP transport.

#### 3.3.5 Validation Strategy
- Jest tests verifying `structuredContent` shape for run + validate + file actions.
- Integration tests verifying truncated outputs produce resource link hints.
- Observability tests ensuring log instrumentation triggered with sanitized queries.

### 3.4 Docs Tool `[TD-DOCS]`
#### 3.4.1 Current Behavior Snapshot
- Search `gel_llm.txt` by chunk using `fuse.js` (REF `src/tools/docs.ts:20`–`193`).
- Returns Markdown text enumerating matches with code blocks, no JSON structure.
- Accepts `context_lines`, `match_all_terms`.
- Fallback when file missing returns simple text message.

#### 3.4.2 Strength Alignment
- Caches Fuse index (BP: performance caching) with change detection by `mtime`.
- Provides top result count and indicates match range.

#### 3.4.3 Gap Analysis
- `BP-ResourceLinks`: Should deliver results as resource URIs for large contexts.
- `BP-StructuredOutput`: Provide structured array of matches (line ranges, path, snippet) enabling LLM reasoning.
- `BP-TokenDiscipline`: Currently returns up to `5` matches with full chunks; no explicit truncation metadata or guidance on narrowing search.
- `BP-Roots`: Document path resolution allows `process.cwd()` search; should respect root boundaries.
- `BP-ErrorGuidance`: Missing targeted instructions when file absent beyond search path list.
- `BP-Observability`: No logging for search queries; helpful for monitoring usage/responsiveness.
- `BP-Sampling`: Could offer optional summarization of search results using client sampling.
- `BP-Resource`: Should register docs as resource to allow `resources/get` rather than ad-hoc search.

#### 3.4.4 Implementation Roadmap
- Create `DocsSearchResult` schema with fields `matches`, `totalMatches`, `query`, `note`, `truncated`, etc.
- Return `structuredContent` plus text summary referencing `resource_link` for each chunk (custom `docs://` scheme) to avoid inline bloating.
- Add parameter `maxMatches`, `maxTokens`, default to safe values with instructions on refining search.
- Provide `docs-index` resource metadata describing available docs and last modified.
- Log search usage (query string, result count, duration) to structured logger.
- Add optional sampling step for summarizing top matches.

#### 3.4.5 Validation Strategy
- Unit tests verifying search results truncated when `maxMatches` low.
- E2E tests ensuring missing doc returns `isError` with fix instructions (create file / configure path).

### 3.5 Execute TypeScript Tool `[TD-TS]`
#### 3.5.1 Current Behavior Snapshot
- Executes user-supplied TypeScript in `isolated-vm` or unsafe fallback (REF `src/tools/executeTypescript.ts:12`–`200`).
- Returns plain text lines summarizing success and JSON stringified result.
- Rate limit flagged as `execute` type.
- Logging behavior uses Winston logger to record console outputs.
- Timeout/memory limit sourced from config.

#### 3.5.2 Strength Alignment
- Security guardrails: blocked patterns, `isolated-vm`, fallback disabled in production via environment check.
- Provides hints for best practices in description `title`.

#### 3.5.3 Gap Analysis
- `BP-StructuredOutput`: Should return typed response containing `result`, `logs`, `executionMethod`, `timeoutMs`, `memoryLimitMB`, `durationMs`.
- `BP-ErrorGuidance`: On failure returns minimal message; should include fix hints (blocked pattern, fallback disabled, etc.) in structured error.
- `BP-ResourceLinks`: When logs lengthy, supply resource link `ts-exec-log://` instead of inline string.
- `BP-Elicitation`: For code execution, consider elicitation requiring user confirmation if `use_gel_client` true or code length high.
- `BP-Sampling`: Could integrate sampling to review/critique code before running (safety check).
- `BP-TokenDiscipline`: `safeJsonStringify` output may exceed 20k limit; need truncation metadata and user guidance to fetch rest.
- `BP-Observability`: Should record job metrics; unify with global instrumentation.

#### 3.5.4 Implementation Roadmap
- Build typed schema `ExecuteTypescriptResult` and `ExecuteTypescriptError`, integrate with new response builder.
- Add `structuredContent` plus optional `resource_link` for logs; include `truncated` flag.
- Introduce optional preflight sampling prompt to check for hazards (with user opt-in).
- Add elicitation flow for high-risk operations (requests writing to FS? glimpsed via static analysis).
- Update config to allow customizing allowed modules/resourcelinks via environment.
- Expand tests to cover both isolated + fallback paths, verifying error classification.

#### 3.5.5 Validation Strategy
- Unit tests verifying `structuredContent` shape, truncated logs scenario.
- Security tests to ensure blocked pattern detection returns `isError` with guidance.
- Observability tests verifying log entries sanitized.

### 3.6 Prompts `[TD-PROMPTS]`
#### 3.6.1 Current Behavior Snapshot
- Multiple prompts defined for workflows (`bootstrap-connection`, `schema-exploration`, `quickstart`, etc.) referencing tool call syntax (REF `src/tools/prompts.ts:7`–`404`).
- No explicit metadata linking prompts to resources; rely on manual list retrieval.
- No `prompts/list_changed` notifications emitted (SDK handles automatically when register invoked at startup; dynamic updates not supported).

#### 3.6.2 Strength Alignment
- Prompts encourage deterministic tool usage, referencing `@[tool action="..."]` syntax (good for LLM guidance).
- Provide context for RAG usage (Context7).

#### 3.6.3 Gap Analysis
- `BP-PromptCatalog`: Should document prompts as resources with usage examples, version metadata, change log.
- `BP-ParameterSchemas`: Some prompts lack `argsSchema` (e.g., `schema-exploration` uses empty object). Consider enabling optional parameters (strict?).
- `BP-TokenDiscipline`: prompts are moderately sized but ensure they remain minimal; consider referencing resources rather than inline long lists.
- `BP-Observability`: No telemetry for prompt usage frequency.
- `BP-Workflow`: Should ensure prompts kept consistent with updated tool names once we split multi-action tools.

#### 3.6.4 Implementation Roadmap
- Create `prompts/catalog.json` resource summarizing each prompt, parameters, version.
- Introduce prompt alias mapping for new tool names; update content accordingly.
- Provide tests verifying prompt formatting stays within token budgets (approx <200 tokens each).
- Add instrumentation to log prompt invocations (maybe hooking server events if available in SDK or manual logging when `registerPrompt` executed).

#### 3.6.5 Validation Strategy
- Snapshot tests for prompt message content to detect regressions.
- Integration tests verifying `prompts/list` output includes new metadata.

### 3.7 Dormant Tools `[TD-DORMANT]`
- `cache-clear`, `cache-peek` (REF `src/tools/cache.ts:1`–`55`) currently unused; plan to reintegrate as maintenance tools with structured output.
- `session-management` (REF `src/tools/session-management.ts:1`–`47`) duplicates functionality of `connection` tool; need to reconcile or remove.
- `switch-branch` old variant still present; after splitting `connection` actions, decide to reuse or delete.
- `validate-query` duplicates `query validate`; prefer integrated approach with structured outputs; consider migrating tests referencing this tool.
- Document decision matrix in Section 5 backlog.

## 4. Capability Pillar Analysis & Gap Catalog
### 4.1 Tool Design & Naming `[BP-ToolDesign]`
- `Observation`: Multi-action pattern across key tools (connection, schema, query) conflicts with best practice of intent-level tools (BP excerpt: "Design tools at the intent level, not raw API calls").
- `Current Implementation`: Tools differentiate behavior via `action` parameter; no autop-run for each variant; tool names generic.
- `Gaps`:
  - `G1`: Model must reason about `action` enumerations, increasing misuse risk.
  - `G2`: Descriptions mention actions but not explicit when to avoid using them simultaneously.
  - `G3`: Lack of `when_not_to_use` guidance, recommended by best practice.
- `Plan`:
  - `TASK-ID TD-001`: Design new tool namespace `connection.set`, `connection.get`, etc., each with targeted description referencing preconditions.
  - `TASK-ID TD-002`: Provide unique names for docs search vs future external docs (e.g., rename to `docs.local-search`).
  - `TASK-ID TD-003`: Create consistent title/description templates: `Title: Verb Object (Outcome)`, `Description: When to use / When not to use / Required preconditions / Example call`.
  - `TASK-ID TD-004`: Document mapping from old to new tool names in README plus prompts.
- `Validation`:
  - `TEST TD-TOOL-01`: Use MCP Inspector to confirm new tools appear with zero `action` parameter.
  - `TEST TD-TOOL-02`: Write regression tests verifying `tools/list` output includes `when_not_to_use` strings.

### 4.2 Input/Output Schemas & Validation `[BP-SchemaFirstIO]`
- `Observation`: Connection, query, schema, and docs tools now rely on `buildStructuredResponse`, emit typed `structuredContent`, and declare `outputSchema`; secondary utilities (`execute-typescript`, cache/session helpers) remain on legacy text-only helpers.
- `Current Implementation`: Structured responses cover the primary tool workflow; remaining modules still pass only `inputSchema` objects and free-form text.
- `Gaps`:
  - `G4`: Extend typed wrappers and `outputSchema` coverage to the remaining tools so the SDK enforces response shapes everywhere.
  - `G5`: Provide discriminated unions (`status`, `errorCode`) plus structured diagnostics for secondary tools to avoid emoji-parsing fallbacks.
- `Plan`:
  - `TASK-ID IO-001`: Introduce typed wrappers (e.g., `buildStructuredResponse`) per tool that call `composeToolPayload` with Zod-backed data, ensuring both text summary and structured content align. *(Status: DONE — Codex 2025-10-20)*
  - `TASK-ID IO-002`: For each tool, define `outputSchema` using Zod, capturing success + error union (with discriminant `status`). *(Connection/query/schema/docs complete; remaining tools pending.)*
  - `TASK-ID IO-003`: Update handlers to return `structuredContent` abiding by schema; include `isError` flag and `errorCode` enumerations. *(Partially complete for updated tools.)*
  - `TASK-ID IO-004`: Add central error type translation mapping `ValidationError`, `RateLimitError`, etc., to tool-friendly responses.
- `Validation`:
  - `TEST IO-TOOL-01`: Add unit tests verifying `structuredContent` matches schema; runtime parsing coverage added in `toolSchemas.test.ts`.
  - `TEST IO-TOOL-02`: Run integration to ensure SDK no longer throws on mismatched outputs.

- `Observation`: Query responses still embed JSON stringified results inside Markdown code blocks; docs search now annotates truncated excerpts but remains inline.
- `Current Implementation`: `formatJsonForOutput` truncates to `maxLength=20000` characters, and docs search enforces a 600-character snippet limit without surfacing `resource_link` alternatives.
- `Gaps`:
  - `G6`: Inline 20k char block consumes context drastically; best practice suggests returning resource links + note on how to fetch more data.
  - `G7`: Tools seldom mention `limit` or `filter` parameters as part of structured output to guide refinement.
- `Plan`:
  - `TASK-ID TK-001`: Implement resource generation for large outputs (persist to ephemeral in-memory store or file) with `uri` referencing `resource_link` content.
  - `TASK-ID TK-002`: Extend `structuredContent` with `truncated: boolean`, `nextSteps: string[]` recommending narrower queries.
  - `TASK-ID TK-003`: Add global `MAX_INLINE_TOKENS` constant (approx 2048 tokens) to enforce consistent truncation.
  - `TASK-ID TK-004`: Document recommended usage in prompts; instruct LLM to fetch resource when `truncated` true.
- `Validation`:
  - `TEST TK-TOKEN-01`: Generate big dataset to confirm resource link path triggered.
  - `TEST TK-TOKEN-02`: Verified instructions present in text summary referencing `@docs` or `@query` with narrower filters.

### 4.4 Resources & Roots `[BP-ResourceRoot]`
- `Observation`: Server currently exposes no resources; root boundaries not specified.
- `Gaps`:
  - `G8`: Without resources, repeated context retrieval duplicates tokens.
  - `G9`: Tools referencing FS (docs, schema refresh) operate without root scoping, raising risk.
- `Plan`:
  - `TASK-ID RR-001`: Register resources for `gel_llm.txt`, connection state, schema snapshots, schema refresh logs, TypeScript execution outputs.
  - `TASK-ID RR-002`: Implement resource providers in `src/resources/` module returning data on demand (with caching, safe redaction).
  - `TASK-ID RR-003`: Advertise root boundaries via server initialization (MCP handshake) so clients know accessible FS subtrees (e.g., `docs`, `src/edgeql-js`, `instance_credentials`).
  - `TASK-ID RR-004`: Update tools to reference resource URIs rather than raw file paths.
- `Validation`:
  - `TEST RR-RES-01`: Use `resources/list` to confirm registration and metadata (size, lastModified).
  - `TEST RR-ROOT-01`: Attempt to access file outside root; expect rejection.

### 4.5 Sampling Workflows `[BP-Sampling]`
- `Observation`: No sampling usage.
- `Gaps`:
  - `G10`: Missed opportunities for AI judgment tasks (e.g., picking best instance, summarizing query results, generating explanation).
- `Plan`:
  - `TASK-ID SP-001`: Add sampling helper to `src/sampling.ts` to standardize requests with schema validation (max tokens, temperature).
  - `TASK-ID SP-002`: Integrate sampling into `query.validate` for optional NL summary, `schema.overview` for summarizing high-level schema, `execute-typescript` for risk preflight.
  - `TASK-ID SP-003`: Provide `sampling` config (model preference, budgets) in `config` file.
  - `TASK-ID SP-004`: Implement failure handling (retry once, escalate error with fix guidance).
- `Validation`:
  - `TEST SP-SAMPLE-01`: Mock sampling response to ensure structured handling and fallback.
  - `TEST SP-SAMPLE-02`: Confirm user approval request flows in clients triggered appropriately.

### 4.6 Elicitation & Structured Confirmations `[BP-Elicitation]`
- `Observation`: No usage of `server.server.elicitInput`.
- `Gaps`:
  - `G11`: Destructive actions (branch switch, schema refresh, TypeScript exec) lack explicit confirmation forms.
  - `G12`: Tools do not gather missing parameters via structured forms (e.g., query lacks ability to prompt for `args`).
- `Plan`:
  - `TASK-ID EL-001`: Add elicitation to `connection.switch-branch` to confirm branch names and optionally new `set-default` operations.
  - `TASK-ID EL-002`: Add dynamic forms for query tool when parameters missing (ask for `args` object with proper schema).
  - `TASK-ID EL-003`: Provide global `ElicitationManager` to standardize forms and ensure user approved data stored sanitized.
- `Validation`:
  - `TEST EL-ELICIT-01`: Use integration tests verifying tool returns `action: "elicit"` when data missing/dangerous.

### 4.7 Error Handling & Recovery `[BP-Error]`
- `Observation`: Tools rely on textual error message with emoji markers.
- `Gaps`:
  - `G13`: No differentiation between validation/transport/application errors.
  - `G14`: No `retryAfter` metadata for rate limit errors (even though `RateLimitError` includes `retryAfter` but not surfaced via `buildToolResponse`).
  - `G15`: Error messaging not referencing remedial tool usage consistently.
- `Plan`:
  - `TASK-ID ER-001`: Build `errorResponseFromError` helper mapping custom errors to structured output (with `category`, `code`, `retryAfter`, `fixes`).
  - `TASK-ID ER-002`: Update tools to catch errors and utilize new helper; ensure `isError` true and provide `fixSteps` array referencing other tools.
  - `TASK-ID ER-003`: Provide default fallback for unknown errors that instructs to run diagnostics or fetch logs.
  - `TASK-ID ER-004`: Ensure `stderr` logging sanitized for errors (absorb sensitive data).
- `Validation`:
  - `TEST ER-ERR-01`: Unit tests verifying error translation for each custom error.
  - `TEST ER-ERR-02`: Integration tests verifying LLM receives actionable fix steps.

### 4.8 Streaming & Progress UX `[BP-Streaming]`
- `Observation`: HTTP transport available but tools return synchronous responses only.
- `Gaps`:
  - `G16`: No streaming for long jobs (schema refresh, query run, TypeScript exec) despite best practice suggestions.
- `Plan`:
  - `TASK-ID ST-001`: Implement job manager storing progress updates accessible via streaming resource (Server-Sent Events) when HTTP transport in use.
  - `TASK-ID ST-002`: For stdio, emulate streaming by returning `status: processing` with instructions and follow-up tool to poll status.
  - `TASK-ID ST-003`: Provide `job-status` tool returning current progress (structured).
- `Validation`:
  - `TEST ST-STR-01`: Simulate long job verifying `processing` status and eventual completion message with resource link.

### 4.9 Observability & Metrics `[BP-Observability]`
- `Observation`: Logging to file & optional console; no metrics or request IDs.
- `Gaps`:
  - `G17`: `config` bootstrap logger uses `console.log`, polluting stdio (REF `src/config.ts:7`–`19`).
  - `G18`: No correlation IDs or request context to trace tool calls.
  - `G19`: No metrics for per-tool latency/error counts.
- `Plan`:
  - `TASK-ID OB-001`: Replace bootstrap logger with Winston child writing to stderr only; ensure stdio JSON unaffected.
  - `TASK-ID OB-002`: Introduce middleware hooking into server to add request ID (maybe use `server.on('toolCall', ...)` if SDK supports, else wrap each tool to log start/stop).
  - `TASK-ID OB-003`: Emit structured logs with fields `tool`, `action`, `durationMs`, `status`, `rowsReturned`, `instance`, sanitized args.
  - `TASK-ID OB-004`: Add optional metrics exporter (Prometheus text or StatsD) gating via config.
- `Validation`:
  - `TEST OB-LOG-01`: Run server verifying no stdout contamination.
  - `TEST OB-MET-01`: Confirm metrics aggregator receives increments.

### 4.10 Workflow Patterns & Scenario Testing `[BP-Workflow]`
- `Observation`: Minimal tests; no scenario harness verifying multi-step flows.
- `Gaps`:
  - `G20`: Without scenario tests, hard to ensure LLM-friendly pattern outcomes.
  - `G21`: Prompts & tools not co-validated to ensure instructions align with new names.
- `Plan`:
  - `TASK-ID WF-001`: Build scenario test suite (maybe using MCP inspector or custom harness) to simulate flows: connection bootstrap, schema describe, query run, doc fetch, type script exec.
  - `TASK-ID WF-002`: Document recommended workflow blueprint for LLM (Search → Disambiguate → Act), integrate into prompts and README.
  - `TASK-ID WF-003`: Provide recorded transcripts for expected agent behavior to help future testing.
- `Validation`:
  - `TEST WF-SCENE-01`: Automated scenario tests run in CI verifying success of canonical flows.

### 4.11 Performance & Ops `[BP-Performance]`
- `Observation`: Query results not cached; rate limit store in memory; watchers re-spawn per connection change; TypeScript exec lacks caching.
- `Gaps`:
  - `G22`: Cache invalidation triggered only on connection change; should expire automatically.
  - `G23`: Schema watcher may spawn multiple processes if user toggles connections quickly.
  - `G24`: Auto schema generation script prints to stdout -> noise for MCP.
- `Plan`:
  - `TASK-ID PF-001`: Enhance caching (LRU with TTL) for schema introspection results; integrate metrics.
  - `TASK-ID PF-002`: Debounce schema watcher updates; add guard to avoid respawn storms.
  - `TASK-ID PF-003`: Update automation scripts to log via `stderr` or file when executed in MCP context; optionally disable auto-run when in server mode.
  - `TASK-ID PF-004`: Provide config toggles for watchers and caching.
- `Validation`:
  - `TEST PF-CACHE-01`: Simulate repeated schema calls verifying cache hit counts via instrumentation.
  - `TEST PF-WATCH-01`: Stress test connection toggling ensuring single watcher active.

### 4.12 Security Considerations `[BP-Security]`
- `Observation`: Some patterns exist (blocked TypeScript code, rate limiting) but more needed.
- `Gaps`:
  - `G25`: Lack of secrets redaction when returning errors.
  - `G26`: Query tool may allow destructive commands; should enforce restrictions or require explicit confirmation.
  - `G27`: Logging may capture sensitive args.
- `Plan`:
  - `TASK-ID SE-001`: Add query classification to detect DML; require elicitation for certain operations.
  - `TASK-ID SE-002`: Redact secrets via sanitizer before logging/structured output.
  - `TASK-ID SE-003`: Add config-driven allow/block lists for TypeScript modules and queries.

## 5. Transformation Backlog & Work Breakdown Structure
### 5.1 Phase 0 – Foundations & Infrastructure Hardening
- TASK-ID INF-0001: Audit `buildToolResponse` call graph via static analysis to map every tool invocation (REF `src/tools/index.ts:9`).
- TASK-ID INF-0002: Design replacement helper `composeToolPayload` returning `{ content, structuredContent, isError }` signature; document interface in `docs/architecture/response.md`. *(Status: DONE — Codex 2025-10-20)*
  - Progress (2025-01-20): Implemented `composeToolPayload` with metadata-aware summaries and optional resource links (`src/utils.ts:116`–`198`) and published the response contract in `docs/architecture/response.md`.
- TASK-ID INF-0003: Update `src/utils.ts` to export new helper, ensure old function flagged deprecated with console warning suppressed (avoid stdout) (REF `src/utils.ts:204`–`273`). *(Status: DONE — Codex 2025-10-20)*
  - Progress (2025-01-20): Helper exported, `buildToolResponse` marked `@deprecated`, and no stdout logging introduced; remaining follow-up tracked under migration tasks.
- TASK-ID INF-0004: Create `src/types/mcp.ts` containing shared Zod schemas and TypeScript interfaces for response payloads. *(Status: DONE — Codex 2025-10-20)*
  - Progress (2025-01-20): Established common response envelope schemas and TypeScript types in `src/types/mcp.ts` for downstream tool adoption.
- TASK-ID INF-0005: Build automated codemod (using `tsx` script) to replace `buildToolResponse` usage in each tool with new helper, scaffolding placeholders for `structuredContent`.
- TASK-ID INF-0006: Configure Biome rules to forbid direct string responses – custom lint rule `no-raw-mcp-text` pointing to new helper usage.
- TASK-ID INF-0007: Introduce `RequestContext` object capturing `requestId`, `toolName`, `startTime`, `instance`, `branch`; propagate via tool registration wrappers.
- TASK-ID INF-0008: Replace bootstrap logger in `src/config.ts:7` with sanitized Winston child writing to stderr; ensure no `console.log` remains.
- TASK-ID INF-0009: Create `docs/observability.md` explaining logging strategy, log field definitions, and rotation.
- TASK-ID INF-0010: Add `pnpm run lint:ci` script enforcing new lint rule; integrate into CI (update `.github/workflows`).
- TASK-ID INF-0011: Document environment variables for metrics export (e.g., `GEL_MCP_METRICS_PORT`).
- TASK-ID INF-0012: Evaluate `@modelcontextprotocol/sdk` extension points to attach global middleware; plan for instrumentation.

### 5.2 Phase 1 – Tool Decomposition & Schema Alignment
- TASK-ID TD-0101: Split `connection` tool into discrete modules (`connection/auto.ts`, `connection/get.ts`, ...) each exporting registration function.
- TASK-ID TD-0102: Update `registerAllTools` to call new modules; maintain backwards compatibility by keeping existing tool name as shim that delegates and emits deprecation warning (structured).
- TASK-ID TD-0103: Introduce Zod `ConnectionStateSchema` with fields: `defaultInstance`, `defaultBranch`, `autoSelected`, `availableInstances`, `rateLimit`, `suggestedNext`, `notes`.
- TASK-ID TD-0104: Implement `outputSchema` in each connection tool referencing `ConnectionStateSchema` or specialized variant.
- TASK-ID TD-0105: Ensure error paths produce `structuredContent` with `isError: true`, `errorCode` (e.g., `NO_DEFAULT_CONNECTION`, `INVALID_INSTANCE_NAME`).
- TASK-ID TD-0106: Add `connection/list-instances` support for pagination, `filter`, `limit` parameters with defaults to minimize tokens.
- TASK-ID TD-0107: Implement elicitation for branch switching: present JSON schema requiring confirmation boolean plus optional reason.
- TASK-ID TD-0108: Log branch switch operations with request ID, sanitized args; update watchers accordingly.
- TASK-ID TD-0109: Update prompts referencing old tool names to new ones, maintain fallback guidance for transitional period.
- TASK-ID TD-0110: Create scenario test verifying new connection workflow performs sequence without errors.
- TASK-ID TD-0111: Update README instructions to highlight new tool names.
- TASK-ID TD-0112: Provide migration snippet for host prompts referencing old `connection` tool.

### 5.3 Phase 2 – Resource Infrastructure & Token Discipline
- TASK-ID RS-0201: Implement `src/resources/index.ts` exporting `registerAllResources(server)`. Include typed resource descriptors.
- TASK-ID RS-0202: Register `gel-llm-doc` resource mapping to `gel_llm.txt`; ensure path resolved relative to allowed roots.
- TASK-ID RS-0203: Register `connection-state` resource returning latest connection defaults in JSON.
- TASK-ID RS-0204: Register `schema-overview/<instance>/<branch>` resource storing cached schema (pull from new caching layer).
- TASK-ID RS-0205: Register `query-result/<requestId>` resource storing truncated results beyond inline threshold.
- TASK-ID RS-0206: Register `ts-exec/<requestId>/logs` resource capturing console output and sanitized logs.
- TASK-ID RS-0207: Implement resource caching with TTL, memory usage guard, eviction instrumentation.
- TASK-ID RS-0208: Update docs tool to return `resource_link` entries referencing new resource URIs for each match snippet.
- TASK-ID RS-0209: Introduce root registration: e.g., `server.setRequestHandler('roots/list', () => [...])` or equivalent; document root mapping in handshake metadata.
- TASK-ID RS-0210: Add tests verifying `resources/list` returns expected entries with metadata (`mimeType`, `size`, `lastModified`).

### 5.4 Phase 3 – Sampling & Elicitation Enrichment
- TASK-ID SP-0301: Develop `src/sampling.ts` wrapper providing `requestSampling({ purpose, messages, schema })` with built-in error handling.
- TASK-ID SP-0302: Add config section `sampling` controlling default model, temperature, maxTokens, budgets.
- TASK-ID SP-0303: Integrate sampling into `query.validate` to produce optional NL summary flagged as `structuredContent.summary`.
- TASK-ID SP-0304: Integrate sampling into `schema.overview` to produce human-readable digest of schema modules (capped tokens).
- TASK-ID SP-0305: Provide sampling stage for `execute-typescript` to review code for risky patterns; if flagged, require explicit user confirmation.
- TASK-ID SP-0306: Create jest mocks for sampling responses to ensure deterministic tests; add network guard to prevent real calls in CI.
- TASK-ID SP-0307: Document new sampling capabilities with caution about user approval flows.

### 5.5 Phase 4 – Error Handling & Structured Diagnostics
- TASK-ID ER-0401: Build `errorNormalizer(error, context)` returning typed object with fields `category`, `code`, `message`, `fixSteps`, `retryAfter`, `logRef`.
- TASK-ID ER-0402: Update each tool to catch unknown errors and call `errorNormalizer` before returning response.
- TASK-ID ER-0403: Ensure `RateLimitError` surfaces `retryAfter` and instructs to wait/backoff; include `structuredContent.hints` for queueing tasks.
- TASK-ID ER-0404: Add `error-handling` documentation with examples of helpful vs unhelpful messages referencing best-practice figure.
- TASK-ID ER-0405: Add automated tests comparing error output snapshot to ensure fix steps present.

### 5.6 Phase 5 – Streaming & Async Job Management
- TASK-ID ST-0501: Create `JobManager` class storing job states in-memory with TTL; expose `createJob`, `updateJob`, `completeJob`.
- TASK-ID ST-0502: Modify `schema.refresh` to create job; return immediate response with `status: processing` and resource link `job-status://<id>`.
- TASK-ID ST-0503: Provide `job-status` tool retrieving updates; support `subscribe` for HTTP streaming (Server Sent Events) when transport allows.
- TASK-ID ST-0504: Integrate `query.run` for large queries to optionally run async (flag `async: true`).
- TASK-ID ST-0505: Ensure TypeScript execution returns job when runtime expected > threshold.
- TASK-ID ST-0506: Write integration tests verifying job lifecycle (create → poll → complete) with both stdio and HTTP transports.
- TASK-ID ST-0507: Document streaming usage for clients (inspector, CLI) in README.

### 5.7 Phase 6 – Observability & Metrics Instrumentation
- TASK-ID OB-0601: Introduce `Instrumentation` module capturing metrics (per-tool counters, durations) using `prom-client` or custom aggregator.
- TASK-ID OB-0602: Update each tool to record metrics on start/end; include outcome tags.
- TASK-ID OB-0603: Add `metrics` resource accessible via HTTP (Prometheus text) when enabled.
- TASK-ID OB-0604: Provide `LOG_LEVEL` config validation ensuring console logging optional and safe for stdio.
- TASK-ID OB-0605: Add request ID injection for every tool response (structured + human text) to correlate with logs/res.
- TASK-ID OB-0606: Write docs describing log schema and metrics names.
- TASK-ID OB-0607: Ensure logs redact secrets using sanitizer function applied to args.

### 5.8 Phase 7 – Workflow Playbooks & Testing Automation
- TASK-ID WF-0701: Create `scripts/scenarios/run-scenarios.ts` autop-run using MCP Inspector to execute canonical flows.
- TASK-ID WF-0702: Write scenario definitions for: (1) connect & describe type, (2) validate & run query, (3) docs search & follow-up, (4) TypeScript exec with preflight.
- TASK-ID WF-0703: Add CI job executing scenario suite; fails on mismatch vs golden transcripts.
- TASK-ID WF-0704: Generate documentation `docs/workflows.md` summarizing recommended agent behavior (Search → Disambiguate → Act) with updated tool names.
- TASK-ID WF-0705: Provide prompt updates aligning with new tools/prompts/res flows; include usage examples referencing new resource URIs.
- TASK-ID WF-0706: Add training dataset (structured) capturing before/after transcripts to guide host prompts.

### 5.9 Phase 8 – Security Enhancements
- TASK-ID SE-0801: Implement query classification to detect DML (INSERT/UPDATE/DELETE); require elicitation confirmation (structured) before executing.
- TASK-ID SE-0802: Add config toggles to disable destructive operations entirely in certain environments.
- TASK-ID SE-0803: Redact sensitive values (credentials, tokens) from logs and responses (use regex-based sanitizer).
- TASK-ID SE-0804: Expand TypeScript blocked pattern list to include `fetch`/`axios` (if not allowed) and dynamic imports; make configurable.
- TASK-ID SE-0805: Document security posture referencing best-practice taxonomy (threats, mitigations, residual risk).
- TASK-ID SE-0806: Add security-specific tests verifying sanitization, blocked ops, and fallback path.

### 5.10 Phase 9 – Documentation & Developer Experience
- TASK-ID DX-0901: Document new tool/prompt/resource catalogue in README and dedicated docs folder.
- TASK-ID DX-0902: Provide quick reference cheat-sheet for LLM hosts (tool names, input schema, sample output) referencing `structuredContent` fields.
- TASK-ID DX-0903: Record `CHANGELOG.md` capturing transformation milestones.
- TASK-ID DX-0904: Add ADR (Architecture Decision Record) summarizing shift to structured responses and resource strategy.
- TASK-ID DX-0905: Build `docs/api-examples.md` demonstrating JSON-RPC requests/responses with new schema.
- TASK-ID DX-0906: Update tests documentation to instruct running scenario + unit tests.
- TASK-ID DX-0907: Provide script to regenerate docs/prompt indexes after updates.

### 5.11 Phase 10 – Quality Gates & CI Enhancements
- TASK-ID QA-1001: Add CI step running Jest unit + scenario tests + lint.
- TASK-ID QA-1002: Introduce coverage threshold for new tests (target 80% for critical modules).
- TASK-ID QA-1003: Configure Danger.js or similar to warn when tool output schema changed without docs update.
- TASK-ID QA-1004: Implement commit lint enforce conventional commits referencing modules (per repo guideline).
- TASK-ID QA-1005: Add static analysis to ensure resource URIs unique.
- TASK-ID QA-1006: Integrate `pnpm fmt` & `pnpm lint` to run before push.
- TASK-ID QA-1007: Provide local pre-commit hooks to auto-run key checks.

### 5.12 Phase 11 – Post-Implementation Validation & Feedback Loop
- TASK-ID PV-1101: Conduct internal dry-run with MCP Inspector verifying LLM sees new tool descriptions & uses them correctly.
- TASK-ID PV-1102: Gather feedback from target agent (LLM) transcripts to refine descriptions/structured outputs.
- TASK-ID PV-1103: Monitor metrics for first week (tool usage counts, error rates) to detect regressions.
- TASK-ID PV-1104: Iterate prompts/resources based on telemetry (update  iterate to align with actual usage).
- TASK-ID PV-1105: Document lessons learned; update backlog for future improvements (e.g., GraphQL support?).

## 6. Detailed Task Ledger (Expanded)
### 6.1 Tool Design Tasks
- TASK-ID TD-001A: Draft specification for new connection toolset; include samples for each verb.
- TASK-ID TD-001B: Run time estimate for refactor; identify potential breaking changes for clients.
- TASK-ID TD-001C: Implement `connection.auto` returning deterministic selection logic and `structuredContent.autoSelectionReason` field.
- TASK-ID TD-001D: Build `connection.get` to surface current defaults plus `availableInstancesPreview` limited to first 3 entries.
- TASK-ID TD-001E: Implement `connection.set` requiring `instance` and optional `branch`; integrate elicitation when branch uncertain.
- TASK-ID TD-001F: Implement `connection.listInstances` with pagination (params `skip`, `top` default 20) and filter.
- TASK-ID TD-001G: Implement `connection.listBranches` capturing CLI output, parse into typed array with `current` boolean, `lastUpdated` timestamp.
- TASK-ID TD-001H: Implement `connection.switchBranch` to update defaults and optionally update watchers; return `structuredContent` showing pre/post states.
- TASK-ID TD-001I: Provide fallback shim for legacy `connection` tool that delegates to new endpoints, returning deprecation notice.
- TASK-ID TD-001J: Update prompts referencing `@[connection action="..."]` to new style `@[connection.listBranches instance=""]` etc.
- TASK-ID TD-001K: Add type definitions for connection responses in `src/types/connection.ts` with JSDoc comments.
- TASK-ID TD-001L: Add dedicated unit tests verifying each new tool returns expected `structuredContent`.
- TASK-ID TD-001M: Document `when_not_to_use` for each tool (e.g., `connection.auto` not to be used when explicit user selection provided).
- TASK-ID TD-001N: Provide follow-up suggestions array with prioritized recommended next steps (list from instructions).
- TASK-ID TD-001O: Validate root enforcement ensures branch list only reads allowed directories.
- TASK-ID TD-001P: Evaluate concurrency issues (multiple connections set concurrently) and plan for session management redesign if necessary.
- TASK-ID TD-001Q: Ensure rate limiting still works after splitting tools (unique identifier per tool?).
- TASK-ID TD-001R: Update scenario tests to use new tool names.
- TASK-ID TD-001S: Communicate deprecation timeline in README.
- TASK-ID TD-001T: Remove legacy code once hosts updated.

### 6.2 Schema Tool Tasks
- TASK-ID SC-001A: Define `SchemaOverviewSchema` (object with `types`, `truncated`, `totalTypes`, `preview`, `nextActions`).
- TASK-ID SC-001B: Define `SchemaDescribeSchema` (object with `typeName`, `properties`, `links`, `truncated`, `sampleQueries`).
- TASK-ID SC-001C: Define `SchemaRefreshSchema` (object with `jobId`, `status`, `resourceUri`, `durationEstimate`).
- TASK-ID SC-001D: Wrap queries with timing measurement to populate `durationMs` in response.
- TASK-ID SC-001E: Implement summarization to limit property counts; include `truncatedProperties` count.
- TASK-ID SC-001F: Provide `resource_link` for full describe results stored in resource store; instruct to fetch when needed.
- TASK-ID SC-001G: Add `schema.describe` ability to filter by property prefix to reduce result size.
- TASK-ID SC-001H: Add caching for list of types; invalidate on schema refresh or TTL expiration.
- TASK-ID SC-001I: Implement asynchronous schema refresh job with job manager integration.
- TASK-ID SC-001J: Add elicitation requiring user to confirm before generating new builder (with reason field).
- TASK-ID SC-001K: Introduce sampling to create textual summary of describe output (top fields, relationships).
- TASK-ID SC-001L: Add tests verifying truncated describe includes `truncated = true` when property count > threshold.
- TASK-ID SC-001M: Document new usage patterns in README & prompts.
- TASK-ID SC-001N: Provide metrics capturing schema queries (counts, durations) for observability.
- TASK-ID SC-001O: Add scenario test for refreshing schema (simulate CLI success/failure) ensuring structured job flow.
- TASK-ID SC-001P: Ensure CLI invocation sanitized; optionally provide config to override command path.
- TASK-ID SC-001Q: Manage CLI stdout/stderr capturing to avoid token blow-up.
- TASK-ID SC-001R: Provide fallback if CLI missing (structured error instructing to install `@gel/generate`).
- TASK-ID SC-001S: Update caching invalidation to respond to connection change events.
- TASK-ID SC-001T: Mirror new tool names in prompts and resources.

### 6.3 Query Tool Tasks
- TASK-ID QY-001A: Define `QueryRunSchema` with fields `rows`, `rowCount`, `limitApplied`, `durationMs`, `truncated`, `resourceUri`, `hints`.
- TASK-ID QY-001B: Define `QueryValidateSchema` with fields `valid`, `summary`, `actions`, `durationMs`.
- TASK-ID QY-001C: Add `cursor`/`page` parameters to `query.run` to support pagination.
- TASK-ID QY-001D: Introduce `maxRowsInline` constant controlling inline row count (default 50).
- TASK-ID QY-001E: For large results, stream to resource store, return `resource_link` with instructions to fetch the rest.
- TASK-ID QY-001F: Provide `explain` option to request sampling-based explanation of query semantics (structured summary, potential risks).
- TASK-ID QY-001G: Implement `query.plan` to fetch query plan from database (if supported) for diagnostics.
- TASK-ID QY-001H: Add elicitation when query contains parameter placeholders but no args provided; form collects missing args.
- TASK-ID QY-001I: Detect DML operations; require confirmation or restrict per config.
- TASK-ID QY-001J: Capture metrics (duration, row count) and log sanitized query text (maybe hashed).
- TASK-ID QY-001K: Add tests verifying truncation & resource link behavior.
- TASK-ID QY-001L: Document new parameters and result structure.
- TASK-ID QY-001M: Provide scenario test for file-based queries ensuring root restrictions enforced.
- TASK-ID QY-001N: Evaluate interplay with sampling summary to ensure token budgets safe.
- TASK-ID QY-001O: Add `structuredContent.nextSteps` recommending follow-up (e.g., search docs, refine filter).
- TASK-ID QY-001P: Provide fallback for query timeouts instructing to use `limit` or `filter`.
- TASK-ID QY-001Q: Add optional asynchronous execution path for long queries (tie into job manager).
- TASK-ID QY-001R: Integrate with caching to reuse frequently executed read queries (if safe).
- TASK-ID QY-001S: Provide cross-tool orchestrations (e.g., automatically referencing schema tool for missing types).
- TASK-ID QY-001T: Update prompts to reflect new `query.run` structure and guidance.

### 6.4 Docs Tool Tasks
- TASK-ID DC-001A: Build `DocsSearchSchema` capturing `matches`, each with `resourceUri`, `excerpt`, `score`, `lineRange`. *(Status: AGENT-IN-PROGRESS — Codex)*
  - Progress (2025-01-20): Introduced `DocsSearchDataSchema` + match schema with snippet metadata (`src/tools/docs.ts:27`–`54`). Resource link wiring still pending.
- TASK-ID DC-001B: Add `maxMatches` parameter default 3; instruct on refining queries for more results. *(Status: AGENT-IN-PROGRESS — Codex)*
  - Progress (2025-01-20): `maxMatches` parameter now available with cap 10 and defaults surfaced via meta guidance (`src/tools/docs.ts:120`–`133`, `:208`–`214`).
- TASK-ID DC-001C: Register `gel-llm.txt` resource and ensure search respects root path.
- TASK-ID DC-001D: Provide fallback when doc missing – structured error instructing to sync docs.
- TASK-ID DC-001E: Implement optional sampling summarizing top matches.
- TASK-ID DC-001F: Add instrumentation logging query string and result count (sanitized).
- TASK-ID DC-001G: Provide tests verifying structured output and resource references.
- TASK-ID DC-001H: Add caching for search results (per term + context lines) with TTL to speed repeated queries.
- TASK-ID DC-001I: Document new usage (resource fetch) in README and prompts.
- TASK-ID DC-001J: Ensure search handles case-insensitive query while scoring highlight.
- TASK-ID DC-001K: Provide ability to search additional docs via config-specified directories.
- TASK-ID DC-001L: Add `docs.context` property referencing recommended next steps.
- TASK-ID DC-001M: Provide CLI command to update docs index (if necessary).
- TASK-ID DC-001N: Evaluate potential to convert doc index to `lunr` or more advanced aggregator if needed.
- TASK-ID DC-001O: Ensure token budgets enforced (limit excerpt chars, include `truncated` flag). *(Status: AGENT-IN-PROGRESS — Codex)*
  - Progress (2025-01-20): Inline snippets trimmed to 600 chars with `snippetTruncated` + `truncated` flags propagated through structured content (`src/tools/docs.ts:173`–`205`). Follow-up: emit resource link for overflow content.
- TASK-ID DC-001P: Provide scenario test verifying doc search + follow-up resource fetch.

### 6.5 Execute TypeScript Tool Tasks
- TASK-ID TS-001A: Define `ExecuteTypescriptResultSchema` with fields `executionMethod`, `resultSummary`, `resourceUri`, `durationMs`, `timeoutMs`, `memoryLimitMB`, `logsPreview`.
- TASK-ID TS-001B: Define `ExecuteTypescriptErrorSchema` with `errorCode`, `message`, `fixSteps`, `blockedPattern` optional.
- TASK-ID TS-001C: Write new `composeExecuteTypescriptResponse` using `structuredContent` and resource link for logs.
- TASK-ID TS-001D: Add sampling preflight to analyze code for high-risk operations; when flagged, require elicitation confirmation.
- TASK-ID TS-001E: Provide ability to disable fallback via config; if fallback used, structured response should highlight risk.
- TASK-ID TS-001F: Log sanitized code snippet (first 200 chars) for audit in secure manner.
- TASK-ID TS-001G: Add tests covering success, timeout, validation error, blocked pattern, isolated-vm absence.
- TASK-ID TS-001H: Document new safety flow in README.
- TASK-ID TS-001I: Provide scenario test executing code retrieving query results to ensure resource handling works.
- TASK-ID TS-001J: Integrate with job manager for long-running tasks.
- TASK-ID TS-001K: Add metrics for code execution (count, success rate, average duration).
- TASK-ID TS-001L: Ensure results sanitized to avoid leaking large JSON inline (use truncated preview + resource link).
- TASK-ID TS-001M: Provide fix suggestions referencing docs for TypeScript patterns.
- TASK-ID TS-001N: Add config to restrict `use_gel_client` usage; default to `false` requiring opt-in.
- TASK-ID TS-001O: Provide warning when `use_gel_client` false but code attempts to use it (structured error).

### 6.6 Prompts & Guidance Tasks
- TASK-ID PR-001A: Update each prompt to reference new tool names & resource patterns.
- TASK-ID PR-001B: Add `when_to_use` and `when_not_to_use` sections inside prompt text for clarity.
- TASK-ID PR-001C: Introduce version numbers for prompts; store metadata in resource for introspection.
- TASK-ID PR-001D: Provide tests verifying prompt text alignment with actual tool names.
- TASK-ID PR-001E: Document prompt usage in README (table with name, description, args, sample call).
- TASK-ID PR-001F: Add `prompts/context-md` resource summarizing best practices for LLM usage.
- TASK-ID PR-001G: Provide prompt for error recovery referencing new error structure.
- TASK-ID PR-001H: Add prompts for docs search & resource fetch interplay.
- TASK-ID PR-001I: Align prompts with new sampling flows (explain optional steps).
- TASK-ID PR-001J: Ensure prompts remain within 200 tokens to avoid context heavy usage.

### 6.7 Observability Tasks
- TASK-ID OB-001A: Implement request ID generator using `crypto.randomUUID()`; attach to response text and structured content.
- TASK-ID OB-001B: Add log formatter to emit JSON to stderr (structured) with request ID, tool, duration, status.
- TASK-ID OB-001C: Configure Winston to avoid console logs interfering with stdio; degrade to file/stderr only.
- TASK-ID OB-001D: Provide CLI command to tail logs with filtering by request ID.
- TASK-ID OB-001E: Add metrics aggregator (Prometheus) with counters for each tool success/error.
- TASK-ID OB-001F: Document how to enable metrics endpoint when using HTTP transport.
- TASK-ID OB-001G: Build tests verifying log output (maybe using memory transport).
- TASK-ID OB-001H: Ensure auto schema generation script no longer logs to stdout when run as part of server (guard environment variable to disable logs). *(Status: DONE — Codex 2025-10-20)*
- TASK-ID OB-001I: Provide `logs/README.md` describing log files and retention.

### 6.8 Workflow & Scenario Tasks
- TASK-ID WF-001A: Build scenario harness reading YAML definitions of steps (tool call, expected status) for reproducibility.
- TASK-ID WF-001B: Author scenario `connection-bootstrap.yaml` verifying auto → set → get.
- TASK-ID WF-001C: Author scenario `schema-describe.yaml` verifying describe with truncated results & summary.
- TASK-ID WF-001D: Author scenario `query-safe-run.yaml` verifying validation + run with truncated outputs.
- TASK-ID WF-001E: Author scenario `docs-research.yaml` verifying search + resource fetch.
- TASK-ID WF-001F: Author scenario `ts-preflight.yaml` verifying sampling preflight + execution.
- TASK-ID WF-001G: Integrate scenario runner into CI pipeline.
- TASK-ID WF-001H: Document scenario results for manual review.
- TASK-ID WF-001I: Provide command `pnpm run scenarios` for local execution.
- TASK-ID WF-001J: Add screenshot/gif of MCP inspector using new workflow (for README / docs).

### 6.9 Documentation & DX Tasks
- TASK-ID DX-001A: Update README to include new structured response examples (request/response JSON).
- TASK-ID DX-001B: Create `docs/api.md` listing each tool with `inputSchema`, `outputSchema`, sample response, resource URIs.
- TASK-ID DX-001C: Provide `docs/resources.md` enumerating available resources with description and usage tips.
- TASK-ID DX-001D: Add `docs/prompts.md` summarizing prompts.
- TASK-ID DX-001E: Document configuration options in `docs/configuration.md`.
- TASK-ID DX-001F: Provide quick start flow chart showing recommended sequence (Search, Disambiguate, Act).
- TASK-ID DX-001G: Add `docs/security.md` capturing new guardrails.
- TASK-ID DX-001H: Create `docs/observability.md` (if not already) to describe metrics, logs.
- TASK-ID DX-001I: Provide migration notes for clients using old tool names.
- TASK-ID DX-001J: Add examples for resource fetch using CLI (curl) and MCP inspector.

### 6.10 Quality Assurance Tasks
- TASK-ID QA-001A: Configure Jest coverage thresholds (80% statements/branches for core modules).
- TASK-ID QA-001B: Add tests for caching layer (cache hit/miss, invalidation on connection change).
- TASK-ID QA-001C: Add tests for resource store (expiry, retrieval, unauthorized access).
- TASK-ID QA-001D: Integrate lint/test commands into GitHub Actions with caching for pnpm.
- TASK-ID QA-001E: Add `pnpm audit` step or dependency vulnerability scanning.
- TASK-ID QA-001F: Provide script to run selective tests (unit vs scenario) for faster iteration.
- TASK-ID QA-001G: Document QA process for contributors.

## 7. Validation & Testing Matrix
### 7.1 Unit Tests Required
- UT-001: `connection.auto` returns auto selection flagged `autoSelected=true` with `suggestedNext` list.
- UT-002: `connection.switch-branch` with valid branch returns `structuredContent.before` and `structuredContent.after` states.
- UT-003: `schema.types` sets `truncated=true` when type count exceeds threshold, ensures preview length limited.
- UT-004: `schema.refresh` asynchronous job creation returns `status="processing"` and `jobId` string.
- UT-005: `query.run` with large dataset uses resource link; inline rows count <= `maxRowsInline`.
- UT-006: `query.validate` returns sampling summary when enabled, or omit field when disabled.
- UT-007: `docs.search` returns array of matches with `resourceUri` referencing doc resource.
- UT-008: `execute-typescript` uses new schema; logs truncated to configured preview length.
- UT-009: `errorNormalizer` maps `RateLimitError` to `isError=true`, `retryAfter` > 0, `fixSteps` mention waiting.
- UT-010: Resource store handles TTL expiration properly.

### 7.2 Integration / Scenario Tests
- IT-001: Full connection workflow (auto set → get) verifying `structuredContent` chaining instructions.
- IT-002: Schema describe followed by query validate ensures `suggestedNext` from schema recognized in query.
- IT-003: Query run returning truncated dataset ensures resource retrieval recovers full dataset.
- IT-004: Docs search retrieving resource and summarizing via sampling.
- IT-005: TypeScript execution flagged by preflight sampling; user declines; ensure job cancelled gracefully.
- IT-006: Schema refresh job running asynchronous, poll until completion.

### 7.3 Regression Tests
- RT-001: Legacy `connection` tool shim returns deprecation warning but still functions (until removal).
- RT-002: Tools continue to operate when sampling disabled globally.
- RT-003: Resources handle missing file gracefully (docs file removed) returning helpful error.
- RT-004: Rate limiting still enforced per tool after decomposition.
- RT-005: Observability logs appear on stderr only; no stdout contamination.

### 7.4 Manual Verification Checklist
- MAN-001: Run MCP inspector linking new prompts; ensure tool descriptions appear with new guidance.
- MAN-002: Validate HTTP transport streaming by hitting `/mcp` endpoint for long job.
- MAN-003: Inspect logs for sanitized outputs after executing code with sensitive strings.
- MAN-004: Confirm resource fetch yields `text/markdown` for doc sections and `application/json` for query results.
- MAN-005: Review metrics endpoint to ensure counters increments align with operations.

## 8. Risk Assessment & Mitigation
### 8.1 High-Risk Areas
- RISK-H1 (High): Response schema refactor touches all tools; risk of breaking host integrations. Mitigation: Provide shims + versioned releases.
- RISK-H2 (High): Asynchronous job manager introduces stateful components; ensure TTL cleanup to avoid memory leaks.
- RISK-H3 (High): Resource store may expose sensitive data; enforce access controls, sanitization, TTL.

### 8.2 Medium-Risk Areas
- RISK-M1: Sampling integration could incur latency and require user approvals; provide config toggles.
- RISK-M2: Elicitation forms need to align with host UI; test across targeted clients.
- RISK-M3: Observability logging restructure must avoid performance penalties.

### 8.3 Low-Risk Areas
- RISK-L1: Documentation updates primarily editorial.
- RISK-L2: Prompt adjustments straightforward but require review to avoid token inflation.

### 8.4 Risk Mitigation Tasks
- TASK-ID RM-001: Implement feature flags to toggle new behaviors gradually.
- TASK-ID RM-002: Provide compatibility release branch for hosts needing old tool names.
- TASK-ID RM-003: Conduct load testing for job manager and resource store under concurrency.

## 9. Dependencies & Sequencing Considerations
- Dependency D-001: Response helper redesign (Phase 0) blocks most subsequent work (tools rely on new helper).
- Dependency D-002: Resource store (Phase 2) required before token discipline improvements in query/docs.
- Dependency D-003: Job manager (Phase 5) depends on instrumentation/time measurement from earlier phases.
- Dependency D-004: Observability instrumentation (Phase 6) should follow response restructuring to ensure consistent metadata fields available.
- Dependency D-005: Prompt updates must align with tool renaming (Phase 1) to avoid referencing obsolete names.
- Dependency D-006: Scenario tests (Phase 7) should use final tool semantics; schedule after major functional changes.

## 10. Communication & Rollout Plan
- Stage 1: Internal preview release (tag `v1.3.0-beta.1`) with shims; gather feedback.
- Stage 2: Update prompts/resources docs; instruct host integrators to migrate tool calls.
- Stage 3: Public release `v1.4.0` removing legacy multi-action tool names (after migration window).
- Stage 4: Post-release monitoring with metrics dashboards; run scenario tests daily.
- Stage 5: Document future roadmap items (e.g., caching improvements, advanced analytics).

## 11. Appendix A – Tool-to-Best-Practice Crosswalk
- `connection.auto` → addresses BP: Tool intent-level design, error guidance, elicitation for branch selection.
- `connection.listBranches` → addresses BP: token discipline (pagination/truncation), structured outputs, root enforcement.
- `schema.overview` → addresses BP: resource links for large payloads, sampling for summary, caching.
- `schema.refresh` → addresses BP: streaming/progress, elicitation, error classification.
- `query.run` → addresses BP: token discipline, resource links, structured outputs, sampling explanation, streaming.
- `query.validate` → addresses BP: structured outputs, sampling summary, error guidance.
- `docs.search` → addresses BP: resource-based context, token discipline, structured outputs, sampling summarization.
- `execute-typescript` → addresses BP: structured outputs, resource links, elicitation, sampling preflight, security guardrails.

## 12. Appendix B – File Reference Index
- `src/app.ts:4` – server version metadata.
- `src/tools/index.ts:9` – tool registration.
- `src/utils.ts:214` – structured `buildToolResponse` helper delegating to `composeToolPayload`.
- `src/tools/connection.ts:19` – multi-action tool definition.
- `src/tools/schema.ts:18` – schema tool actions.
- `src/tools/query.ts:17` – query tool actions.
- `src/tools/docs.ts:64` – docs tool definition.
- `src/tools/executeTypescript.ts:168` – code execution tool definition.
- `src/tools/prompts.ts:21` – prompt definitions.
- `src/tools/cache.ts:6` – cache tools (inactive).
- `src/tools/session-management.ts:7` – session tools (inactive).
- `src/tools/validateQuery.ts:13` – dedicated validation tool (inactive).
- `src/logger.ts:33` – Winston logger config.
- `src/config.ts:7` – bootstrap logger using console.
- `scripts/auto-generate-schemas.js:5` – script logging to stdout.
- `src/schemaWatcher.ts:34` – watcher spawn logic.
- `src/validation.ts:126` – rate limiting implementation.
- `src/cache.ts:6` – schema caching map.
- `src/http.ts:47` – HTTP transport connection.

## 13. Appendix C – Future Considerations
- Explore integration with additional resources (EdgeDB docs via HTTP, GraphQL schema introspection) behind feature flags.
- Investigate multi-tenant environment support (namespaced caches, per-user rate limiting).
- Evaluate storing resource payloads on disk vs memory to support large outputs safely.
- Consider adding CLI to manage resources, inspect jobs, purge caches.
- Plan for plugin architecture enabling custom tool additions following same structured response patterns.
- Monitor SDK updates for built-in streaming/elicitation improvements and align implementation.

## 14. Conclusion
- The current codebase establishes solid groundwork (validated inputs, rate limiting, prompts) but diverges from 2024–2025 MCP best practices in structured output, resource usage, advanced UX (sampling, elicitation), and observability.
- This blueprint details a multi-phase transformation to align with those practices, emphasizing atomic tools, schema-first responses, token-efficient context delivery, robust error guidance, streaming job management, and telemetry.
- Execution requires disciplined sequencing (response helper → tool decomposition → resource infrastructure → UX enhancements) and comprehensive validation (unit, integration, scenario, manual checks).
- Upon completion, the MCP server will offer a significantly improved developer/agent experience: clearer tool contracts, predictable outputs, safety checks for risky actions, efficient context handling, and actionable observability for operations.
- Next Steps: Review backlog for prioritization, establish timeline, assign owners per phase, and set success metrics to monitor adoption.

## 15. Microtask Backlog (Granular Execution Steps)

The original appendix expanded every microtask into repetitive bullet lists; this condensed view keeps the intent without the noise. Each bullet links back to the phase-level tasks in §5 and the validation matrix in §7.

- **Connection & Session Tooling** — break the legacy multi-action tool into intent-level endpoints, wire structured outputs, add elicitation safeguards for branch switching, and update prompts/readme. (See §5.2, §7.1 UT-001..002.)
- **Schema Introspection** — introduce typed schemas for overview/describe/refresh, stream large outputs via resources/jobs, and capture metrics; ensure caching + watcher updates stay in sync. (See §5.3, §5.5, §7.1 UT-003..004.)
- **Query Execution** — enforce pagination/resource links, add sampling summaries, gate destructive statements via elicitation, and log durations/row counts. (See §5.4, §5.5, §7.1 UT-005..006.)
- **Docs Search & Knowledge Resources** — register documentation resources, cap inline excerpts, provide structured match metadata, and offer sampling-based summaries. (See §5.3, §7.1 UT-007.)
- **Execute TypeScript Safety** — standardise structured results, truncate and externalise logs, add optional sampling preflight plus elicitation, and expand security checks. (See §5.4, §7.1 UT-008.)
- **Prompt Catalogue & Guidance** — refresh all prompts with new tool names, add “when to use / when not to use” copy, version metadata, and documentation resources. (See §5.9.)
- **Resource Platform** — implement resource registry, TTL eviction, and root scoping to support docs, schema, query results, and execution logs. (See §5.3, §4.4.)
- **Observability & Metrics** — shift logging to stderr-only structured entries, inject request IDs, publish per-tool counters/latency, and document log schema. (See §5.6, §7.1 UT-009.)
- **Sampling Utilities** — create a reusable sampling helper with config toggles, integrate into query/schema/execute pathways, and test fallback behaviour. (See §5.4, §4.5.)
- **Elicitation Flows** — build a shared elicitation manager for destructive/missing-input scenarios, verify client UX, and ensure cancellations are graceful. (See §4.6, §7.1 UT-010.)

Use these summaries as entry points back into the detailed backlog whenever you need the exact task IDs or validation hooks.

## 16. Final Readiness Checklist (Sequential Walkthrough)
1. Confirm `composeToolPayload` implemented and imported in every tool module; run static analysis to ensure no lingering `buildToolResponse` references.
2. Validate new Zod output schemas compile without circular dependency; run `pnpm test` focusing on schema modules.
3. Ensure connection tool renaming completed; verify `tools/list` output shows new names and legacy shim flagged deprecated.
4. Update prompts to reference new tool names; fetch via `prompts/list` to confirm message content.
5. Register resources and verify `resources/list` enumerates doc, schema, query, ts-exec entries with correct metadata.
6. Run scenario suite to validate canonical workflows succeed with structured outputs and resource links.
7. Trigger sampling-enabled flows, confirm host prompts for approval where required.
8. Execute destructive actions (branch switch, schema refresh) to validate elicitation gating prevents accidental changes.
9. Review structured logs to ensure entries contain request IDs, durations, status, and sanitized arguments only.
10. Inspect metrics endpoint or log summaries to verify per-tool counts increment as expected.
11. Confirm truncated responses surface `resource_link` instructions and that resource fetch works for large payloads.
12. Run regression tests covering legacy tool shim; ensure deprecation warning delivered via structured content.
13. Validate TypeScript execution preflight sampling and log truncation; attempt blocked pattern to ensure error hints triggered.
14. Check documentation updates (README, docs directory) align with new APIs and reference structured content fields.
15. Confirm CI pipeline runs lint, unit tests, scenario tests, and coverage thresholds.
16. Monitor logs for any stdout emissions (should be none) to protect stdio transport.
17. Review security posture; ensure DML confirmation elicitation operational and sensitive data redacted.
18. Finalize release notes summarizing major changes, migration steps, and validation coverage.
19. Tag release candidate and notify stakeholders to validate in their environments.
20. After approval, cut stable release, monitor metrics for early issues, and prepare backlog for iterative refinements.
## 17. Post-Deployment Observation Checklist

Use this checklist after rollout to ensure the upgraded server stays healthy and aligned with the roadmap. Tackle items in whatever order matches your automation pipeline; nothing implies multi-day pacing.

1. Verify baseline metrics for each tool (call counts, errors, latency percentiles) against pre-change benchmarks.
2. Review agent transcripts to confirm prompts drive the intended workflows; adjust descriptions if confusion appears.
3. Audit the resource store for orphaned entries and confirm TTL eviction works.
4. Validate sampling budgets stay within configured limits and approval prompts behave as expected.
5. Inspect asynchronous job queues and ensure no `processing` statuses remain stuck.
6. Run a targeted load test on the query tool to exercise pagination, truncation, and resource links.
7. Check docs-search cache metrics and tune thresholds if relevancy drifts.
8. Confirm logging rotates as configured and never spills to stdout.
9. Review logs of destructive operations to ensure elicitation confirmations are captured with reasons.
10. Collect developer feedback on the new prompts and structured outputs; note follow-up tweaks.
11. Evaluate TypeScript execution usage and security warnings for repeated patterns.
12. Reconcile telemetry with scenario test results and investigate any deltas.
13. Analyse error categories to verify fix-steps are reducing repeated failures.
14. Update the knowledge base with any newly discovered workflows or corner cases.
15. Snapshot updated documentation and screenshots for host integrations.
16. Check sampling fallback paths and ensure declines produce graceful fallbacks.
17. Review auto-selection logs to confirm deterministic behaviour matches design.
18. Quality-check schema summaries generated via sampling for completeness and accuracy.
19. Manually fetch a resource-backed query result to verify retrieval speed and redaction.
20. Validate metrics exporters feed dashboards or alerting hooks without errors.
21. Re-run the scenario suite to confirm canonical workflows still pass end-to-end.
22. Audit log verbosity; adjust levels or sampling if volume is excessive.
23. Inspect cache invalidation metrics to avoid stale data or unnecessary thrashing.
24. Disable sampling temporarily to confirm optional features degrade gracefully.
25. Re-measure prompt lengths and trim if token budgets creep upward.
26. Attempt file access outside declared roots and confirm the server denies it.
27. Inspect rate-limit counters per tool to ensure limits remained effective post-refactor.
28. Restart schema watchers across environments to verify resilience.
29. Review resource URIs for uniqueness and absence of collisions.
30. Update the backlog with any new microtasks discovered during observation.
31. Monitor agent adoption metrics to ensure balanced tool usage.
32. Share an internal briefing demonstrating the upgraded workflows and gather qualitative notes.
33. Perform a quick threat review to ensure new features didn’t open regressions.
34. Cross-check documentation accuracy against real behaviour; fix discrepancies.
35. Evaluate whether error fix-steps truly help agents recover without looping.
36. Tune sampling parameters (temperature, tokens) if summaries look off.
37. Measure asynchronous job durations and adjust thresholds for job-manager offloading.
38. Review TypeScript execution logs for additional patterns worth blocking.
39. Adjust docs-search ranking parameters if relevancy changes.
40. Confirm latency histograms (p50/p95/p99) are captured per tool.
41. Monitor resource-store memory usage and tweak TTL or backing storage.
42. Exercise branch-switch workflows to ensure watcher updates and elicitation still operate.
43. Validate prompt alignment across different MCP hosts (Inspector, IDEs, custom clients).
44. Re-test schema cache invalidation after refresh operations.
45. Scan logs for warnings/errors and group them by module for targeted fixes.
46. Confirm job cancellation paths work and return clear feedback to clients.
47. Check sampling cost budgets and adjust config as needed.
48. Share metrics dashboards with the broader automation team for transparency.
49. Toggle TypeScript preflight sampling off/on to ensure the guardrail is optional when desired.
50. Ensure CI guardrails detect missing structured-content schemas in any new tool.
51. Measure resource-fetch latency and optimise storage if responses lag.
52. Expand scenario coverage to include any new error cases observed in production.
53. Update the backlog status and close completed items; add new ones as insights emerge.
54. Re-run dependency security scans (`pnpm audit`) and apply patches if necessary.
55. Confirm localisation or downstream documentation assets remain accurate.
56. Host a short retrospective summarising technical and process lessons.
57. Analyse rate-limit logs to see whether thresholds need tightening or loosening.
58. Inspect sampling retry logic to ensure it never loops indefinitely.
59. Compile a release report summarising metrics improvements and residual risks.
60. Define the next iteration scope based on the data gathered above.
