import { execSync } from "node:child_process";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { emitConnectionChanged } from "../events.js";
import { updateSchemaWatcher } from "../schemaWatcher.js";
import { getDefaultConnection } from "../session.js";
import {
	checkRateLimit,
	validateBranchName,
	validateInstanceName,
} from "../validation.js";

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
				checkRateLimit("switch-branch", true);
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

				try {
					validateInstanceName(instance);
					validateBranchName(args.branch);
				} catch (err) {
					return {
						content: [
							{
								type: "text",
								text: `Invalid input: ${err instanceof Error ? err.message : String(err)}`,
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
					emitConnectionChanged({ instance, branch: args.branch });
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
