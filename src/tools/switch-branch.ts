import { execSync } from "node:child_process";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { updateSchemaWatcher } from "../http.js";
import { getDefaultConnection } from "../session.js";

export function registerSwitchBranch(server: McpServer) {
	server.registerTool(
		"switch-branch",
		{
			title: "Switch Branch",
			description:
				"Switches the active branch for a given instance. This is a persistent change for the environment. Consider using `set-default-connection` to manage session-specific branches.",
			inputSchema: {
				instance: z.string().optional(),
				branch: z.string(),
			},
		},
		async (args) => {
			try {
				const session = getDefaultConnection();
				const instance = args.instance || session.defaultInstance;

				if (!instance) {
					return {
						content: [
							{
								type: "text",
								text: "Error: No instance provided and no default instance is set. Use `set-default-connection` or provide an instance name.",
							},
						],
					};
				}

				execSync(
					`npx gel branch switch ${args.branch} --instance ${instance}`,
					{
						encoding: "utf-8",
					},
				);

				// Update schema watcher if this affects the current default connection
				if (instance === session.defaultInstance) {
					updateSchemaWatcher();
				}

				return {
					content: [
						{
							type: "text",
							text: `Successfully switched to branch '${args.branch}' on instance '${instance}'.`,
						},
					],
				};
			} catch (error: unknown) {
				return {
					content: [
						{
							type: "text",
							text: `Error switching branch: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
				};
			}
		},
	);
}
