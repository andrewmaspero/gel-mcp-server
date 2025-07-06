import fs from "node:fs";
import path from "node:path";
import { createClient } from "gel";
import { createLogger } from "./logger.js";

const logger = createLogger("database");

export function findProjectRoot(): string {
	let currentDir = process.cwd();
	const root = path.parse(currentDir).root;

	while (currentDir !== root) {
		const packageJsonPath = path.join(currentDir, "package.json");
		if (fs.existsSync(packageJsonPath)) {
			return currentDir;
		}
		currentDir = path.dirname(currentDir);
	}

	logger.warn(
		"Could not find project root with package.json, falling back to process.cwd()",
	);
	return process.cwd();
}

let gelClient: ReturnType<typeof createClient> | null = null;

export interface SessionOptions {
	instance?: string;
	branch?: string;
}

interface SessionState {
	defaultInstance?: string;
	defaultBranch?: string;
}

const sessionState: SessionState = {};

export function setDefaultConnection(instance?: string, branch?: string) {
	sessionState.defaultInstance = instance;
	sessionState.defaultBranch = branch;
}

export function getDefaultConnection() {
	return sessionState;
}

export function getDatabaseClient(options: SessionOptions = {}) {
	const instance = options.instance || sessionState.defaultInstance;
	const branch = options.branch || sessionState.defaultBranch;

	if (!instance) {
		return null;
	}

	return createClient({
		instanceName: instance,
		branch: branch || "main",
		credentials: path.join(findProjectRoot(), "instance_credentials"),
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

		const client = createClient({
			instanceName,
			branch,
			credentials: path.join(findProjectRoot(), "instance_credentials"),
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
	const qbPath = path.join(projectRoot, "src", "edgeql-js");

	try {
		const qbModule = await import(qbPath);
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
