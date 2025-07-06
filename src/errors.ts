import { createLogger } from "./logger.js";

const logger = createLogger("errors");

/**
 * Base error class for all MCP server errors
 */
export abstract class MCPError extends Error {
	abstract readonly code: string;
	abstract readonly statusCode: number;

	constructor(
		message: string,
		public readonly context?: Record<string, unknown>,
		public readonly cause?: Error,
	) {
		super(message);
		this.name = this.constructor.name;

		// Maintain proper stack trace
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}
	}

	/**
	 * Convert error to MCP tool response format
	 */
	toMCPResponse(): { content: Array<{ type: "text"; text: string }> } {
		logger.error(`${this.code}: ${this.message}`, {
			context: this.context,
			cause: this.cause?.message,
			stack: this.stack,
		});

		return {
			content: [
				{
					type: "text",
					text: `❌ ${this.message}`,
				},
			],
		};
	}
}

/**
 * Database connection errors
 */
export class DatabaseError extends MCPError {
	readonly code = "DATABASE_ERROR";
	readonly statusCode = 500;

	constructor(
		message: string,
		context?: Record<string, unknown>,
		cause?: Error,
	) {
		super(`Database error: ${message}`, context, cause);
	}
}

/**
 * Validation errors (user input issues)
 */
export class ValidationError extends MCPError {
	readonly code = "VALIDATION_ERROR";
	readonly statusCode = 400;

	constructor(
		message: string,
		public readonly field?: string,
		public readonly value?: unknown,
		context?: Record<string, unknown>,
	) {
		super(`Validation error: ${message}`, { field, value, ...context });
	}
}

/**
 * Authentication/authorization errors
 */
export class AuthenticationError extends MCPError {
	readonly code = "AUTHENTICATION_ERROR";
	readonly statusCode = 401;

	constructor(
		message: string,
		context?: Record<string, unknown>,
		cause?: Error,
	) {
		super(`Authentication error: ${message}`, context, cause);
	}
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends MCPError {
	readonly code = "RATE_LIMIT_ERROR";
	readonly statusCode = 429;

	constructor(
		message: string,
		public readonly retryAfter?: number,
		context?: Record<string, unknown>,
	) {
		super(`Rate limit exceeded: ${message}`, { retryAfter, ...context });
	}
}

/**
 * Configuration errors
 */
export class ConfigurationError extends MCPError {
	readonly code = "CONFIGURATION_ERROR";
	readonly statusCode = 500;

	constructor(
		message: string,
		context?: Record<string, unknown>,
		cause?: Error,
	) {
		super(`Configuration error: ${message}`, context, cause);
	}
}

/**
 * Security errors
 */
export class SecurityError extends MCPError {
	readonly code = "SECURITY_ERROR";
	readonly statusCode = 403;

	constructor(
		message: string,
		context?: Record<string, unknown>,
		cause?: Error,
	) {
		super(`Security error: ${message}`, context, cause);
	}
}

/**
 * Timeout errors
 */
export class TimeoutError extends MCPError {
	readonly code = "TIMEOUT_ERROR";
	readonly statusCode = 408;

	constructor(
		message: string,
		public readonly timeoutMs?: number,
		context?: Record<string, unknown>,
	) {
		super(`Timeout error: ${message}`, { timeoutMs, ...context });
	}
}

/**
 * Resource not found errors
 */
export class NotFoundError extends MCPError {
	readonly code = "NOT_FOUND_ERROR";
	readonly statusCode = 404;

	constructor(
		resource: string,
		identifier?: string,
		context?: Record<string, unknown>,
	) {
		super(`${resource} not found${identifier ? `: ${identifier}` : ""}`, {
			resource,
			identifier,
			...context,
		});
	}
}

/**
 * External service errors
 */
export class ExternalServiceError extends MCPError {
	readonly code = "EXTERNAL_SERVICE_ERROR";
	readonly statusCode = 502;

	constructor(
		service: string,
		message: string,
		context?: Record<string, unknown>,
		cause?: Error,
	) {
		super(
			`External service error (${service}): ${message}`,
			{ service, ...context },
			cause,
		);
	}
}

/**
 * Internal server errors
 */
export class InternalServerError extends MCPError {
	readonly code = "INTERNAL_SERVER_ERROR";
	readonly statusCode = 500;

	constructor(
		message: string,
		context?: Record<string, unknown>,
		cause?: Error,
	) {
		super(`Internal server error: ${message}`, context, cause);
	}
}

/**
 * Error handler utility that converts any error to standardized format
 */
export function handleError(
	error: unknown,
	defaultMessage = "An unexpected error occurred",
): MCPError {
	// If it's already an MCPError, return as-is
	if (error instanceof MCPError) {
		return error;
	}

	// If it's a standard Error, wrap it
	if (error instanceof Error) {
		// Try to categorize based on error message/type
		if (error.message.includes("timeout")) {
			return new TimeoutError(error.message, undefined, undefined);
		}

		if (
			error.message.includes("connection") ||
			error.message.includes("ECONNREFUSED")
		) {
			return new DatabaseError(error.message, undefined, error);
		}

		if (
			error.message.includes("validation") ||
			error.message.includes("invalid")
		) {
			return new ValidationError(error.message);
		}

		if (
			error.message.includes("permission") ||
			error.message.includes("unauthorized")
		) {
			return new AuthenticationError(error.message, undefined, error);
		}

		if (error.message.includes("not found")) {
			return new NotFoundError("Resource", error.message);
		}

		// Default to internal server error
		return new InternalServerError(error.message, undefined, error);
	}

	// For non-Error objects, create a generic internal server error
	return new InternalServerError(defaultMessage, { originalError: error });
}

/**
 * Async error wrapper for tool functions
 */
export function wrapToolFunction<T extends unknown[], R>(
	fn: (...args: T) => Promise<R>,
	defaultErrorMessage?: string,
): (
	...args: T
) => Promise<R | { content: Array<{ type: "text"; text: string }> }> {
	return async (...args: T) => {
		try {
			return await fn(...args);
		} catch (error) {
			const mcpError = handleError(error, defaultErrorMessage);
			return mcpError.toMCPResponse();
		}
	};
}

/**
 * Create a success response
 */
export function createSuccessResponse(
	message: string,
	data?: unknown,
): {
	content: Array<{ type: "text"; text: string }>;
} {
	const content = [
		{
			type: "text" as const,
			text: `✅ ${message}`,
		},
	];

	if (data !== undefined) {
		content.push({
			type: "text" as const,
			text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
		});
	}

	return { content };
}

/**
 * Create a warning response
 */
export function createWarningResponse(
	message: string,
	details?: string,
): {
	content: Array<{ type: "text"; text: string }>;
} {
	const content = [
		{
			type: "text" as const,
			text: `⚠️ ${message}`,
		},
	];

	if (details) {
		content.push({
			type: "text" as const,
			text: details,
		});
	}

	return { content };
}

/**
 * Create an info response
 */
export function createInfoResponse(
	message: string,
	data?: unknown,
): {
	content: Array<{ type: "text"; text: string }>;
} {
	const content = [
		{
			type: "text" as const,
			text: `ℹ️ ${message}`,
		},
	];

	if (data !== undefined) {
		content.push({
			type: "text" as const,
			text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
		});
	}

	return { content };
}
