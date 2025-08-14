// Deprecated tool: replaced by consolidated 'connection' tool (listCredentials)
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listInstances } from "../../database.js";

export function registerListCredentials(server: McpServer) {
	server.registerTool(
		"list-credentials",
		{
			title: "List Available Credential Files",
			description:
				"Lists all available instance credential files in the instance_credentials directory.",
		},
		async () => {
			try {
				const instances = await listInstances();
				if (instances.length === 0) {
					return {
						content: [
							{
								type: "text",
								text: "No credential files found. Create 'instance_credentials' and add JSON files.",
							},
						],
					};
				}
				return {
					content: [
						{
							type: "text",
							text: `Available credential files (${instances.length}): ${instances.join(", ")}`,
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
