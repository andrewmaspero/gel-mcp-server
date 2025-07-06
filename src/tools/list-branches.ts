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
				// Get branches using the CLI
				const output = execSync(
					`gel branch list --instance=${instance} --format=json`,
					{
						encoding: "utf8",
						timeout: 10000,
					},
				);

				try {
					const branches = JSON.parse(output);
					if (Array.isArray(branches) && branches.length > 0) {
						const branchList = branches
							.map(
								(branch: { name: string; current?: boolean }) =>
									`- ${branch.name}${branch.current ? " (current)" : ""}`,
							)
							.join("\n");

						return {
							content: [
								{
									type: "text",
									text: `Available branches for instance '${instance}':\n${branchList}`,
								},
							],
						};
					}
					return {
						content: [
							{
								type: "text",
								text: `No branches found for instance '${instance}'.`,
							},
						],
					};
				} catch (parseError: unknown) {
					return {
						content: [
							{
								type: "text",
								text: `Failed to parse branch list output: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
							},
						],
					};
				}
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
