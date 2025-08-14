import { z } from "zod";
import { getConfig } from "./config.js";
import { RateLimitError, ValidationError } from "./errors.js";
import { createLogger } from "./logger.js";

const logger = createLogger("validation");

/**
 * Code injection patterns for TypeScript execution
 */
const CODE_INJECTION_PATTERNS = [
	/require\s*\(\s*['"`].*['"`]\s*\)/,
	/import\s+.*\s+from\s+['"`].*['"`]/,
	/eval\s*\(/,
	/Function\s*\(/,
	/setTimeout\s*\(/,
	/setInterval\s*\(/,
	/process\./,
	/global\./,
	/__dirname/,
	/__filename/,
	/fs\./,
	/child_process/,
	/net\./,
	/http\./,
	/https\./,
	/crypto\.randomBytes/,
	/Buffer\./,
];

/**
 * Instance name validation schema
 */
export const InstanceNameSchema = z
	.string()
	.min(1, "Instance name cannot be empty")
	.max(100, "Instance name too long")
	.regex(
		/^[a-zA-Z0-9_-]+$/,
		"Instance name can only contain letters, numbers, underscores, and hyphens",
	);

/**
 * Branch name validation schema
 */
export const BranchNameSchema = z
	.string()
	.min(1, "Branch name cannot be empty")
	.max(100, "Branch name too long")
	.regex(
		/^[a-zA-Z0-9_/-]+$/,
		"Branch name can only contain letters, numbers, underscores, hyphens, and slashes",
	);

/**
 * Schema type name validation
 */
export const SchemaTypeNameSchema = z
	.string()
	.min(1, "Schema type name cannot be empty")
	.max(200, "Schema type name too long")
	.regex(
		/^[a-zA-Z_][a-zA-Z0-9_]*$/,
		"Schema type name must start with letter or underscore, followed by letters, numbers, or underscores",
	);

/**
 * Validate TypeScript code for execution
 */
export function validateTypeScriptCode(code: string): void {
	const config = getConfig();

	if (!config.security.executeTypescript.enabled) {
		throw new ValidationError("TypeScript execution is disabled", "code", code);
	}

	if (!code || typeof code !== "string") {
		throw new ValidationError("Code must be a non-empty string", "code", code);
	}

	if (code.length > config.security.executeTypescript.maxCodeLength) {
		throw new ValidationError(
			`Code too long (max ${config.security.executeTypescript.maxCodeLength} characters)`,
			"code",
			code.length,
		);
	}

	// Check for blocked patterns
	for (const patternStr of config.security.executeTypescript.blockedPatterns) {
		const pattern = new RegExp(patternStr, "i");
		if (pattern.test(code)) {
			logger.warn("Blocked code pattern detected", {
				pattern: patternStr,
				code: `${code.substring(0, 100)}...`,
			});
			throw new ValidationError(
				"Code contains blocked patterns",
				"code",
				code,
				{ pattern: patternStr },
			);
		}
	}

	// Check for general code injection patterns
	for (const pattern of CODE_INJECTION_PATTERNS) {
		if (pattern.test(code)) {
			logger.warn("Potential code injection detected", {
				pattern: pattern.source,
				code: `${code.substring(0, 100)}...`,
			});
			throw new ValidationError(
				"Code contains potentially dangerous patterns",
				"code",
				code,
				{ pattern: pattern.source },
			);
		}
	}
}

/**
 * Validate instance name
 */
export function validateInstanceName(instanceName: string): void {
	try {
		InstanceNameSchema.parse(instanceName);
	} catch (error) {
		if (error instanceof z.ZodError) {
			throw new ValidationError(
				error.errors[0]?.message || "Invalid instance name",
				"instanceName",
				instanceName,
				{},
			);
		}
		throw error;
	}
}

/**
 * Validate branch name
 */
export function validateBranchName(branchName: string): void {
	try {
		BranchNameSchema.parse(branchName);
	} catch (error) {
		if (error instanceof z.ZodError) {
			throw new ValidationError(
				error.errors[0]?.message || "Invalid branch name",
				"branchName",
				branchName,
				{},
			);
		}
		throw error;
	}
}

/**
 * Validate schema type name
 */
export function validateSchemaTypeName(typeName: string): void {
	try {
		SchemaTypeNameSchema.parse(typeName);
	} catch (error) {
		if (error instanceof z.ZodError) {
			throw new ValidationError(
				error.errors[0]?.message || "Invalid schema type name",
				"typeName",
				typeName,
				{},
			);
		}
		throw error;
	}
}

/**
 * Sanitize string input by removing potentially dangerous characters
 */
export function sanitizeString(input: string, maxLength = 1000): string {
	if (!input || typeof input !== "string") {
		return "";
	}

	// Remove dangerous HTML/XML characters and control characters
	let sanitized = input.substring(0, maxLength);
	sanitized = sanitized.replace(/[<>"'&]/g, ""); // Remove HTML/XML dangerous chars

	// Remove control characters by filtering character codes
	sanitized = sanitized
		.split("")
		.filter((char) => {
			const code = char.charCodeAt(0);
			// Keep printable ASCII and extended characters, exclude control characters
			return (code >= 32 && code <= 126) || code >= 160;
		})
		.join("");

	return sanitized.trim();
}

/**
 * Validate and sanitize query arguments
 */
export function validateQueryArgs(
	args: Record<string, unknown>,
): Record<string, unknown> {
	if (!args || typeof args !== "object") {
		return {};
	}

	const sanitized: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(args)) {
		// Validate key name
		if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
			throw new ValidationError(
				"Query argument key contains invalid characters",
				"args",
				key,
				{},
			);
		}

		// Sanitize string values
		if (typeof value === "string") {
			sanitized[key] = sanitizeString(value);
		} else if (
			typeof value === "number" ||
			typeof value === "boolean" ||
			value === null
		) {
			sanitized[key] = value;
		} else if (Array.isArray(value)) {
			sanitized[key] = value.map((item) =>
				typeof item === "string" ? sanitizeString(item) : item,
			);
		} else {
			// For complex objects, convert to string and sanitize
			sanitized[key] = sanitizeString(JSON.stringify(value));
		}
	}

	return sanitized;
}

/**
 * Rate limiting state
 */
const rateLimitState = new Map<
	string,
	{ count: number; resetTime: number; executeCount: number }
>();

/**
 * Check rate limit for a given identifier
 */
export function checkRateLimit(
	identifier: string,
	isExecuteTool = false,
): void {
	const config = getConfig();

	if (!config.security.rateLimit.enabled) {
		return;
	}

	const now = Date.now();
	const windowMs = config.security.rateLimit.windowMs;
	const maxRequests = config.security.rateLimit.maxRequests;
	const executeToolsLimit = config.security.rateLimit.executeToolsLimit;

	// Clean up expired entries
	for (const [key, state] of rateLimitState.entries()) {
		if (now > state.resetTime) {
			rateLimitState.delete(key);
		}
	}

	// Get or create state for this identifier
	let state = rateLimitState.get(identifier);
	if (!state || now > state.resetTime) {
		state = {
			count: 0,
			executeCount: 0,
			resetTime: now + windowMs,
		};
		rateLimitState.set(identifier, state);
	}

	// Check general rate limit
	if (state.count >= maxRequests) {
		throw new RateLimitError(
			`${maxRequests} requests per ${windowMs}ms`,
			Math.ceil((state.resetTime - now) / 1000),
			{ count: state.count, maxRequests },
		);
	}

	// Check execute tools rate limit
	if (isExecuteTool && state.executeCount >= executeToolsLimit) {
		throw new RateLimitError(
			`${executeToolsLimit} executions per ${windowMs}ms`,
			Math.ceil((state.resetTime - now) / 1000),
			{ executeCount: state.executeCount, executeToolsLimit },
		);
	}

	// Increment counters
	state.count++;
	if (isExecuteTool) {
		state.executeCount++;
	}
}

/**
 * Get rate limit status for debugging
 */
export function getRateLimitStatus(identifier: string): {
	count: number;
	executeCount: number;
	resetTime: number;
	remaining: number;
	executeRemaining: number;
} {
	const config = getConfig();
	const state = rateLimitState.get(identifier);

	if (!state) {
		return {
			count: 0,
			executeCount: 0,
			resetTime: Date.now() + config.security.rateLimit.windowMs,
			remaining: config.security.rateLimit.maxRequests,
			executeRemaining: config.security.rateLimit.executeToolsLimit,
		};
	}

	return {
		count: state.count,
		executeCount: state.executeCount,
		resetTime: state.resetTime,
		remaining: Math.max(0, config.security.rateLimit.maxRequests - state.count),
		executeRemaining: Math.max(
			0,
			config.security.rateLimit.executeToolsLimit - state.executeCount,
		),
	};
}
