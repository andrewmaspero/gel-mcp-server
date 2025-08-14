import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDatabaseClient } from "../database.js";
import { checkRateLimit, validateQueryArgs } from "../validation.js";

class ValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ValidationError";
	}
}

export function registerValidateQuery(server: McpServer) {
	server.registerTool(
		"validate-query",
		{
			title: "Validate EdgeQL Query",
			description:
				"Validates an EdgeQL query syntax without executing it fully. This runs the query in a transaction that gets rolled back, so it's safe to use with INSERT, UPDATE, DELETE operations for validation purposes.",
			inputSchema: {
				query: z.string(),
				args: z.record(z.string(), z.any()).optional(),
				instance: z.string().optional(),
				branch: z.string().optional(),
			},
		},
		async (args) => {
			checkRateLimit("validate-query");
			const gelClient = getDatabaseClient({
				instance: args.instance,
				branch: args.branch,
			});
			if (!gelClient) {
				return {
					content: [
						{
							type: "text",
							text: "Database client could not be initialized.",
						},
					],
				};
			}

			try {
				await gelClient.transaction(async (tx) => {
					if (args.args && Object.keys(args.args).length > 0) {
						await tx.query(args.query, validateQueryArgs(args.args));
					} else {
						await tx.query(args.query);
					}
					// If we get here, the query was syntactically valid
					throw new ValidationError("Query validation successful.");
				});

				// This should never be reached due to the thrown error above
				return {
					content: [
						{
							type: "text",
							text: "❌ Query validation failed: Unexpected validation state",
						},
					],
				};
			} catch (error: unknown) {
				// If it's our custom validation error, the query was valid.
				if (error instanceof ValidationError) {
					return {
						content: [{ type: "text", text: "✅ Query is valid" }],
					};
				}
				// Any other error indicates a problem with the query
				return {
					content: [
						{
							type: "text",
							text: `❌ Query validation failed: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
				};
			}
		},
	);
}
