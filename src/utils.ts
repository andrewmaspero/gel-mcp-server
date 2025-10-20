import { getAvailableInstances, getDatabaseClient } from "./database.js";
import { getDefaultConnection, setDefaultConnection } from "./session.js";
import type {
	ToolContent,
	ToolResponse,
	ToolResponseMeta,
} from "./types/mcp.js";
import { validateBranchName, validateInstanceName } from "./validation.js";

/**
 * Safely stringify data that might contain malformed JSON strings
 */
export function safeJsonStringify(data: unknown, indent = 2): string {
	try {
		return JSON.stringify(data, null, indent);
	} catch (error) {
		// If JSON.stringify fails, try to create a readable representation
		try {
			// Convert to string and back to clean up any malformed data
			const cleaned = JSON.parse(
				JSON.stringify(data, (_key, value) => {
					if (typeof value === "string") {
						// Clean up any malformed quotes in strings
						return value.replace(/([^\\])"/g, '$1\\"');
					}
					return value;
				}),
			);
			return JSON.stringify(cleaned, null, indent);
		} catch (_secondError) {
			// Last resort: return a safe string representation
			return `[Unable to serialize result: ${error instanceof Error ? error.message : String(error)}]\n\nRaw data: ${String(data)}`;
		}
	}
}

/**
 * Resolve instance and branch, auto-selecting defaults if needed
 */
export function resolveConnection(args: {
	instance?: string;
	branch?: string;
}): {
	instance: string | undefined;
	branch: string | undefined;
	autoSelected: boolean;
} {
	const defaultConnection = getDefaultConnection();
	let instance = args.instance || defaultConnection.defaultInstance;
	let branch = args.branch || defaultConnection.defaultBranch;
	let autoSelected = false;

	// If no instance, try to auto-select one
	if (!instance) {
		const availableInstances = getAvailableInstances();
		if (availableInstances.length > 0) {
			instance = availableInstances[0];
			branch = branch || "main";
			setDefaultConnection(instance, branch);
			autoSelected = true;
		}
	}

	return { instance, branch, autoSelected };
}

/**
 * Get a database client with automatic connection resolution
 */
export function getClientWithDefaults(args: {
	instance?: string;
	branch?: string;
}) {
	const { instance, branch, autoSelected } = resolveConnection(args);

	if (!instance) {
		return {
			client: null,
			instance: undefined,
			branch: undefined,
			autoSelected: false,
		};
	}

	const client = getDatabaseClient({ instance, branch });
	return { client, instance, branch, autoSelected };
}

/**
 * Validate optional instance and branch names when provided
 */
export function validateConnectionArgs(args: {
	instance?: string;
	branch?: string;
}) {
	if (args.instance) {
		validateInstanceName(args.instance);
	}
	if (args.branch) {
		validateBranchName(args.branch);
	}
}

/**
 * Format JSON data for MCP text output with truncation and code fencing
 */
export function formatJsonForOutput(
	data: unknown,
	maxLength = 20000,
): {
	formatted: string;
	preview: string;
	truncated: boolean;
} {
	const json = safeJsonStringify(data);
	const truncated = json.length > maxLength;
	const limited = truncated
		? `${json.slice(0, maxLength)}\n... [truncated]`
		: json;
	return {
		formatted: `\n\n\`\`\`json\n${limited}\n\`\`\``,
		preview: limited,
		truncated,
	};
}

export interface DefaultToolResponseData {
	title: string;
	statusMessage?: string;
	textSections: string[];
	nextSteps: string[];
	jsonData?: unknown;
	jsonPreview?: string;
}

const STATUS_EMOJI: Record<ToolResponseMeta["status"], string> = {
	ok: "✅",
	error: "❌",
	info: "ℹ️",
	warn: "⚠️",
};

/**
 * Compose a structured MCP tool response with consistent metadata.
 */
export function composeToolPayload<T>({
	meta,
	data,
	additionalText,
	resourceLinks,
	omitMetaDetails,
	isError,
}: {
	meta: ToolResponseMeta;
	data: T;
	additionalText?: string[];
	resourceLinks?: Array<Exclude<ToolContent, { type: "text"; text: string }>>;
	omitMetaDetails?: boolean;
	isError?: boolean;
}): ToolResponse<T> {
	const content: ToolContent[] = [];
	const summaryPrefix = STATUS_EMOJI[meta.status] ?? "";
	const summaryText =
		summaryPrefix.length > 0
			? `${summaryPrefix} ${meta.summary}`
			: meta.summary;
	content.push({ type: "text", text: summaryText });

	if (!omitMetaDetails) {
		for (const detail of meta.details) {
			if (detail.trim().length > 0) {
				content.push({ type: "text", text: detail });
			}
		}
	}

	if (additionalText) {
		for (const section of additionalText) {
			if (section.trim().length > 0) {
				content.push({ type: "text", text: section });
			}
		}
	}

	if (resourceLinks) {
		for (const link of resourceLinks) {
			content.push(link);
		}
	}

	return {
		content,
		structuredContent: {
			meta,
			data,
		},
		isError: isError ?? meta.status === "error",
	};
}

/**
 * Standardized tool response builder
 */
const BUILD_TOOL_STATUS_MAP = {
	success: "ok",
	error: "error",
	info: "info",
	warn: "warn",
} as const satisfies Record<
	"success" | "error" | "info" | "warn",
	ToolResponseMeta["status"]
>;

type ToolResponseBaseOptions = {
	status: "success" | "error" | "info" | "warn";
	title: string;
	statusMessage?: string;
	textSections?: string[];
	jsonData?: unknown;
	nextSteps?: string[];
	jsonPreviewLimit?: number;
	resourceLinks?: Array<Exclude<ToolContent, { type: "text"; text: string }>>;
	tokenUsage?: ToolResponseMeta["tokenUsage"];
	rateLimit?: ToolResponseMeta["rateLimit"];
	truncated?: boolean;
	omitMetaDetails?: boolean;
};

function createToolResponse<T>(
	options: ToolResponseBaseOptions,
	data: T,
): { response: ToolResponse<T>; jsonPreview?: string } {
	const mappedStatus = BUILD_TOOL_STATUS_MAP[options.status] ?? "info";
	const textSections = options.textSections ?? [];
	const nextSteps = options.nextSteps ?? [];
	let computedTruncated = options.truncated ?? false;
	let jsonPreview: string | undefined;
	const additionalText: string[] = [];

	if (options.jsonData !== undefined) {
		const jsonOutput = formatJsonForOutput(
			options.jsonData,
			options.jsonPreviewLimit,
		);
		jsonPreview = jsonOutput.preview;
		computedTruncated = computedTruncated || jsonOutput.truncated;
		additionalText.push(jsonOutput.formatted);
	}

	const meta: ToolResponseMeta = {
		status: mappedStatus,
		summary: `${options.title}${options.statusMessage ?? ""}`,
		details: textSections,
		nextSteps,
		truncated: computedTruncated ? true : undefined,
		tokenUsage: options.tokenUsage,
		rateLimit: options.rateLimit,
	};

	const response = composeToolPayload<T>({
		meta,
		data,
		additionalText: additionalText.length ? additionalText : undefined,
		resourceLinks: options.resourceLinks,
		omitMetaDetails: options.omitMetaDetails,
		isError: mappedStatus === "error",
	});

	return { response, jsonPreview };
}

export function buildStructuredResponse<T>(
	options: ToolResponseBaseOptions & { data: T },
): ToolResponse<T> {
	return createToolResponse(options, options.data).response;
}

export function buildToolResponse(
	options: ToolResponseBaseOptions,
): ToolResponse<DefaultToolResponseData> {
	const textSections = options.textSections ?? [];
	const nextSteps = options.nextSteps ?? [];
	const data: DefaultToolResponseData = {
		title: options.title,
		statusMessage: options.statusMessage,
		textSections,
		nextSteps,
		jsonData: options.jsonData,
	};

	const { response, jsonPreview } = createToolResponse(options, data);
	if (jsonPreview !== undefined) {
		response.structuredContent.data.jsonPreview = jsonPreview;
	}
	return response;
}

/**
 * Generate a status message showing which instance/branch is being used
 */
export function getConnectionStatusMessage(
	instance: string,
	branch: string | undefined,
	autoSelected: boolean,
): string {
	const branchInfo = branch ? `/${branch}` : "";
	if (autoSelected) {
		return ` (using auto-selected instance: ${instance}${branchInfo})`;
	} else {
		return branch ? ` (using instance: ${instance}${branchInfo})` : "";
	}
}
