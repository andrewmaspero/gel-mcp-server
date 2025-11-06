import fs from "node:fs";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
	buildStructuredResponse,
	getClientWithDefaults,
	safeJsonStringify,
	validateConnectionArgs,
} from "../utils.js";
import { checkRateLimit, validateQueryArgs } from "../validation.js";
import { MAX_INLINE_RESPONSE_CHARS } from "../constants.js";
import { createEphemeralTextResource } from "../resources/index.js";
import { requestSampling } from "../sampling.js";
import { errorResponseFromError } from "../errors.js";
import { QueryResponseSchema } from "../types/query.js";

const VALIDATION_SUCCESS_FLAG = "QUERY_VALIDATION_SUCCESS";

type ToolResult = CallToolResult;

type RunResultOptions = {
	action: "run" | "file";
	title: string;
	rows: unknown;
	format: "json" | "text";
	renderedResult: string;
	queryText: string;
	instance: string;
	branch?: string;
	autoSelected: boolean;
	limitApplied?: number;
	filePath?: string;
	sanitizedArgs?: Record<string, unknown>;
	samplingSummary?: string;
	diagnostics?: string[];
};

function buildRunResponse(options: RunResultOptions): ToolResult {
	const rowCount = Array.isArray(options.rows)
		? options.rows.length
		: options.rows === null || options.rows === undefined
			? 0
			: 1;

	const preview = options.renderedResult.slice(0, MAX_INLINE_RESPONSE_CHARS);
	const rowsTruncated = options.renderedResult.length > MAX_INLINE_RESPONSE_CHARS;
	const mimeType = options.format === "text" ? "text/plain" : "application/json";
	const resourceUri = rowsTruncated
		? createEphemeralTextResource(options.renderedResult, {
				mimeType,
			})
		: undefined;

	const diagnostics: string[] = [...(options.diagnostics ?? [])];
	if (rowsTruncated) {
		diagnostics.push(
			`Inline preview limited to ${MAX_INLINE_RESPONSE_CHARS.toLocaleString()} characters. Use the resource link to retrieve the full result set.`,
		);
	}
	if (options.samplingSummary) {
		diagnostics.push(`AI summary: ${options.samplingSummary}`);
	}

	const resourceLinks = resourceUri
		? [
				{
					type: "resource_link" as const,
					uri: resourceUri,
					name: `query.${options.action}.result`,
					title: "Full query result",
					description:
						"Complete payload returned from the last query execution.",
					mimeType,
				},
			]
		: undefined;

	const textSections = options.format === "text"
		? [...diagnostics, preview]
		: diagnostics;

	return buildStructuredResponse({
		status: "success",
		title: options.title,
		textSections: textSections.length ? textSections : undefined,
		jsonData: options.format === "json" ? options.rows : undefined,
		resourceLinks,
		data: {
			action: options.action,
			status: "ok",
			message: options.title,
			instance: options.instance,
			branch: options.branch,
			autoSelected: options.autoSelected ? true : undefined,
			rowCount,
			limitApplied: options.limitApplied,
			format: options.format,
			resultPreview: preview,
			rowsTruncated: rowsTruncated || undefined,
			argsUsed: options.sanitizedArgs,
			query: options.queryText,
			filePath: options.filePath,
			resourceUri,
			samplingSummary: options.samplingSummary,
			diagnostics,
		},
	}) as unknown as ToolResult;
}

