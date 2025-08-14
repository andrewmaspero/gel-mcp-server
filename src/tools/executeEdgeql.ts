import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAvailableInstances } from "../database.js";
import {
    getClientWithDefaults,
    getConnectionStatusMessage,
    buildToolResponse,
} from "../utils.js";
import { checkRateLimit, validateQueryArgs } from "../validation.js";
import { validateConnectionArgs } from "../utils.js";

export function registerExecuteEdgeql(server: McpServer) {
	server.registerTool(
		"execute-edgeql",
		{
			title: "Execute EdgeQL Query",
			description:
				"Executes an EdgeQL query against the database. Uses the current default connection if no instance/branch is specified.",
			inputSchema: {
				query: z.string(),
				args: z.record(z.string(), z.any()).optional(),
				instance: z.string().optional(),
				branch: z.string().optional(),
			},
		},
		async (args) => {
			try {
				// Rate limit execute
				checkRateLimit("execute-edgeql", true);
                // Validate optional instance/branch
                validateConnectionArgs(args);

				const { client, instance, branch, autoSelected } =
					getClientWithDefaults(args);

				if (!client || !instance) {
					const availableInstances = getAvailableInstances();
					const instanceList =
						availableInstances.length > 0
							? `Available instances: ${availableInstances.join(", ")}`
							: "No instances found. Please add credential files to the instance_credentials directory.";

					return {
						content: [
							{
								type: "text" as const,
								text: `❌ Database client could not be initialized.\n${instanceList}`,
							},
						],
					};
				}

				let result: unknown;
				if (args.args && Object.keys(args.args).length > 0) {
					const sanitizedArgs = validateQueryArgs(
						args.args as Record<string, unknown>,
					);
					result = await client.query(args.query, sanitizedArgs);
				} else {
					result = await client.query(args.query);
				}

				const statusMessage = getConnectionStatusMessage(
					instance,
					branch,
					autoSelected,
				);
                return buildToolResponse({
                    status: "success",
                    title: "Query executed successfully",
                    statusMessage,
                    jsonData: result,
                });
			} catch (error: unknown) {
				return {
					content: [
						{
							type: "text" as const,
							text: `❌ Error executing query: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
				};
			}
		},
	);
}
