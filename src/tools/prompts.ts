import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAvailableInstances } from "../database.js";

export function registerPrompts(server: McpServer) {
	// Connection bootstrap prompt to mitigate tool-call failures by guiding the agent
	server.registerTool(
		"prompt-bootstrap-connection",
		{
			title: "Generate Bootstrap Prompt (Set Connection)",
			description:
				"Generates a short system prompt that instructs the agent to establish a default instance/branch and verify connectivity before using other tools.",
			inputSchema: {
				instance: z.string().optional(),
				branch: z.string().optional(),
			},
		},
		async (args) => {
			const suggestedInstance = args.instance ?? "<your_instance>";
			const suggestedBranch = args.branch ?? "main";
			const text = [
				"You are operating an MCP server with Gel database tools.",
				"Before calling any database tools:",
				"1) If no default connection is set, call set-default-connection with instance and branch.",
				"2) Call list-instances if you need available instance names.",
				"3) Call list-branches if you need available branches for an instance.",
				"4) After setting the default, call get-default-connection and then a trivial read (e.g., list-schema-types) to verify.",
				"If any call fails, report the exact tool error and propose the next corrective action.",
				"Preferred defaults:",
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
			title: "Generate Schema Exploration Prompt",
			description:
				"Generates a prompt instructing the agent to first discover schema types and then fetch detailed type info before forming queries.",
			inputSchema: {},
		},
		async () => ({
			content: [
				{
					type: "text",
					text: [
						"To understand the schema before writing queries:",
						"- Call list-schema-types to get type names.",
						"- For any type of interest, call describe-schema with typeName.",
						"- Only after reviewing properties/links should you craft EdgeQL and call execute-edgeql.",
						"- When executing queries, prefer parameterized args and avoid interpolating raw user strings.",
					].join("\n"),
				},
			],
		}),
	);

	// Opinionated quickstart prompt (single message the model can read to work reliably)
	server.registerTool(
		"prompt-quickstart",
		{
			title: "Generate Quickstart Prompt (End-to-End)",
			description:
				"Generates a concise, step-by-step system prompt covering connection setup, schema discovery, safe query workflow, and error recovery.",
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
						"- Call get-default-connection. If unset, call list-instances, pick one deterministically (first if no policy), then call set-default-connection.",
						"- Optionally call list-branches for the chosen instance; prefer 'main' if unsure.",
						"- Verify with list-schema-types.",
						"",
						"Schema-first:",
						"- Before any query, call list-schema-types. For a candidate type, call describe-schema.",
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
			title: "Generate Prompt to Choose Defaults",
			description:
				"Generates a prompt guiding the agent to deterministically pick an instance and branch, including completions and tie-break rules.",
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
				"Choose deterministic defaults:",
				`- instance: ${instance} (if multiple, pick lexicographically first)`,
				`- branch: ${branch} (prefer 'main' if unknown)`,
				"Then call set-default-connection. Re-verify with get-default-connection and a lightweight tool (list-schema-types).",
			].join("\n");
			return { content: [{ type: "text", text }] };
		},
	);

	// EdgeQL workflow prompt (validation-first)
	server.registerTool(
		"prompt-edgeql-workflow",
		{
			title: "Generate EdgeQL Workflow Prompt",
			description:
				"Generates a prompt that tells the model to validate first, then execute, and present results compactly.",
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
						"- If invalid: read the message, adjust schema/filters, and re-validate before executing.",
					].join("\n"),
				},
			],
		}),
	);

	// Recovery playbook prompt
	server.registerTool(
		"prompt-recovery-playbook",
		{
			title: "Generate Error Recovery Prompt",
			description:
				"Generates a short playbook for how the agent should recover from common tool errors automatically.",
			inputSchema: {},
		},
		async () => ({
			content: [
				{
					type: "text",
					text: [
						"If a tool fails:",
						"- If 'Database client could not be initialized' ⇒ call list-instances → set-default-connection → retry.",
						"- If 'Type not found' ⇒ call list-schema-types, correct name, then describe-schema again.",
						"- If rate limited ⇒ back off and retry later; batch operations when possible.",
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
			title: "Generate Search Documentation Tool Call",
			description:
				"Generate a tool call to search the Gel documentation for a specific term.",
			inputSchema: {
				term: z.string(),
			},
		},
		async (args) => ({
			content: [
				{
					type: "text",
					text: `Here is the tool call to search the documentation:\n\n@[search_gel_docs search_term="${args.term}"]`,
				},
			],
		}),
	);

	// A tool that formats a run EdgeQL query prompt
	server.registerTool(
		"prompt-run-edgeql",
		{
			title: "Generate EdgeQL Query Tool Call",
			description:
				"Generate a tool call to execute an EdgeQL query against a specific instance and branch.",
			inputSchema: {
				query: z.string(),
				instance: z.string().optional(),
				branch: z.string().optional(),
			},
		},
		async (args) => {
			let toolCall = `@[execute-edgeql query="${args.query}"`;
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
						text: `Here is the tool call to run your query:\n\n${toolCall}`,
					},
				],
			};
		},
	);
}
