import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAvailableInstances, getDatabaseClient } from "../database.js";
import { getDefaultConnection, setDefaultConnection } from "../session.js";

export function registerExecuteEdgeql(server: McpServer) {
	server.registerTool(
		"execute-edgeql",
		{
			title: "Execute EdgeQL Query",
			description:
				"Executes an EdgeQL query against the database. If no instance/branch is specified, uses the current default connection.",
			inputSchema: {
				query: z.string(),
				args: z.record(z.string(), z.any()).optional(),
				instance: z.string().optional(),
				branch: z.string().optional(),
			},
		},
		async (args) => {
			try {
				// Smart default connection handling
				let instance = args.instance;
				let branch = args.branch;

				if (!instance) {
					const defaultConnection = getDefaultConnection();
					instance = defaultConnection.defaultInstance;
					branch = branch || defaultConnection.defaultBranch;

					// If no default instance, try to auto-set one
					if (!instance) {
						const availableInstances = getAvailableInstances();
						if (availableInstances.length > 0) {
							instance = availableInstances[0];
							branch = branch || "dev"; // Default to dev branch
							setDefaultConnection(instance, branch);
						}
					}
				}

				const gelClient = getDatabaseClient({
					instance,
					branch,
				});

				if (!gelClient) {
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
					result = await gelClient.query(args.query, args.args);
				} else {
					result = await gelClient.query(args.query);
				}

				return {
					content: [
						{
							type: "text" as const,
							text: `✅ Query executed successfully:\n${JSON.stringify(result, null, 2)}`,
						},
					],
				};
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
