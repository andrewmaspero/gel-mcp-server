import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAvailableInstances } from "../database.js";

export function registerPrompts(server: McpServer) {
	// Connection bootstrap prompt to mitigate tool-call failures by guiding the agent
	server.registerTool(
		"prompt-bootstrap-connection",
		{
			title: "Bootstrap: Establish Connection & Verify",
			description:
				"System prompt that instructs the agent to deterministically set a default instance/branch and verify connectivity before any other operation.",
			inputSchema: {
				instance: z.string().optional(),
				branch: z.string().optional(),
			},
		},
		async (args) => {
			const suggestedInstance = args.instance ?? "<your_instance>";
			const suggestedBranch = args.branch ?? "main";
			const text = [
				"Operate in a connection-first, schema-first workflow.",
				"Before any query:",
				"1) Call get-default-connection. If unset, call list-instances. If empty, instruct the user to add JSON credentials to 'instance_credentials/'.",
				"2) Choose an instance deterministically (prefer provided one; otherwise pick lexicographically first).",
				"3) Call list-branches for the chosen instance; prefer 'main' if unspecified.",
				"4) Call set-default-connection with the chosen instance/branch.",
				"5) Verify with get-default-connection, then run list-schema-types as a health check.",
				"On any error, extract the message and select the next corrective tool call (e.g., set-default-connection, list-instances, list-branches), then retry once.",
				"Preferred defaults (if ambiguous):",
				`- instance: ${suggestedInstance}`,
				`- branch: ${suggestedBranch}`,
			].join("\n");
			return { content: [{ type: "text", text }] };
		},
	);

	// Schema exploration prompt to reduce malformed ad-hoc queries
	server.registerTool(
		"prompt-schema-exploration",
		{
			title: "Schema Exploration (List → Describe → Plan)",
			description:
				"System prompt that enforces listing types and describing targets before crafting any EdgeQL.",
			inputSchema: {},
		},
		async () => ({
			content: [
				{
					type: "text",
					text: [
						"Use a strict schema-first plan:",
						"- Call list-schema-types to enumerate domain entities (strip 'default::' when showing names).",
						"- For each candidate, call describe-schema to inspect properties (scalars) and links (relationships).",
						"- Only then compose EdgeQL that references real fields. Avoid guessing type/field names.",
						"- Prefer parameterized arguments over embedding user strings.",
					].join("\n"),
				},
			],
		}),
	);

	// Opinionated quickstart prompt (single message the model can read to work reliably)
	server.registerTool(
		"prompt-quickstart",
		{
			title: "Quickstart (Connection → Schema → Validate → Execute)",
			description:
				"Concise, step-by-step system prompt covering connection setup, schema discovery, safe query workflow, and error recovery.",
			inputSchema: {},
		},
		async () => ({
			content: [
				{
					type: "text",
					text: [
						"You are using an MCP database server. Follow this workflow strictly:",
						"",
						"Connection:",
						"- Call get-default-connection. If unset, call list-instances; if none, request credentials be added. Otherwise pick lexicographically first and call set-default-connection.",
						"- Optionally call list-branches for the chosen instance; prefer 'main' if unsure.",
						"- Verify with list-schema-types.",
						"",
						"Schema-first:",
						"- Before any query, call list-schema-types. For a candidate type, call describe-schema to confirm fields.",
						"- Only then craft EdgeQL.",
						"",
						"Safe Query Workflow:",
						"- Prefer parameterized arguments over string interpolation.",
						"- Validate first with validate-query (same args). On success, then execute-edgeql.",
						"- If the result set is large, LIMIT output for display, then iterate.",
						"",
						"Error Recovery:",
						"- If a tool returns an error, extract the code/message, choose the next corrective tool call (e.g., set-default-connection, list-instances, list-schema-types), and retry.",
						"- If 'Type not found', correct the typeName casing or re-check list-schema-types.",
						"- If 'client not initialized', set defaults then retry.",
					].join("\n"),
				},
			],
		}),
	);

	// Guided defaults chooser with basic completions
	server.registerTool(
		"prompt-choose-defaults",
		{
			title: "Choose Defaults (Deterministic Instance/Branch)",
			description:
				"Guides deterministic selection of instance/branch with simple completions and tie-break rules.",
			inputSchema: {
				instance: completable(z.string(), (_value) => getAvailableInstances()),
				branch: completable(z.string(), (value) =>
					["main", "dev", "staging"].filter((b) => b.startsWith(value)),
				),
			},
		},
		async (args) => {
			const instance = args.instance || "<choose-from-list-instances>";
			const branch = args.branch || "main";
			const text = [
				"Pick deterministic defaults:",
				`- instance: ${instance} (if multiple, pick lexicographically first)`,
				`- branch: ${branch} (prefer 'main' if unknown)`,
				"Then call set-default-connection. Re-verify with get-default-connection and list-schema-types.",
			].join("\n");
			return { content: [{ type: "text", text }] };
		},
	);

	// EdgeQL workflow prompt (validation-first)
	server.registerTool(
		"prompt-edgeql-workflow",
		{
			title: "EdgeQL Workflow (Validate → Execute)",
			description:
				"Prompt that enforces validation-first execution with safe argument handling and compact results.",
			inputSchema: {
				query: z.string().describe("EdgeQL to run"),
			},
		},
		async (args) => ({
			content: [
				{
					type: "text",
					text: [
						"Run EdgeQL safely:",
						`- First: @[validate-query query="${args.query.replace(/"/g, '\\"')}"]`,
						`- If valid: @[execute-edgeql query="${args.query.replace(/"/g, '\\"')}"]`,
						"- If invalid: read the message, adjust schema/filters/args, and re-validate before executing.",
					].join("\n"),
				},
			],
		}),
	);

	// Recovery playbook prompt
	server.registerTool(
		"prompt-recovery-playbook",
		{
			title: "Recovery Playbook (Common Tool Errors)",
			description:
				"Short, actionable playbook mapping common tool errors to corrective actions.",
			inputSchema: {},
		},
		async () => ({
			content: [
				{
					type: "text",
					text: [
						"If a tool fails:",
						"- 'Database client could not be initialized' ⇒ call list-instances → set-default-connection → retry.",
						"- 'Type not found' ⇒ call list-schema-types, correct name, then describe-schema again.",
						"- 'Invalid params' ⇒ check required fields for the tool; re-run with corrected arguments.",
						"- 'Resource not found' ⇒ verify URIs and re-run or adjust scope.",
						"- Rate limited ⇒ exponential backoff and retry; batch where possible.",
						"- Always summarize the error cause and the next tool you will call.",
					].join("\n"),
				},
			],
		}),
	);

	// A tool that formats a code review prompt
	server.registerTool(
		"prompt-code-review",
		{
			title: "Generate Code Review Prompt",
			description:
				"Generate a detailed prompt to have the LLM review a snippet of code.",
			inputSchema: {
				code: z.string(),
			},
		},
		async (args) => ({
			content: [
				{
					type: "text",
					text: `Here is a prompt to begin a code review:\n\nPlease review this code for best practices, potential bugs, and possible improvements:\n\n\`\`\`\n${args.code}\n\`\`\``,
				},
			],
		}),
	);

	// A tool that formats a search documentation prompt
	server.registerTool(
		"prompt-search-docs",
		{
			title: "Search Docs (Gel LLM File)",
			description:
				"Generates a single tool call that searches the local Gel documentation (gel_llm.txt) for a term.",
			inputSchema: {
				term: z.string(),
			},
		},
		async (args) => ({
			content: [
				{
					type: "text",
					text: `Use this tool call to search the docs:\n\n@[search_gel_docs search_term="${args.term}"]`,
				},
			],
		}),
	);

	// A tool that formats a run EdgeQL query prompt
	server.registerTool(
		"prompt-run-edgeql",
		{
			title: "Run EdgeQL (Single Tool Call)",
			description:
				"Generates a single tool call to execute an EdgeQL query against an instance/branch. Prefer 'prompt-edgeql-workflow' for validation-first.",
			inputSchema: {
				query: z.string(),
				instance: z.string().optional(),
				branch: z.string().optional(),
			},
		},
		async (args) => {
			let toolCall = `@[execute-edgeql query="${args.query.replace(/"/g, '\\"')}"`;
			if (args.instance) {
				toolCall += ` instance="${args.instance}"`;
			}
			if (args.branch) {
				toolCall += ` branch="${args.branch}"`;
			}
			toolCall += `]`;
			return {
				content: [
					{
						type: "text",
						text: `Run the query with this tool call (consider validating first):\n\n${toolCall}`,
					},
				],
			};
		},
	);
}
