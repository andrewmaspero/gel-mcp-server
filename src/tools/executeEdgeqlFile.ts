import fs from "node:fs";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDatabaseClient } from "../database.js";
import { createLogger } from "../logger.js";
import { validateEdgeQLQuery } from "../validation.js";

const logger = createLogger("executeEdgeqlFile");

export function registerExecuteEdgeqlFile(server: McpServer) {
	server.registerTool(
		"execute-edgeql-file",
		{
			title: "Execute EdgeQL Query from File",
			description:
				"Executes an EdgeQL query from a .edgeql file with optional parameters. " +
				"This is useful for complex queries that are too long to include inline. " +
				"Parameters can be provided as JSON object or individual arguments.",
			inputSchema: {
				file_path: z
					.string()
					.describe(
						"Path to the .edgeql file (relative to project root or absolute)",
					),
				args: z
					.record(z.string(), z.any())
					.optional()
					.describe("Query parameters as key-value pairs"),
				json_args: z
					.string()
					.optional()
					.describe("Query parameters as JSON string (alternative to args)"),
				instance: z.string().optional(),
				branch: z.string().optional(),
			},
		},
		async (args) => {
			try {
				// Resolve file path
				let filePath = args.file_path;
				if (!path.isAbsolute(filePath)) {
					// If relative path, resolve from project root
					const projectRoot = process.cwd();
					filePath = path.resolve(projectRoot, filePath);
				}

				// Check if file exists
				if (!fs.existsSync(filePath)) {
					return {
						content: [
							{
								type: "text" as const,
								text: `❌ File not found: ${filePath}`,
							},
						],
					};
				}

				// Check file extension
				if (!filePath.endsWith(".edgeql")) {
					return {
						content: [
							{
								type: "text" as const,
								text: `❌ File must have .edgeql extension. Got: ${path.extname(filePath)}`,
							},
						],
					};
				}

				// Read the query from file
				const queryContent = fs.readFileSync(filePath, "utf8").trim();

				if (!queryContent) {
					return {
						content: [
							{
								type: "text" as const,
								text: `❌ File is empty: ${filePath}`,
							},
						],
					};
				}

				// Parse parameters
				let queryArgs: Record<string, unknown> = {};

				if (args.json_args) {
					try {
						queryArgs = JSON.parse(args.json_args);
					} catch (parseError) {
						return {
							content: [
								{
									type: "text" as const,
									text: `❌ Invalid JSON in json_args: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
								},
							],
						};
					}
				} else if (args.args) {
					queryArgs = args.args;
				}

				// Validate the query
				try {
					validateEdgeQLQuery(queryContent);
				} catch (validationError) {
					return {
						content: [
							{
								type: "text" as const,
								text: `❌ Query validation failed: ${validationError instanceof Error ? validationError.message : String(validationError)}`,
							},
						],
					};
				}

				// Get database client
				const gelClient = getDatabaseClient({
					instance: args.instance,
					branch: args.branch,
				});

				if (!gelClient) {
					return {
						content: [
							{
								type: "text" as const,
								text: "❌ Database client could not be initialized.",
							},
						],
					};
				}

				// Execute the query
				logger.info("Executing EdgeQL file", {
					file: filePath,
					hasArgs: Object.keys(queryArgs).length > 0,
					argKeys: Object.keys(queryArgs),
				});

				let result: unknown;
				if (Object.keys(queryArgs).length > 0) {
					result = await gelClient.query(queryContent, queryArgs);
				} else {
					result = await gelClient.query(queryContent);
				}

				return {
					content: [
						{
							type: "text" as const,
							text: `✅ Query executed successfully from: ${path.basename(filePath)}`,
						},
						{
							type: "text" as const,
							text: `📄 File: ${filePath}`,
						},
						...(Object.keys(queryArgs).length > 0
							? [
									{
										type: "text" as const,
										text: `🔧 Parameters: ${JSON.stringify(queryArgs, null, 2)}`,
									},
								]
							: []),
						{
							type: "text" as const,
							text: `📊 Result:\n${JSON.stringify(result, null, 2)}`,
						},
					],
				};
			} catch (error: unknown) {
				logger.error("EdgeQL file execution error:", {
					error: error instanceof Error ? error.message : String(error),
					file: args.file_path,
				});

				return {
					content: [
						{
							type: "text" as const,
							text: `❌ Error executing query from file: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
				};
			}
		},
	);
}