export function registerQuery(server: McpServer) {
	server.registerTool(
		"query",
		{
			title: "Query (Validate, Run, File)",
			description:
				"Consolidated query tool. Actions: 'validate', 'run', 'file'. Supports args validation, default LIMITs, and safe text output mode.",
			inputSchema: {
				action: z.enum(["validate", "run", "file"]).optional(),
				query: z.string().optional(),
				args: z.record(z.string(), z.any()).optional(),
				filePath: z.string().optional(),
				format: z.enum(["json", "text"]).optional(),
				limit: z.number().optional(),
				timeout: z.number().optional(),
				dryRun: z.boolean().optional(),
				instance: z.string().optional(),
				branch: z.string().optional(),
			},
			outputSchema: QueryResponseSchema.shape,
		},
		async (args): Promise<ToolResult> => {
			checkRateLimit("query");
			validateConnectionArgs(args);
			const { client, instance, branch, autoSelected } =
				getClientWithDefaults(args);
			const action = args.action ?? "validate";
			const autoSelectedFlag = Boolean(autoSelected);

			if (!client || !instance) {
				const suggestion =
					'Try: @[connection auto] or @[connection.set instance="<NAME>" branch="main"] before invoking @[query]';
				return buildStructuredResponse({
					status: "error",
					title: "Database client could not be initialized",
					textSections: [suggestion],
					data: {
						action,
						status: "error",
						message: "Database client could not be initialized",
						diagnostics: ["Unable to resolve default connection.", suggestion],
					},
				}) as unknown as ToolResult;
			}

			const limit = Math.max(1, Math.min(args.limit ?? 50, 1000));
			const baseFormat = args.format ?? "json";
			let sanitizedArgs: Record<string, unknown> | undefined;
			let queryText = args.query;

			try {
				if (args.args) {
					sanitizedArgs = validateQueryArgs(args.args);
				}

				if (action === "file") {
					if (!args.filePath) {
						return buildStructuredResponse({
							status: "error",
							title: "Missing 'filePath'",
							textSections: [
								"Provide a path to the EdgeQL file via the 'filePath' parameter.",
							],
							data: {
								action: "file",
								status: "error",
								message: "Missing 'filePath'",
								diagnostics: ["filePath parameter is required."],
							},
						}) as unknown as ToolResult;
					}
					const resolved = path.isAbsolute(args.filePath)
						? args.filePath
						: path.resolve(process.cwd(), args.filePath);
					if (!fs.existsSync(resolved)) {
						return buildStructuredResponse({
							status: "error",
							title: `File not found: ${resolved}`,
							textSections: [
								"Ensure the query file exists and that the process has read access to it.",
							],
							data: {
								action: "file",
								status: "error",
								message: `File not found: ${resolved}`,
								diagnostics: ["File does not exist."],
							},
						}) as unknown as ToolResult;
					}
					const fileQuery = fs.readFileSync(resolved, "utf8").trim();
					if (!fileQuery) {
						return buildStructuredResponse({
							status: "error",
							title: "File is empty",
							textSections: [
								"Populate the file with a valid EdgeQL query before executing.",
							],
							data: {
								action: "file",
								status: "error",
								message: "File is empty",
								diagnostics: ["No query text detected in the provided file."],
							},
						}) as unknown as ToolResult;
					}
					queryText = fileQuery;
					const rows = await client.query(fileQuery, sanitizedArgs as any);
					const rendered = safeJsonStringify(rows);
					const sampling = await requestSampling({
						purpose:
							"Summarize EdgeQL query results for downstream reasoning.",
						maxTokens: 200,
						messages: [
							{
								role: "system",
								content:
									"You are summarizing EdgeQL query results. Provide a concise bullet summary highlighting row count and key fields.",
							},
							{
								role: "user",
								content: `Summarize the following JSON (may be truncated):\n${rendered.slice(
									0,
									MAX_INLINE_RESPONSE_CHARS,
								)}`,
							},
						],
					});
					return buildRunResponse({
						action: "file",
						title: `Executed file: ${path.basename(resolved)}`,
						rows,
						format: "json",
						renderedResult: rendered,
						queryText: fileQuery,
						instance,
						branch,
						autoSelected: autoSelectedFlag,
						filePath: resolved,
						sanitizedArgs,
						samplingSummary: sampling?.summary,
						diagnostics: [`Read query from ${resolved}`],
					});
				}

				if (!queryText) {
					return buildStructuredResponse({
						status: "error",
						title: "Missing 'query'",
						textSections: ["Provide the EdgeQL query via the 'query' parameter."],
						data: {
							action,
							status: "error",
							message: "Missing 'query'",
							diagnostics: ["query parameter is required for this action."],
						},
					}) as unknown as ToolResult;
				}

				if (action === "validate") {
					await client.transaction(async (tx) => {
						await tx.query(queryText as string, sanitizedArgs as any);
						throw new Error(VALIDATION_SUCCESS_FLAG);
					});
					throw new Error(VALIDATION_SUCCESS_FLAG);
				}

				// run
				let finalQuery = queryText;
				let limitApplied: number | undefined;
				if (/^\s*SELECT\b/i.test(queryText) && !/\bLIMIT\b/i.test(queryText)) {
					finalQuery = `${queryText}\nLIMIT ${limit}`;
					limitApplied = limit;
				}
				const rows = await client.query(finalQuery, sanitizedArgs as any);
				const format = baseFormat;

				if (format === "text") {
					const textResult = Array.isArray(rows)
						? rows
							.slice(0, limit)
							.map((row) =>
								typeof row === "string" ? row : safeJsonStringify(row),
							)
							.join("\n")
						: String(rows);
					return buildRunResponse({
						action: "run",
						title: "Query executed",
						rows,
						format: "text",
						renderedResult: textResult,
						queryText,
						instance,
						branch,
						autoSelected: autoSelectedFlag,
						limitApplied,
						sanitizedArgs,
					});
				}

				const serialized = safeJsonStringify(rows);
				const sampling = await requestSampling({
					purpose:
						"Summarize EdgeQL query results for downstream reasoning.",
					maxTokens: 200,
					messages: [
						{
							role: "system",
							content:
								"You are summarizing EdgeQL query results. Provide a concise bullet summary highlighting row count and key fields.",
						},
						{
							role: "user",
							content: `Summarize the following JSON (may be truncated):\n${serialized.slice(
								0,
								MAX_INLINE_RESPONSE_CHARS,
							)}`,
						},
					],
				});

				return buildRunResponse({
					action: "run",
					title: "Query executed",
					rows,
					format: "json",
					renderedResult: serialized,
					queryText,
					instance,
					branch,
					autoSelected: autoSelectedFlag,
					limitApplied,
					sanitizedArgs,
					samplingSummary: sampling?.summary,
				});
			} catch (err: unknown) {
				if (err instanceof Error && err.message === VALIDATION_SUCCESS_FLAG) {
					return buildStructuredResponse({
						status: "success",
						title: "Query is valid",
						textSections: [
							"Executed inside a rolled-back transaction; no changes were committed.",
						],
						data: {
							action: "validate",
							status: "ok",
							message: "Query is valid",
							instance,
							branch,
							autoSelected: autoSelectedFlag ? true : undefined,
							query: queryText,
							argsUsed: sanitizedArgs,
							diagnostics: [],
						},
					}) as unknown as ToolResult;
				}

				const normalized = errorResponseFromError(err, {
					fallbackTitle: "Query execution failed",
					additionalContext: [
						"Inspect the error details above and adjust the EdgeQL query or parameters.",
					],
					nextSteps: [
						"Consider re-running @[query action=\"validate\" ...] before executing again.",
						"If the issue persists, capture logs via @[schema action=\"describe\"] to verify schema alignment.",
					],
				});
				const textSections = normalized.textSections.slice();
				if (normalized.errorCode) {
					textSections.unshift(`Error code: ${normalized.errorCode}`);
				}
				if (normalized.retryAfterMs !== undefined) {
					textSections.push(
						`Retry after ${Math.ceil(normalized.retryAfterMs / 1000)}s before retrying the request.`,
					);
				}
				if (normalized.timeoutMs !== undefined) {
					textSections.push(
						`Operation timed out after ${normalized.timeoutMs}ms. Consider reducing result size or increasing the timeout parameter.`,
					);
				}
				return buildStructuredResponse({
					status: normalized.status,
					title: normalized.title,
					textSections,
					nextSteps: normalized.nextSteps,
					data: {
						action,
						status: "error",
						message: normalized.title,
						instance,
						branch,
						autoSelected: autoSelectedFlag ? true : undefined,
						query: queryText,
						argsUsed: sanitizedArgs,
						diagnostics: textSections,
						errorCode: normalized.errorCode,
						retryAfterMs: normalized.retryAfterMs,
						timeoutMs: normalized.timeoutMs,
						statusCode: normalized.statusCode,
						context: normalized.context,
					},
				}) as unknown as ToolResult;
			}
		},
	);
}
