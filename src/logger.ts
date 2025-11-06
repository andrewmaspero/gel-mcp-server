import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import winston from "winston";
import { getConfig } from "./config.js";
import { getCurrentRequestId } from "./requestContext.js";

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logsDir)) {
	fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for console output
const consoleFormat = winston.format.combine(
	winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
	winston.format.printf(({ timestamp, level, message, ...meta }) => {
		const metaString =
			Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
		return `[${timestamp}] ${level}: ${message}${metaString}`;
	}),
);

// JSON format for file output
const fileFormat = winston.format.combine(
	winston.format.timestamp(),
	winston.format.errors({ stack: true }),
	winston.format.json(),
);

const cfg = getConfig();

// Create Winston logger instance
const logger = winston.createLogger({
	level: cfg.logging.level || process.env.LOG_LEVEL || "info",
	format: fileFormat,
	defaultMeta: { service: "gel-mcp-server" },
	transports: [
		// Error log file
		new winston.transports.File({
			filename: path.join(logsDir, "error.log"),
			level: "error",
			maxsize: cfg.logging.maxSize, // bytes
			maxFiles: cfg.logging.maxFiles,
		}),
		// Combined log file
		new winston.transports.File({
			filename: path.join(logsDir, "combined.log"),
			maxsize: cfg.logging.maxSize,
			maxFiles: cfg.logging.maxFiles,
		}),
	],
	exceptionHandlers: [
		new winston.transports.File({
			filename: path.join(logsDir, "exceptions.log"),
		}),
	],
	rejectionHandlers: [
		new winston.transports.File({
			filename: path.join(logsDir, "rejections.log"),
		}),
	],
});

// Add console transport when explicitly enabled
if (cfg.logging.enableConsole) {
	logger.add(
		new winston.transports.Console({
			stderrLevels: ["error", "warn", "info", "debug"],
			format: consoleFormat,
		}),
	);
}

function withRequestId(
	meta?: Record<string, unknown>,
): Record<string, unknown> | undefined {
	const requestId = getCurrentRequestId();
	if (!meta && !requestId) {
		return undefined;
	}

	return {
		requestId: meta?.requestId ?? requestId ?? randomUUID(),
		...(meta ?? {}),
	};
}

// Helper function to log with context
export function createLogger(context: string) {
	const contextualLogger = logger.child({ context });
	return {
		error: (message: string, meta?: Record<string, unknown>) =>
			contextualLogger.error(message, withRequestId(meta)),
		warn: (message: string, meta?: Record<string, unknown>) =>
			contextualLogger.warn(message, withRequestId(meta)),
		info: (message: string, meta?: Record<string, unknown>) =>
			contextualLogger.info(message, withRequestId(meta)),
		debug: (message: string, meta?: Record<string, unknown>) =>
			contextualLogger.debug(message, withRequestId(meta)),
		log: (level: string, message: string, meta?: Record<string, unknown>) =>
			contextualLogger.log(level, message, withRequestId(meta)),
	};
}

export default logger;
