# Structured Tool Response Contract

This server now standardises every MCP tool reply around a shared envelope.  
The goal is to keep the text channel concise for the LLM while guaranteeing machine-parseable payloads for automated workflows.

## Envelope Types

Definitions live in `src/types/mcp.ts`.

- `ToolResponseMeta` – status/summary block used to build human-readable headlines. Fields:
  - `status` – `"ok" | "error" | "info" | "warn"`.
  - `summary` – single-line headline (rendered with an emoji prefix).
  - `details` – optional bullet-style strings appended in order.
  - `nextSteps` – optional hints for the agent.
  - `truncated` – flag when inline text was shortened.
  - `tokenUsage`, `rateLimit` – structured hints surfaced to the agent/host.
- `ToolResponseEnvelope<T>` – wraps the per-tool `data` object with `meta`.

Use `createToolResponseEnvelopeSchema(z.object({...}))` to declare an `outputSchema` for the tool.

## composeToolPayload

Helper located in `src/utils.ts`.

```ts
const response = composeToolPayload({
	meta,
	data,
	additionalText: ["optional extra text sections"],
	resourceLinks: [
		{ type: "resource_link", uri: "docs://match/1", name: "Full excerpt" }
	],
});
```

Behaviour:

1. Builds the headline `content` entry with an emoji derived from `meta.status`.
2. Appends `meta.details` unless `omitMetaDetails` is `true`.
3. Appends any `additionalText` blocks (use to provide quick inline previews).
4. Appends `resourceLinks` untouched.
5. Returns `{ content, structuredContent: { meta, data }, isError }`.

`isError` defaults to `meta.status === "error"`.

## Migration Checklist

1. Define a Zod schema for the tool result.
2. Create a typed payload object (`const data: MyToolResult = { ... }`).
3. Assemble `meta` with clear summary + next steps.  
   *Keep the summary <= 80 chars so hosts render it cleanly.*
4. Call `composeToolPayload({ meta, data, additionalText, resourceLinks })`.
5. Export the schema via `outputSchema`.
6. Replace legacy `buildToolResponse` usage with `buildStructuredResponse` or
   direct `composeToolPayload` calls as each tool migrates.

### Convenience Helpers

- `buildStructuredResponse<T>(options & { data: T })` builds both the textual
  summary and `structuredContent` by reusing the legacy status/title arguments
  and attaching the typed payload. Use this when a tool already has a bespoke
  Zod schema.
- `buildToolResponse(options)` wraps the legacy default payload
  (`DefaultToolResponseData`). It remains available for tools that have not yet
  migrated to typed outputs.

### Error Patterns

- Always set `meta.status = "error"` for recoverable issues and add actionable `nextSteps`.
- Include an `errorCode` inside your `data` object when the caller needs to branch on the failure.

### Token Discipline

- Inline previews should remain under ~2k characters; set `meta.truncated = true` and provide a resource link when you omit data.
- Populate `data.truncated` or similar booleans so agents can reason about pagination.

## Deprecation Notice

`buildToolResponse` only creates text payloads and should be removed as each tool migrates.  
When refactoring a tool, replace the call with `composeToolPayload` and update this document if new patterns emerge.


Biome lint rule `no-raw-mcp-text` (configured via `noRestrictedImports`) now warns whenever a module imports `buildToolResponse`; migrate to `buildStructuredResponse`/`composeToolPayload` to satisfy the guardrail.
