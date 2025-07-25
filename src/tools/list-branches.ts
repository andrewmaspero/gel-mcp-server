import { execSync } from "node:child_process";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDefaultConnection } from "../session.js";

export function registerListBranches(server: McpServer) {
	server.registerTool(
		"list-branches",
		{
			title: "List Branches",
			description:
				"Lists all available branches for a specific Gel database instance. Use this to see what branches are available before switching or querying a specific branch.",
			inputSchema: {
				instance: z.string().optional(),
			},
		},
		async (args) => {
			const defaultConnection = getDefaultConnection();
			const instance = args.instance || defaultConnection.defaultInstance;

			if (!instance) {
				return {
					content: [
						{
							type: "text",
							text: "No instance specified and no default instance set. Please provide an instance name.",
						},
					],
				};
			}

			try {
				// Get branches using the CLI (without --format=json as it's not supported)
				const output = execSync(`gel branch list --instance=${instance}`, {
					encoding: "utf8",
					timeout: 10000,
				});

				// Parse the text output to extract branch names
				const lines = output.trim().split("\n");
				const branches: Array<{ name: string; current: boolean }> = [];

				for (const line of lines) {
					const trimmedLine = line.trim();
					if (
						trimmedLine &&
						!trimmedLine.startsWith("Available branches") &&
						!trimmedLine.startsWith("---")
					) {
						// Check if this line contains a branch name
						// Format is usually: "* branch_name" for current or "  branch_name" for others
						const currentMatch = trimmedLine.match(/^\*\s+(.+)$/);
						const regularMatch = trimmedLine.match(/^\s+(.+)$/);

						if (currentMatch) {
							branches.push({ name: currentMatch[1].trim(), current: true });
						} else if (regularMatch && !currentMatch) {
							branches.push({ name: regularMatch[1].trim(), current: false });
						} else if (trimmedLine && !trimmedLine.includes(" ")) {
							// Simple branch name without prefix
							branches.push({ name: trimmedLine, current: false });
						}
					}
				}

				if (branches.length > 0) {
					const branchList = branches
						.map(
							(branch) =>
								`- ${branch.name}${branch.current ? " (current)" : ""}`,
						)
						.join("\n");

					return {
						content: [
							{
								type: "text" as const,
								text: `Available branches for instance '${instance}':\n${branchList}`,
							},
						],
					};
				}

				return {
					content: [
						{
							type: "text" as const,
							text: `No branches found for instance '${instance}'. Raw output:\n${output}`,
						},
					],
				};
			} catch (error: unknown) {
				return {
					content: [
						{
							type: "text",
							text: `Error listing branches: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
				};
			}
		},
	);
}
