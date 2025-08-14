import { getAvailableInstances, getDatabaseClient } from "./database.js";
import { getDefaultConnection, setDefaultConnection } from "./session.js";
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
export function validateConnectionArgs(args: { instance?: string; branch?: string }) {
    if (args.instance) {
        validateInstanceName(args.instance);
    }
    if (args.branch) {
        validateBranchName(args.branch);
    }
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
