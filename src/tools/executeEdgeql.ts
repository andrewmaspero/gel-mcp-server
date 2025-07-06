import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDatabaseClient } from "../database.js";

export function registerExecuteEdgeql(server: McpServer) {
	server.registerTool(
		"execute-edgeql",
		{
			title: "Execute EdgeQL Query",
			description:
				"Executes a raw EdgeQL query against the database. Use this for any database read or write operations. EdgeQL is a modern query language for graph-relational databases. Example: `SELECT User { name, email }`.",
			inputSchema: {
				query: z.string(),
				args: z.record(z.string(), z.any()).optional(),
				instance: z.string().optional(),
				branch: z.string().optional(),
			},
		},
		async (args) => {
			try {
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

				let result: unknown;
				if (args.args && Object.keys(args.args).length > 0) {
					result = await gelClient.query(args.query, args.args);
				} else {
					result = await gelClient.query(args.query);
				}
				return {
					content: [
						{ type: "text", text: "Query executed successfully:" },
						{ type: "text", text: JSON.stringify(result, null, 2) },
					],
				};
			} catch (error: unknown) {
				return {
					content: [
						{
							type: "text",
							text: `Error executing query: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
				};
			}
		},
	);
}
