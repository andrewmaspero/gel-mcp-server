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
}
