import fs from "node:fs";
import path from "node:path";
import { createClient } from "gel";
import { createLogger } from "./logger.js";
import { getDefaultConnection } from "./session.js";

const logger = createLogger("database");

export function findProjectRoot(): string {
	// First, try to find the project root based on the current module location
	// Use __dirname as fallback for CommonJS compatibility
	let currentDir = __dirname;
	const root = path.parse(currentDir).root;

	// Look for our specific project markers (package.json with our project name or specific files)
	while (currentDir !== root) {
		const packageJsonPath = path.join(currentDir, "package.json");
		const srcPath = path.join(currentDir, "src");
		const instanceCredentialsPath = path.join(
			currentDir,
			"instance_credentials",
		);

		if (fs.existsSync(packageJsonPath)) {
			try {
				const packageJson = JSON.parse(
					fs.readFileSync(packageJsonPath, "utf8"),
				);
				// Check if this is our specific project
				if (
					packageJson.name === "gel-mcp-server" ||
					(fs.existsSync(srcPath) && fs.existsSync(instanceCredentialsPath))
				) {
					return currentDir;
				}
			} catch (_error) {
				// Continue searching if package.json is invalid
			}
		}
		currentDir = path.dirname(currentDir);
	}

	// Fallback: try from process.cwd()
	currentDir = process.cwd();
	while (currentDir !== root) {
		const packageJsonPath = path.join(currentDir, "package.json");
		const srcPath = path.join(currentDir, "src");
		const instanceCredentialsPath = path.join(
			currentDir,
			"instance_credentials",
		);

		if (fs.existsSync(packageJsonPath)) {
			try {
				const packageJson = JSON.parse(
					fs.readFileSync(packageJsonPath, "utf8"),
				);
				if (
					packageJson.name === "gel-mcp-server" ||
					(fs.existsSync(srcPath) && fs.existsSync(instanceCredentialsPath))
				) {
					return currentDir;
				}
			} catch (_error) {
				// Continue searching
			}
		}
		currentDir = path.dirname(currentDir);
	}

	logger.warn(
		"Could not find project root with our specific markers, falling back to process.cwd()",
		{
			cwd: process.cwd(),
			moduleDir: __dirname,
		},
	);
	return process.cwd();
}

let gelClient: ReturnType<typeof createClient> | null = null;

export interface SessionOptions {
	instance?: string;
	branch?: string;
}

export function getDatabaseClient(options: SessionOptions = {}) {
	const session = getDefaultConnection();
	const instance = options.instance || session.defaultInstance;
	const branch = options.branch || session.defaultBranch;

	if (!instance) {
		return null;
	}

	const credentialsFile = path.join(
		findProjectRoot(),
		"instance_credentials",
		`${instance}.json`,
	);

	return createClient({
		credentialsFile,
		branch: branch || "main",
	});
}

export async function listInstances(): Promise<string[]> {
	const projectRoot = findProjectRoot();
	const credentialsPath = path.join(projectRoot, "instance_credentials");

	if (!fs.existsSync(credentialsPath)) {
		return [];
	}

	try {
		const files = fs.readdirSync(credentialsPath);
		return files
			.filter((file) => file.endsWith(".json"))
			.map((file) => path.basename(file, ".json"));
	} catch (error) {
		logger.warn("Error scanning instance credentials:", {
			error: error instanceof Error ? error.message : String(error),
		});
		return [];
	}
}

export async function listBranches(instance: string): Promise<string[]> {
	const client = getDatabaseClient({ instance });
	if (!client) {
		return [];
	}

	try {
		const _result = await client.query("SELECT sys::get_version()");
		return ["main"]; // Default branch for now
	} catch (_error) {
		return [];
	}
}

let connections: ReturnType<typeof createClient>[] = [];

export async function initGelClient() {
	try {
		const session = getDefaultConnection();
		const instanceName = session.defaultInstance;
		const branch = session.defaultBranch || "main";

		if (!instanceName) {
			logger.warn(
				"No default instance set, skipping initial client connection",
			);
			return;
		}

		const credentialsFile = path.join(
			findProjectRoot(),
			"instance_credentials",
			`${instanceName}.json`,
		);

		const client = createClient({
			credentialsFile,
			branch,
		});
		gelClient = client;
		connections.push(client);
		logger.info("Gel database connection successful", { instanceName, branch });
	} catch (err) {
		logger.error("Error connecting to Gel database:", {
			error: err instanceof Error ? err.message : String(err),
		});
		throw err;
	}
}

export async function closeAllConnections() {
	for (const connection of connections) {
		if (connection && typeof connection.close === "function") {
			await connection.close();
		}
	}
	connections = [];
}

export { gelClient };

// Query builder integration
export async function loadQueryBuilder(
	_instance: string,
	_branch: string = "main",
) {
	const projectRoot = findProjectRoot();
	const qbPath = path.join(projectRoot, "src", "edgeql-js", "index.js");

	try {
		const { pathToFileURL } = await import("node:url");
		const qbModule = await import(pathToFileURL(qbPath).href);
		return qbModule;
	} catch (error: unknown) {
		logger.warn("Failed to load query builder:", {
			error: error instanceof Error ? error.message : String(error),
		});
		return null;
	}
}

export function getDebugInfo(): {
	projectRoot: string;
	cwd: string;
	dirname: string;
} {
	return {
		projectRoot: findProjectRoot(),
		cwd: process.cwd(),
		dirname: __dirname,
	};
}

export function getAvailableInstances(): string[] {
	const projectRoot = findProjectRoot();
	const credentialsPath = path.join(projectRoot, "instance_credentials");

	if (!fs.existsSync(credentialsPath)) {
		return [];
	}

	try {
		const files = fs.readdirSync(credentialsPath);
		return files
			.filter((file) => file.endsWith(".json"))
			.map((file) => path.basename(file, ".json"));
	} catch (error) {
		logger.warn("Error scanning instance credentials:", {
			error: error instanceof Error ? error.message : String(error),
		});
		return [];
	}
}
