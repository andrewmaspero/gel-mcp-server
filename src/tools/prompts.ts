import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer) {
	server.registerPrompt(
		"bootstrap-connection",
		{
			title: "Bootstrap: Establish Connection & Verify",
			description:
				"Deterministically set default instance/branch and verify connectivity before any other operation.",
			argsSchema: {
				instance: z.string().optional(),
				branch: z.string().optional(),
			},
		},
		({ instance, branch }) => {
			const suggestedInstance = instance ?? "<your_instance>";
			const suggestedBranch = branch ?? "main";
			const text = [
				"Operate in a connection-first, schema-first workflow.",
				"Before any query:",
				'1) Call @[connection action="get"]. If unset, call @[connection action="listInstances"].',
				"2) Choose an instance deterministically (prefer provided one; otherwise pick lexicographically first).",
				'3) Call @[connection action="listBranches" instance="<INSTANCE>"]. Prefer \'main\' if unspecified.',
				'4) Call @[connection action="set" instance="<INSTANCE>" branch="<BRANCH>"].',
				'5) Verify with @[connection action="get"], then run @[schema action="types"] as a health check.',
				"On any error, pick the corrective next tool call (e.g., connection.set/listInstances/listBranches) and retry once.",
				"Preferred defaults (if ambiguous):",
				`- instance: ${suggestedInstance}`,
				`- branch: ${suggestedBranch}`,
			].join("\n");
			return {
				messages: [
					{
						role: "user" as const,
						content: { type: "text" as const, text },
					},
				],
			};
		},
	);

	// Schema exploration: List → Describe → Plan
	server.registerPrompt(
		"schema-exploration",
		{
			title: "Schema Exploration (List → Describe → Plan)",
			description:
				"Enforce listing types and describing targets before crafting any EdgeQL.",
			argsSchema: {},
		},
		() => ({
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text: [
							"Use a strict schema-first plan:",
							"- Call @[schema action=\"types\"] to enumerate entities (strip 'default::' when showing names).",
							'- For a candidate, call @[schema action="describe" typeName="<Type>"] to confirm properties and links.',
							"- Only then compose EdgeQL that references real fields. Avoid guessing names.",
							"- Prefer parameterized arguments over embedding user strings.",
						].join("\n"),
					},
				},
			],
		}),
	);

	// Quickstart: Connection → Schema → Validate → Execute
	server.registerPrompt(
		"quickstart",
		{
			title: "Quickstart (Connection → Schema → Validate → Execute)",
			description:
				"Concise workflow covering connection setup, schema discovery, safe query workflow, and error recovery.",
			argsSchema: {},
		},
		() => ({
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text: [
							"You are using an MCP database server. Follow this workflow strictly:",
							"",
							"Connection:",
							'- Call @[connection action="get"]. If unset, call @[connection action="listInstances"] then @[connection action="set"].',
							"- Optionally call @[connection action=\"listBranches\"]. Prefer 'main' if unsure.",
							'- Verify with @[schema action="types"].',
							"",
							"Schema-first:",
							'- Call @[schema action="types"]. Then @[schema action="describe" typeName="<Type>"].',
							"- Always consult Gel docs via Context7 before writing queries: use library id /geldata/gel.",
							"",
							"Safe Query Workflow:",
							"- Prefer parameterized arguments.",
							'- Validate first: @[query action="validate" query="SELECT ..."]',
							'- If valid, execute: @[query action="run" query="SELECT ..."]',
							"- LIMIT large results for display.",
							"",
							"Error Recovery:",
							"- On error, read the message, choose the corrective tool call (connection/schema/query), retry once.",
						].join("\n"),
					},
				},
			],
		}),
	);

	// EdgeQL workflow prompt (validation-first)
	server.registerPrompt(
		"edgeql-workflow",
		{
			title: "EdgeQL Workflow (Validate → Execute)",
			description:
				"Enforce validation-first execution with safe argument handling and compact results.",
			argsSchema: { query: z.string().describe("EdgeQL to run") },
		},
		({ query }) => ({
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text: [
							"Run EdgeQL safely:",
							`- First: @[query action=\"validate\" query=\"${query.replace(/"/g, '\\"')}\"]`,
							`- If valid: @[query action=\"run\" query=\"${query.replace(/"/g, '\\"')}\"]`,
							"- If invalid: adjust schema/filters/args, re-validate before executing.",
						].join("\n"),
					},
				},
			],
		}),
	);

	// Recovery playbook
	server.registerPrompt(
		"recovery-playbook",
		{
			title: "Recovery Playbook (Common Tool Errors)",
			description: "Map common tool errors to corrective actions.",
			argsSchema: {},
		},
		() => ({
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text: [
							"If a tool fails:",
							'- \'Database client could not be initialized\' ⇒ @[connection action="listInstances"] → @[connection action="set"] → retry.',
							'- \'Type not found\' ⇒ @[schema action="types"] then correct casing and @[schema action="describe"].',
							"- 'Invalid params' ⇒ check required fields; re-run with corrected arguments.",
							"- Rate limited ⇒ backoff and retry; batch where possible.",
						].join("\n"),
					},
				},
			],
		}),
	);

	// Run EdgeQL helper prompt (single-query guidance)
	server.registerPrompt(
		"run-edgeql",
		{
			title: "Run EdgeQL (Guided)",
			description:
				"Produce the minimal, correct steps to validate then execute a single EdgeQL query using consolidated tools.",
			argsSchema: {
				query: z.string(),
				instance: z.string().optional(),
				branch: z.string().optional(),
			},
		},
		({ query, instance, branch }) => {
			const baseValidate = `@[query action=\"validate\" query=\"${query.replace(/"/g, '\\\\"')}\"]`;
			const baseRun = `@[query action=\"run\" query=\"${query.replace(/"/g, '\\\\"')}\"]`;
			const withConn = (s: string) =>
				instance || branch
					? s.replace(
							"]",
							`${instance ? ` instance=\"${instance}\"` : ""}${branch ? ` branch=\"${branch}\"` : ""}]`,
						)
					: s;
			const text = [
				"Validate then execute using consolidated tools:",
				`- Validate: ${withConn(baseValidate)}`,
				`- Run: ${withConn(baseRun)}`,
				"- Before running, consult Gel docs via Context7 (/geldata/gel) to confirm clauses and operators.",
				"If validation fails, inspect the message, adjust schema/filters/args, and re-validate before running.",
			].join("\n");
			return {
				messages: [{ role: "user", content: { type: "text", text } }],
			};
		},
	);

	// Context7/Gel RAG bootstrap prompt
	server.registerPrompt(
		"gel-rag-bootstrap",
		{
			title: "Gel RAG Bootstrap (Context7)",
			description:
				"Always consult current Gel docs via Context7 (/geldata/gel) before crafting queries or schema tweaks.",
			argsSchema: {},
		},
		() => ({
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text: [
							"Use the Context7 library id directly: /geldata/gel (no resolve step).",
							"Preferred search terms by intent:",
							"- Queries: Overview, Literals, Sets, Paths, Types, Parameters, Select, Insert, Update, Delete, For, Group, With, Analyze, Path scoping, Transactions",
							"- Schema: Object Types, Properties, Links, Computeds, Primitives, Indexes, Constraints, Inheritance, Aliases, Globals, Access Policies, Functions, Triggers, Mutation rewrites, Link properties, Modules, Migrations, Branches, Extensions, Annotations",
							"Many models have outdated knowledge of Gel; always cross-check.",
						].join("\n"),
					},
				},
			],
		}),
	);

	// Condensed Gel schema/perf principles
	server.registerPrompt(
		"gel-schema-principles",
		{
			title: "Gel Schema & Performance Principles (Essentials)",
			description:
				"Embed key schema and performance practices to guide planning and reviews.",
			argsSchema: {},
		},
		() => ({
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text: [
							"- Prefer one-to-many with single links + computed backlinks; avoid unnecessary multi join tables.",
							"- Use link properties only when modeling many-to-many relationship data.",
							"- Arrays for whole-list reads/writes; multi scalar properties when filtering elements.",
							"- Favor polymorphic inheritance/union types; avoid composition anti-patterns.",
							"- Index only fields you filter/order by; rely on built-ins for id/links/exclusive.",
							"- Embrace nested object queries; use computed vs materialized wisely; keep access policies simple.",
							"- Use [is Type] intersections to improve type-safety and planner behavior.",
						].join("\n"),
					},
				},
			],
		}),
	);

	// Search docs helper prompt
	server.registerPrompt(
		"search-docs",
		{
			title: "Search Docs (Guided)",
			description:
				"Generate a call to search local documentation with context windows.",
			argsSchema: { term: z.string() },
		},
		({ term }) => ({
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text: `Use: @[docs action=\"search\" term=\"${term.replace(/"/g, '\\\\"')}\"].`,
					},
				},
			],
		}),
	);

	// Suggest Context7/Gel search terms from a natural goal
	server.registerPrompt(
		"gel-rag-suggest",
		{
			title: "Gel RAG Suggest (Context7 Search Terms)",
			description:
				"Given a natural goal, propose targeted Context7 search terms and ready-to-use calls.",
			argsSchema: {
				goal: z
					.string()
					.describe(
						"Natural language goal, e.g., 'paginate a SELECT over Orders'",
					),
				intent: z
					.enum(["query", "schema", "both"]) // optional hint to bias suggestions
					.optional(),
			},
		},
		({ goal, intent }) => {
			const safeGoal = goal.replace(/"/g, '\\"');
			const baseQueryTerms = [
				"Overview",
				"Literals",
				"Sets",
				"Paths",
				"Types",
				"Parameters",
				"Select",
				"Insert",
				"Update",
				"Delete",
				"For",
				"Group",
				"With",
				"Analyze",
				"Path scoping",
				"Transactions",
			];
			const baseSchemaTerms = [
				"Object Types",
				"Properties",
				"Links",
				"Computeds",
				"Primitives",
				"Indexes",
				"Constraints",
				"Inheritance",
				"Aliases",
				"Globals",
				"Access Policies",
				"Functions",
				"Triggers",
				"Mutation rewrites",
				"Link properties",
				"Modules",
				"Migrations",
				"Branches",
				"Extensions",
				"Annotations",
			];
			const pick = (arr: string[], n: number) =>
				arr.slice(0, Math.min(n, arr.length));
			const intentLower = (intent ?? "both").toLowerCase();
			const topics =
				intentLower === "query"
					? pick(baseQueryTerms, 6)
					: intentLower === "schema"
						? pick(baseSchemaTerms, 6)
						: pick(baseQueryTerms, 4).concat(pick(baseSchemaTerms, 2));
			const suggested = `${safeGoal} — ${topics.join(", ")}`;
			const text = [
				"Use Context7 directly with Gel docs:",
				"- Library id: /geldata/gel",
				`- Search: "${suggested}"`,
				"",
				"If local RAG is preferred (this server):",
				`@[docs action=\"search\" term=\"${suggested}\"]`,
				"",
				"Tips:",
				"- Start broad (Overview/Types), then refine to operators/clauses.",
				'- Cross-check examples with your live schema via @[schema action="types"] / @[schema action="describe"].',
			].join("\n");
			return {
				messages: [
					{ role: "user" as const, content: { type: "text" as const, text } },
				],
			};
		},
	);
}
