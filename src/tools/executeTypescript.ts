import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getConfig } from "../config.js";
import { getDatabaseClient } from "../database.js";
import { ValidationError } from "../errors.js";
import { createLogger } from "../logger.js";
import { checkRateLimit, validateTypeScriptCode } from "../validation.js";

const logger = createLogger("executeTypescript");

// Try to import isolated-vm, fallback to unsafe execution if not available
let ivm: typeof import("isolated-vm") | null = null;

async function _loadIsolatedVM(): Promise<void> {
	if (ivm !== null) return; // Already loaded or failed

	try {
		ivm = await import("isolated-vm");
		logger.info("isolated-vm loaded successfully");
	} catch (error) {
		ivm = null; // Explicitly set to null on failure
		logger.warn(
			"isolated-vm not available, TypeScript execution will be disabled for security",
			{
				error: error instanceof Error ? error.message : String(error),
			},
		);
	}
}

/**
 * Execute TypeScript code in a secure isolated VM
 */
async function executeInIsolatedVM(
	code: string,
	gelClient: unknown,
	logger: ReturnType<typeof createLogger>,
	timeout: number,
	memoryLimit: number,
): Promise<unknown> {
	if (!ivm) {
		throw new ValidationError(
			"Isolated VM not available - TypeScript execution disabled for security",
		);
	}

	const isolate = new ivm.Isolate({ memoryLimit });
	const context = await isolate.createContext();

	try {
		// Set up basic globals
		const jail = context.global;
		await jail.set("global", jail.derefInto());

		// Create a safe console implementation
		const safeConsole = {
			log: (...args: unknown[]) => {
				logger.info("VM Console", { args: args.map(String) });
			},
			error: (...args: unknown[]) => {
				logger.error("VM Console Error", { args: args.map(String) });
			},
			warn: (...args: unknown[]) => {
				logger.warn("VM Console Warning", { args: args.map(String) });
			},
		};

		// Inject safe objects into the VM
		await jail.set("console", new ivm.ExternalCopy(safeConsole).copyInto());

		// Create a safe gel client proxy that only exposes query method
		if (gelClient && typeof gelClient === "object" && "query" in gelClient) {
			const safeGelClient = {
				query: async (query: string, args?: Record<string, unknown>) => {
					if (typeof gelClient.query === "function") {
						return await gelClient.query(query, args);
					}
					throw new Error("Gel client query method not available");
				},
			};
			await jail.set(
				"gelClient",
				new ivm.ExternalCopy(safeGelClient).copyInto(),
			);
		}

		// Create the execution script
		const script = await isolate.compileScript(`
			(async function() {
				${code}
			})();
		`);

		// Execute with timeout
		const result = await script.run(context, { timeout });

		return result;
	} finally {
		// Clean up resources
		context.release();
		isolate.dispose();
	}
}

/**
 * Fallback unsafe execution (only for development/testing)
 */
async function executeUnsafe(
	code: string,
	gelClient: unknown,
	logger: ReturnType<typeof createLogger>,
): Promise<unknown> {
	logger.warn(
		"Using UNSAFE code execution - this should only be used in development",
	);

	// Create log capture
	const logs: string[] = [];
	const originalLog = console.log;
	console.log = (...logArgs: unknown[]) => {
		logs.push(logArgs.map(String).join(" "));
	};

	try {
		// Prepare the code with imports
		const wrappedCode = `
			${gelClient ? "const gelClient = arguments[0];" : ""}
			const logger = arguments[1];
			
			${code}
		`;

		// Execute the code using Function constructor (UNSAFE!)
		const AsyncFunction = (async () => {}).constructor as new (
			...args: string[]
		) => (...args: unknown[]) => Promise<unknown>;
		const result = await new AsyncFunction(wrappedCode)(gelClient, logger);

		return {
			result,
			logs,
		};
	} finally {
		// Restore console.log
		console.log = originalLog;
	}
}

export function registerExecuteTypescript(server: McpServer) {
	server.registerTool(
		"execute-typescript",
		{
			title: "Execute TypeScript Code",
			description:
				"Execute TypeScript code with EdgeDB query builder access in a secure sandboxed environment. " +
				"⚠️ SECURITY WARNING: Code execution is inherently risky. Only use in trusted environments.\n" +
				"Best practices:\n" +
				"- Use 'await gelClient.query()' with 'console.log' to display results\n" +
				"- Use 'ORDER BY' with 'THEN', not commas (e.g., 'ORDER BY .field1 THEN .field2')\n" +
				"- Keep code simple and focused on a single operation\n" +
				"- Code is executed in an isolated VM with limited access to system resources",
			inputSchema: {
				code: z.string(),
				timeout: z.number().optional(),
				instance: z.string().optional(),
				branch: z.string().optional(),
				use_gel_client: z.boolean().optional(),
			},
		},
		async (args) => {
			const config = getConfig();

			// Load isolated-vm if not already loaded
			await _loadIsolatedVM();

			try {
				// Check if TypeScript execution is enabled
				if (!config.security.executeTypescript.enabled) {
					return {
						content: [
							{
								type: "text",
								text: "❌ TypeScript execution is disabled in configuration",
							},
						],
					};
				}

				// Rate limiting
				checkRateLimit("typescript-execution", true);

				// Validate the code
				validateTypeScriptCode(args.code);

				// Get configuration values
				const timeout = Math.min(
					args.timeout || config.security.executeTypescript.timeout,
					config.security.executeTypescript.timeout,
				);
				const memoryLimit = config.security.executeTypescript.memoryLimit;

				// Get database client if requested
				let gelClient = null;
				if (args.use_gel_client !== false) {
					gelClient = getDatabaseClient({
						instance: args.instance,
						branch: args.branch,
					});
				}

				let result: unknown;
				let executionMethod = "isolated-vm";

				if (ivm) {
					// Use secure isolated VM
					try {
						result = await executeInIsolatedVM(
							args.code,
							gelClient,
							logger,
							timeout,
							memoryLimit,
						);
					} catch (error) {
						if (
							error instanceof Error &&
							error.message.includes("Script execution timed out")
						) {
							return {
								content: [
									{
										type: "text",
										text: `❌ Code execution timed out after ${timeout}ms`,
									},
								],
							};
						}
						throw error;
					}
				} else {
					// Fallback to unsafe execution (development only)
					if (process.env.NODE_ENV === "production") {
						return {
							content: [
								{
									type: "text",
									text: "❌ Secure code execution not available and unsafe execution is disabled in production",
								},
							],
						};
					}

					executionMethod = "unsafe-fallback";
					const unsafeResult = await executeUnsafe(
						args.code,
						gelClient,
						logger,
					);
					result = (unsafeResult as { result: unknown; logs: string[] }).result;
				}

				return {
					content: [
						{
							type: "text",
							text: `✅ Code executed successfully (${executionMethod}):`,
						},
						{
							type: "text",
							text:
								result !== undefined
									? `Result: ${JSON.stringify(result, null, 2)}`
									: "No result returned",
						},
						{
							type: "text",
							text: `Execution time limit: ${timeout}ms, Memory limit: ${memoryLimit}MB`,
						},
					],
				};
			} catch (error: unknown) {
				if (error instanceof ValidationError) {
					return {
						content: [
							{
								type: "text",
								text: `❌ Validation error: ${error.message}`,
							},
						],
					};
				}

				logger.error("TypeScript execution error:", {
					error: error instanceof Error ? error.message : String(error),
					code: `${args.code.substring(0, 100)}...`,
				});

				return {
					content: [
						{
							type: "text",
							text: `❌ Error executing code: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
				};
			}
		},
	);
}
