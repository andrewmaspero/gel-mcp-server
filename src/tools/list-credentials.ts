import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listInstances } from "../database.js";

export function registerListCredentials(server: McpServer) {
	server.registerTool(
		"list-credentials",
		{
			title: "List Available Credential Files",
			description:
				"Lists all available instance credential files in the instance_credentials directory. Each credential file corresponds to a database instance you can connect to.",
		},
		async () => {
			try {
				const instances = await listInstances();

				if (instances.length === 0) {
					return {
						content: [
							{
								type: "text",
								text: "No credential files found in the instance_credentials directory.",
							},
						],
					};
				}

				const instanceList = instances
					.map((instance) => `- ${instance}`)
					.join("\n");

				return {
					content: [
						{
							type: "text",
							text: `Available credential files:\n${instanceList}`,
						},
					],
				};
			} catch (error: unknown) {
				return {
					content: [
						{
							type: "text",
							text: `Error listing credentials: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
				};
			}
		},
	);
}
