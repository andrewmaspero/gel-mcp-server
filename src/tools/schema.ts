import { execSync as exec } from "node:child_process";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { findProjectRoot } from "../database.js";
import {
	buildStructuredResponse,
	getClientWithDefaults,
	getConnectionStatusMessage,
	safeJsonStringify,
	validateConnectionArgs,
} from "../utils.js";
import { checkRateLimit, validateSchemaTypeName } from "../validation.js";
import { MAX_INLINE_RESPONSE_CHARS } from "../constants.js";
import { createEphemeralTextResource } from "../resources/index.js";
import { requestSampling } from "../sampling.js";
import { runElicitation } from "../elicitation.js";
import { errorResponseFromError } from "../errors.js";
import { SchemaResponseSchema } from "../types/schema.js";

const STATUS_MAP = {
	success: "ok",
	error: "error",
	info: "info",
	warn: "warn",
} as const;

type ResourceLink = {
	type: "resource_link";
	uri: string;
	name: string;
	title?: string;
	description?: string;
	mimeType?: string;
};

function prepareJsonPayload(
	data: unknown,
	opts: { name: string; title: string; description: string },
) {
	const serialized = safeJsonStringify(data);
	const truncated = serialized.length > MAX_INLINE_RESPONSE_CHARS;
	const resourceLinks: ResourceLink[] | undefined = truncated
		? [
				{
					type: "resource_link",
					uri: createEphemeralTextResource(serialized, {
						mimeType: "application/json",
					}),
					name: opts.name,
					title: opts.title,
					description: opts.description,
					mimeType: "application/json",
				},
			]
		: undefined;
	return {
		serialized,
		truncated,
		resourceLinks,
		resourceUri: resourceLinks?.[0]?.uri,
	};
}

type SchemaResponseOptions = {
	action: "overview" | "types" | "describe" | "refresh";
	status: "success" | "error" | "info" | "warn";
	title: string;
	instance?: string;
	branch?: string;
	autoSelected?: boolean;
	textSections?: string[];
	nextSteps?: string[];
	resourceLinks?: ResourceLink[];
	diagnostics?: string[];
	listedTypes?: string[];
	overview?: {
		types: string[];
		totalTypes: number;
		truncated?: boolean;
		resourceUri?: string;
		summary?: string;
	};
	describe?: {
		typeName: string;
		definition?: unknown;
		truncated?: boolean;
		resourceUri?: string;
		summary?: string;
	};
	refresh?: {
		status: "queued" | "processing" | "succeeded" | "failed";
		command?: string;
		durationMs?: number;
		notes?: string[];
		logResourceUri?: string;
		reason?: string;
	};
	resourceUri?: string;
	errorCode?: string;
	retryAfterMs?: number;
	timeoutMs?: number;
	statusCode?: number;
	context?: Record<string, unknown>;
};

function buildSchemaResponse(options: SchemaResponseOptions): CallToolResult {
	const textSections = options.textSections ?? [];
	const diagnostics = options.diagnostics ?? textSections;
	const resourceUri = options.resourceUri ?? options.resourceLinks?.[0]?.uri;
	return buildStructuredResponse({
		status: options.status,
		title: options.title,
		textSections: textSections.length ? textSections : undefined,
		nextSteps: options.nextSteps,
		resourceLinks: options.resourceLinks,
		data: {
			action: options.action,
			status: STATUS_MAP[options.status],
			message: options.title,
			instance: options.instance,
			branch: options.branch,
			autoSelected: options.autoSelected ? true : undefined,
			listedTypes: options.listedTypes,
			overview: options.overview,
			describe: options.describe,
			refresh: options.refresh,
			resourceUri,
			diagnostics,
			errorCode: options.errorCode,
			retryAfterMs: options.retryAfterMs,
			timeoutMs: options.timeoutMs,
			statusCode: options.statusCode,
			context: options.context,
		},
	}) as unknown as CallToolResult;
}

