import fs from "node:fs";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findProjectRoot, getDatabaseClient } from "../database.js";
import { createLogger } from "../logger.js";
import { validateEdgeQLQuery } from "../validation.js";

const logger = createLogger("executeEdgeqlFile");

export function registerExecuteEdgeqlFile(server: McpServer) {
	server.registerTool(
		"execute-edgeql-file",
		{
			title: "Execute EdgeQL Query from File",
			description:
				"Executes an EdgeQL query from a .edgeql file with optional parameters and data. " +
				"This is useful for complex queries that are too long to include inline. " +
				"Parameters can be provided as JSON object or individual arguments. " +
				"Data can be loaded from a JSON file and made available as $data parameter.",
			inputSchema: {
				file_path: z
					.string()
					.describe(
						"Path to the .edgeql file (relative to project root or absolute)",
					),
				data_file: z
					.string()
					.optional()
					.describe(
						"Path to a JSON file containing data to inject as $data parameter (relative to project root or absolute)",
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
				// Resolve file path - use project root for relative paths
				let filePath = args.file_path;
				if (!path.isAbsolute(filePath)) {
					// If relative path, resolve from project root
					const projectRoot = findProjectRoot();
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

				// Handle data file if provided
				if (args.data_file) {
					let dataFilePath = args.data_file;
					if (!path.isAbsolute(dataFilePath)) {
						const projectRoot = findProjectRoot();
						dataFilePath = path.resolve(projectRoot, dataFilePath);
					}

					// Check if data file exists
					if (!fs.existsSync(dataFilePath)) {
						return {
							content: [
								{
									type: "text" as const,
									text: `❌ Data file not found: ${dataFilePath}`,
								},
							],
						};
					}

					// Check data file extension
					if (!dataFilePath.endsWith(".json")) {
						return {
							content: [
								{
									type: "text" as const,
									text: `❌ Data file must have .json extension. Got: ${path.extname(dataFilePath)}`,
								},
							],
						};
					}

					try {
						const dataContent = fs.readFileSync(dataFilePath, "utf8");
						const jsonData = JSON.parse(dataContent);

						// Inject data as $data parameter
						queryArgs.data = jsonData;

						logger.info("Loaded data file", {
							dataFile: dataFilePath,
							dataSize: JSON.stringify(jsonData).length,
							dataType: Array.isArray(jsonData) ? "array" : typeof jsonData,
							itemCount: Array.isArray(jsonData) ? jsonData.length : undefined,
						});
					} catch (dataError) {
						return {
							content: [
								{
									type: "text" as const,
									text: `❌ Error reading data file: ${dataError instanceof Error ? dataError.message : String(dataError)}`,
								},
							],
						};
					}
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
					hasDataFile: !!args.data_file,
				});

				let result: unknown;
				if (Object.keys(queryArgs).length > 0) {
					result = await gelClient.query(queryContent, queryArgs);
				} else {
					result = await gelClient.query(queryContent);
				}

				const outputParts = [];
				outputParts.push(
					`✅ Query executed successfully from: ${path.basename(filePath)}`,
				);
				outputParts.push(
					`📄 File: ${path.relative(findProjectRoot(), filePath)}`,
				);

				if (args.data_file) {
					outputParts.push(
						`📊 Data: ${path.relative(findProjectRoot(), args.data_file)}`,
					);
				}

				if (Object.keys(queryArgs).length > 0) {
					outputParts.push(
						`🔧 Parameters: ${JSON.stringify(
							// Hide the data content in output for readability
							Object.fromEntries(
								Object.entries(queryArgs).map(([key, value]) =>
									key === "data"
										? [
												key,
												`<${Array.isArray(value) ? `array[${value.length}]` : typeof value}>`,
											]
										: [key, value],
								),
							),
							null,
							2,
						)}`,
					);
				}

				outputParts.push(`📊 Result:\n${JSON.stringify(result, null, 2)}`);

				return {
					content: [
						{
							type: "text" as const,
							text: outputParts.join("\n\n"),
						},
					],
				};
			} catch (error: unknown) {
				logger.error("EdgeQL file execution error:", {
					error: error instanceof Error ? error.message : String(error),
					file: args.file_path,
					dataFile: args.data_file,
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
