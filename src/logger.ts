import fs from "node:fs";
import path from "node:path";
import winston from "winston";
import { getConfig } from "./config.js";

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logsDir)) {
	fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for console output
const consoleFormat = winston.format.combine(
	winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
	winston.format.colorize({ all: true }),
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

// Add console transport in development
if (cfg.logging.enableConsole && process.env.NODE_ENV !== "production") {
	logger.add(
		new winston.transports.Console({
			format: consoleFormat,
		}),
	);
}

// Helper function to log with context
export function createLogger(context: string) {
	return {
		error: (message: string, meta?: Record<string, unknown>) =>
			logger.error(message, { context, ...meta }),
		warn: (message: string, meta?: Record<string, unknown>) =>
			logger.warn(message, { context, ...meta }),
		info: (message: string, meta?: Record<string, unknown>) =>
			logger.info(message, { context, ...meta }),
		debug: (message: string, meta?: Record<string, unknown>) =>
			logger.debug(message, { context, ...meta }),
		log: (level: string, message: string, meta?: Record<string, unknown>) =>
			logger.log(level, message, { context, ...meta }),
	};
}

export default logger;