const LIST_TYPES_QUERY = `
	WITH module schema
	SELECT ObjectType { name }
	FILTER .name LIKE 'default::%'
	ORDER BY .name;
`;

const DESCRIBE_QUERY = `
	WITH module schema
	SELECT ObjectType {
		name,
		properties: { name, target: { name }, cardinality, required },
		links: { name, target: { name }, cardinality, required }
	}
	FILTER .name = <str>$typeName;
`;

const OVERVIEW_QUERY = `
	SELECT schema::ObjectType {
		name,
		properties: { name, target: { name } },
		links: { name, target: { name } }
	}
	FILTER NOT .name LIKE 'schema::%'
		AND NOT .name LIKE 'sys::%'
		AND NOT .name LIKE 'cfg::%'
		AND NOT .name LIKE 'cal::%';
`;

export function registerSchema(server: McpServer) {
	server.registerTool(
		"schema",
		{
			title: "Schema (Overview, Types, Describe, Refresh)",
			description:
				"Consolidated schema utility. Actions: 'overview' (default), 'types', 'describe', 'refresh'. Includes sensible defaults and suggested next tool calls to reduce errors.",
			inputSchema: {
				action: z.enum(["overview", "types", "describe", "refresh"]).optional(),
				typeName: z.string().optional(),
				instance: z.string().optional(),
				branch: z.string().optional(),
				topK: z.number().optional(),
				confirm: z.boolean().optional(),
			},
			outputSchema: SchemaResponseSchema.shape,
		},
		async (args): Promise<CallToolResult> => {
			checkRateLimit("schema");
			validateConnectionArgs(args);

			const { client, instance, branch, autoSelected } =
				getClientWithDefaults(args);
			const action = args.action ?? "overview";

			if (!client || !instance) {
				const message =
					"Database client could not be initialized. Run @[connection.auto] or @[connection.set instance=\"<NAME>\" branch=\"main\"].";
				return buildStructuredResponse({
					status: "error",
					title: "Schema tool unavailable",
					textSections: [message],
					data: {
						action,
						status: "error",
						message: "Schema tool unavailable",
						diagnostics: [message],
					},
				}) as unknown as CallToolResult;
			}

			const autoSelectedFlag = Boolean(autoSelected);
			const statusMessage = getConnectionStatusMessage(
				instance,
				branch,
				autoSelected,
			);

			try {
				switch (action) {
					case "types": {
						const result = await client.query(LIST_TYPES_QUERY);
						const types = (result as { name: string }[]).map((t) =>
							t.name.replace("default::", ""),
						);
						const topK = Math.max(1, Math.min(args.topK ?? 30, 100));
						const preview = types.slice(0, topK);
						const prepared = prepareJsonPayload(types, {
							name: "schema.types.list",
							title: "Schema type list",
							description:
								"Complete list of schema type names returned by the schema tool.",
						});
						const diagnostics = [
							`Found ${types.length} type(s). Showing first ${preview.length}: ${preview.join(", ")}`,
							"Suggested next step: describe a type (replace <Type>):",
							'@[schema action="describe" typeName="<Type>"]',
						];
						if (prepared.truncated) {
							diagnostics.push(
								`Full list stored in resource link to stay within ${MAX_INLINE_RESPONSE_CHARS.toLocaleString()} character limit.`,
							);
						}
						return buildSchemaResponse({
							action: "types",
							status: "success",
							title: `Schema types${statusMessage}`,
							instance,
							branch,
							autoSelected: autoSelectedFlag,
							textSections: diagnostics,
							diagnostics,
							resourceLinks: prepared.resourceLinks,
							resourceUri: prepared.resourceUri,
							listedTypes: types,
						});
					}
					case "describe": {
						if (!args.typeName) {
							const message = "Missing 'typeName'. Run @[schema types] to inspect available names.";
							return buildSchemaResponse({
								action: "describe",
								status: "error",
								title: "Missing type name",
								instance,
								branch,
								autoSelected: autoSelectedFlag,
								textSections: [message],
								diagnostics: [message],
								errorCode: "MISSING_TYPE_NAME",
							});
						}

						try {
							validateSchemaTypeName(args.typeName);
						} catch (err) {
							const message = `Invalid type name: ${
								err instanceof Error ? err.message : String(err)
							}`;
							return buildSchemaResponse({
								action: "describe",
								status: "error",
								title: "Invalid type name",
								instance,
								branch,
								autoSelected: autoSelectedFlag,
								textSections: [message],
								diagnostics: [message],
								errorCode: "INVALID_TYPE_NAME",
							});
						}

						const fullName = `default::${args.typeName}`;
						const result = await client.query(DESCRIBE_QUERY, {
							typeName: fullName,
						});
						if (!result || (Array.isArray(result) && result.length === 0)) {
							const typesRes = await client.query(LIST_TYPES_QUERY);
							const types = (typesRes as { name: string }[]).map((t) =>
								t.name.replace("default::", ""),
							);
							const diagnostics = [
								`Type '${args.typeName}' not found. Example types: ${types.slice(0, 30).join(", ")}${
									types.length > 30 ? " …" : ""
								}`,
								'Run @[schema action="describe" typeName="<Type>"] with a valid type name.',
							];
							return buildSchemaResponse({
								action: "describe",
								status: "error",
								title: `Type '${args.typeName}' not found${statusMessage}`,
								instance,
								branch,
								autoSelected: autoSelectedFlag,
								textSections: diagnostics,
								diagnostics,
								listedTypes: types,
							});
						}

						const prepared = prepareJsonPayload(result, {
							name: `schema.describe.${args.typeName}`,
							title: `Schema describe result for ${args.typeName}`,
							description:
								"Detailed schema metadata returned from schema.describe.",
						});
						const diagnostics = [
							"You can now validate or run a query:",
							`@[query action="validate" query="SELECT ${args.typeName}"]`,
							`@[query action="run" query="SELECT ${args.typeName}"]`,
						];
						if (prepared.truncated) {
							diagnostics.push(
								`Full describe output stored in resource link due to ${MAX_INLINE_RESPONSE_CHARS.toLocaleString()} character inline cap.`,
							);
						}

						const describeData = prepared.truncated
							? {
									typeName: args.typeName,
									truncated: true,
									resourceUri: prepared.resourceUri,
								}
							: {
									typeName: args.typeName,
									definition: result,
								};

						return buildSchemaResponse({
							action: "describe",
							status: "success",
							title: `Schema for '${args.typeName}'${statusMessage}`,
							instance,
							branch,
							autoSelected: autoSelectedFlag,
							textSections: diagnostics,
							diagnostics,
							resourceLinks: prepared.resourceLinks,
							resourceUri: prepared.resourceUri,
							describe: describeData,
						});
					}
					case "refresh": {
						const projectRoot = findProjectRoot();
						const credentialsPath = path.join(
							projectRoot,
							"instance_credentials",
							`${instance}.json`,
						);
						const outputPath = path.join(projectRoot, "src", "edgeql-js");
						const cmd = `npx @gel/generate edgeql-js --credentials-file ${credentialsPath} --output-dir ${outputPath} --target ts --force-overwrite`;
						let confirmed = args.confirm === true;
						let refreshReason: string | undefined;

						if (!confirmed) {
							const elicitation = await runElicitation(server, {
								message: `Regenerate EdgeQL builders for instance '${instance}'? This overwrites files under src/edgeql-js.`,
								requestedSchema: {
									type: "object",
									additionalProperties: false,
									required: ["confirm"],
									properties: {
										confirm: {
											type: "boolean",
											title: "Confirm schema refresh",
											description:
												"Set true to proceed with regeneration. This may overwrite generated files.",
											default: false,
										},
										reason: {
											type: "string",
											title: "Reason (optional)",
											description:
												"Provide context for auditing why the refresh is necessary.",
											minLength: 0,
											maxLength: 200,
										},
									},
								},
							});

							if (!elicitation) {
								const message = "Interactive confirmation is unavailable. Re-run with `confirm: true` to proceed.";
								return buildSchemaResponse({
									action: "refresh",
									status: "info",
									title: "Schema refresh requires confirmation",
									instance,
									branch,
									autoSelected: autoSelectedFlag,
									textSections: [message],
									diagnostics: [message],
									nextSteps: ['@[schema action="refresh" confirm=true]'],
								});
							}

							if (elicitation.action !== "accept" || !elicitation.content) {
								const message = "Schema refresh cancelled by the user.";
								return buildSchemaResponse({
									action: "refresh",
									status: "info",
									title: "Schema refresh cancelled",
									instance,
									branch,
									autoSelected: autoSelectedFlag,
									textSections: [message],
									diagnostics: [message],
								});
							}

							const response = elicitation.content as {
								confirm: boolean;
								reason?: string;
							};
							if (!response.confirm) {
								const message = "Schema refresh cancelled after confirmation prompt.";
								return buildSchemaResponse({
									action: "refresh",
									status: "info",
									title: "Schema refresh cancelled",
									instance,
									branch,
									autoSelected: autoSelectedFlag,
									textSections: [message],
									diagnostics: [message],
								});
							}

							confirmed = true;
							refreshReason = response.reason?.trim() || undefined;
						}

						const start = Date.now();
						let stdout = "";
						try {
							stdout = exec(cmd, {
								encoding: "utf8",
								timeout: 30000,
								cwd: findProjectRoot(),
							});
						} catch (e) {
							const errorMessage =
								e instanceof Error ? e.message : String(e);
							const errorDetails =
								e && typeof e === "object" && "stdout" in e
									? String((e as { stdout?: unknown }).stdout ?? "")
									: "";
							const logContent =
								[`Command: ${cmd}`, `Error: ${errorMessage}`, errorDetails]
									.filter(Boolean)
									.join("\n\n")
									.trim() || errorMessage;
							const resourceUri = createEphemeralTextResource(logContent, {
								mimeType: "text/plain",
							});
							return buildSchemaResponse({
								action: "refresh",
								status: "error",
								title: `Failed to refresh schema for '${instance}'${statusMessage}`,
								instance,
								branch,
								autoSelected: autoSelectedFlag,
								textSections: [
									errorMessage,
									"Inspect the resource link for generator logs and retry once the issue is resolved.",
								],
								diagnostics: [errorMessage],
								resourceLinks: [
									{
										type: "resource_link",
										uri: resourceUri,
										name: "schema.refresh.error-log",
										title: "Schema refresh error log",
										description:
											"Captured stdout/stderr from the schema generator command.",
										mimeType: "text/plain",
									},
								],
								refresh: {
									status: "failed",
									command: cmd,
									logResourceUri: resourceUri,
									reason: refreshReason,
								},
							});
						}

						const logContent =
							stdout.trim() || "Schema generation completed without output.";
						const resourceUri = createEphemeralTextResource(logContent, {
							mimeType: "text/plain",
						});
						const durationMs = Date.now() - start;
						const diagnostics = [
							"Schema generation completed. Detailed logs stored in the resource link.",
						];
						if (refreshReason) {
							diagnostics.push(`Reason provided: ${refreshReason}`);
						}
						return buildSchemaResponse({
							action: "refresh",
							status: "success",
							title: `Regenerated query builder for '${instance}'${statusMessage}`,
							instance,
							branch,
							autoSelected: autoSelectedFlag,
							textSections: diagnostics,
							diagnostics,
							resourceLinks: [
								{
									type: "resource_link",
									uri: resourceUri,
									name: "schema.refresh.log",
									title: "Schema refresh log",
									description:
										"Output captured from the latest schema refresh command.",
									mimeType: "text/plain",
								},
							],
							refresh: {
								status: "succeeded",
								command: cmd,
								durationMs,
								notes: diagnostics,
								logResourceUri: resourceUri,
								reason: refreshReason,
							},
						});
					}
					default: {
						const result = await client.query(OVERVIEW_QUERY);
						const typesRes = await client.query(LIST_TYPES_QUERY);
						const types = (typesRes as { name: string }[]).map((t) =>
							t.name.replace("default::", ""),
						);
						const overviewPayload = { overview: result, types };
						const prepared = prepareJsonPayload(overviewPayload, {
							name: "schema.overview.data",
							title: "Schema overview data",
							description:
								"Combined overview payload produced by schema overview command.",
						});
						const samplingSummary = await requestSampling({
							purpose: "Summarize EdgeDB schema overview for quick understanding.",
							maxTokens: 200,
							messages: [
								{
									role: "system",
									content:
										"Provide a concise summary of key types and relationships mentioned in the schema overview.",
								},
								{
									role: "user",
									content: `Schema overview JSON:\n${prepared.serialized.slice(0, MAX_INLINE_RESPONSE_CHARS)}`,
								},
							],
						});
						const diagnostics = [
							`Detected ${types.length} type(s). Example: ${types.slice(0, 10).join(", ")}${
								types.length > 10 ? " …" : ""
							}`,
							"Next: describe a type or validate a simple query:",
							'@[schema action="describe" typeName="<Type>"]',
							'@[query action="validate" query="SELECT <Type>"]',
						];
						if (prepared.truncated) {
							diagnostics.push(
								`Inline preview trimmed to ${MAX_INLINE_RESPONSE_CHARS.toLocaleString()} characters. Use the resource link for the complete overview payload.`,
							);
						}
						if (samplingSummary?.summary) {
							diagnostics.push(`AI summary: ${samplingSummary.summary}`);
						}

						return buildSchemaResponse({
							action: "overview",
							status: "success",
							title: `Schema overview${statusMessage}`,
							instance,
							branch,
							autoSelected: autoSelectedFlag,
							textSections: diagnostics,
							diagnostics,
							resourceLinks: prepared.resourceLinks,
							resourceUri: prepared.resourceUri,
							listedTypes: types,
							overview: {
								types,
								totalTypes: types.length,
								truncated: prepared.truncated || undefined,
								resourceUri: prepared.resourceUri,
								summary: samplingSummary?.summary,
							},
						});
					}
				}
			} catch (error: unknown) {
				const normalized = errorResponseFromError(error, {
					fallbackTitle: "Schema tool error",
					additionalContext: [
						"Inspect the error details and retry once the underlying issue is resolved.",
					],
				});
				const textSections = normalized.textSections.slice();
				if (normalized.errorCode) {
					textSections.unshift(`Error code: ${normalized.errorCode}`);
				}
				if (normalized.retryAfterMs !== undefined) {
					textSections.push(
						`Retry after ${Math.ceil(normalized.retryAfterMs / 1000)}s before issuing another schema request.`,
					);
				}
				if (normalized.timeoutMs !== undefined) {
					textSections.push(
						`Operation timed out after ${normalized.timeoutMs}ms. Consider narrowing the schema scope or increasing timeout settings.`,
					);
				}

				return buildSchemaResponse({
					action,
					status: "error",
					title: normalized.title,
					instance,
					branch,
					autoSelected: autoSelectedFlag,
					textSections,
					diagnostics: textSections,
					errorCode: normalized.errorCode,
					retryAfterMs: normalized.retryAfterMs,
					timeoutMs: normalized.timeoutMs,
					statusCode: normalized.statusCode,
					context: normalized.context,
				});
			}
		},
	);
}
