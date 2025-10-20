import { execSync as exec } from "node:child_process";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { findProjectRoot, getAvailableInstances } from "../../database.js";
import { emitConnectionChanged } from "../../events.js";
import { updateSchemaWatcher } from "../../schemaWatcher.js";
import { getDefaultConnection, setDefaultConnection } from "../../session.js";
import { buildToolResponse } from "../../utils.js";
import {
	checkRateLimit,
	validateBranchName,
	validateInstanceName,
} from "../../validation.js";

export type ToolResult = CallToolResult;

const LEGACY_AUTO_BRANCH = "main";

export function enforceRateLimit(toolName: string) {
	checkRateLimit(toolName);
}

export function getCurrentConnection() {
	return getDefaultConnection();
}

export function applyDefaultConnection(instance: string, branch?: string) {
	setDefaultConnection(instance, branch);
	updateSchemaWatcher();
	const current = getDefaultConnection();
	emitConnectionChanged({
		instance: current.defaultInstance,
		branch: current.defaultBranch,
	});
	return current;
}

function toToolResult(options: Parameters<typeof buildToolResponse>[0]): ToolResult {
	return buildToolResponse(options) as unknown as ToolResult;
}

export function handleGetConnection(): ToolResult {
	const current = getDefaultConnection();
	return toToolResult({
		status: "info",
		title: "Current default connection",
		jsonData: current,
	});
}

export function handleListInstances(): ToolResult {
	const instances = getAvailableInstances();
	if (instances.length === 0) {
		return toToolResult({
			status: "warn",
			title: "No instances found",
			textSections: [
				"Create 'instance_credentials' and add JSON credential files (e.g., mydb.json).",
			],
		});
	}
	return toToolResult({
		status: "success",
		title: `Found ${instances.length} instance(s)`,
		jsonData: instances,
		textSections: [
			"Next: set a default connection:",
			'@[connection.set instance="<NAME>" branch="main"]',
		],
	});
}

export function handleListCredentials(): ToolResult {
	const instances = getAvailableInstances();
	if (instances.length === 0) {
		return toToolResult({
			status: "warn",
			title: "No credentials found",
			textSections: [
				"Create 'instance_credentials' and add JSON credential files (e.g., mydb.json).",
			],
		});
	}
	return toToolResult({
		status: "success",
		title: `Found ${instances.length} credential file(s)`,
		jsonData: instances,
		textSections: [
			"Next: set a default connection:",
			'@[connection.set instance="<NAME>" branch="main"]',
		],
	});
}

export function handleListBranches(instanceArg?: string): ToolResult {
	const projectRoot = findProjectRoot();
	const instance = instanceArg || getDefaultConnection().defaultInstance;
	if (!instance) {
		return toToolResult({
			status: "error",
			title: "No instance provided",
			textSections: [
				'Provide `instance` or set a default first: @[connection.set instance="<NAME>" branch="main"]',
			],
		});
	}
	try {
		validateInstanceName(instance);
	} catch (error) {
		return toToolResult({
			status: "error",
			title: "Invalid instance name",
			textSections: [error instanceof Error ? error.message : String(error)],
		});
	}
	const output = exec(`gel branch list --instance=${instance}`, {
		encoding: "utf8",
		timeout: 10000,
		cwd: projectRoot,
	});
	const lines = output.trim().split("\n");
	const branches: Array<{ name: string; current: boolean }> = [];
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("Available branches") || trimmed.startsWith("---")) {
			continue;
		}
		const currentMatch = trimmed.match(/^\*\s+(.+)$/);
		const regularMatch = trimmed.match(/^\s+(.+)$/);
		if (currentMatch) {
			branches.push({ name: currentMatch[1].trim(), current: true });
		} else if (regularMatch) {
			branches.push({ name: regularMatch[1].trim(), current: false });
		} else if (!trimmed.includes(" ")) {
			branches.push({ name: trimmed, current: false });
		}
	}
	if (branches.length === 0) {
		return toToolResult({
			status: "warn",
			title: `No branches found for '${instance}'`,
			textSections: [output],
		});
	}
	return toToolResult({
		status: "success",
		title: `Branches for '${instance}'`,
		jsonData: branches,
		textSections: [
			"Next: switch:",
			'@[connection.switch-branch branch="<NAME>"]',
		],
	});
}

export function handleSwitchBranch({
	instance,
	branch,
}: {
	instance?: string;
	branch?: string;
}): ToolResult {
	const selectedInstance = instance || getDefaultConnection().defaultInstance;
	if (!selectedInstance) {
		return toToolResult({
			status: "error",
			title: "No instance provided",
			textSections: [
				'Set a default first: @[connection.set instance="<NAME>" branch="main"]',
			],
		});
	}
	if (!branch) {
		return toToolResult({
			status: "error",
			title: "Missing `branch`",
			textSections: [
				'Provide a branch: @[connection.switch-branch branch="main"]',
			],
		});
	}
	try {
		validateInstanceName(selectedInstance);
		validateBranchName(branch);
	} catch (error) {
		return toToolResult({
			status: "error",
			title: "Invalid input",
			textSections: [error instanceof Error ? error.message : String(error)],
		});
	}
	exec(`npx gel branch switch ${branch} --instance ${selectedInstance}`, {
		encoding: "utf8",
	});
	updateSchemaWatcher();
	emitConnectionChanged({ instance: selectedInstance, branch });
	return toToolResult({
		status: "success",
		title: `Switched to branch '${branch}' on '${selectedInstance}'`,
	});
}

export function handleSetConnection({
	instance,
	branch,
}: {
	instance?: string;
	branch?: string;
}): ToolResult {
	if (instance) {
		try {
			validateInstanceName(instance);
		} catch (error) {
			return toToolResult({
				status: "error",
				title: "Invalid instance",
				textSections: [error instanceof Error ? error.message : String(error)],
			});
		}
	}
	if (branch) {
		try {
			validateBranchName(branch);
		} catch (error) {
			return toToolResult({
				status: "error",
				title: "Invalid branch",
				textSections: [error instanceof Error ? error.message : String(error)],
			});
		}
	}
	const pickedInstance = instance ?? getAvailableInstances().sort()[0];
	if (!pickedInstance) {
		return toToolResult({
			status: "warn",
			title: "No instances available",
			textSections: [
				"Create 'instance_credentials' and add a JSON credentials file.",
			],
		});
	}
	const pickedBranch = branch ?? LEGACY_AUTO_BRANCH;
	const current = applyDefaultConnection(pickedInstance, pickedBranch);
	return toToolResult({
		status: "success",
		title: "Default connection updated",
		jsonData: current,
	});
}

export function handleAutoConnection(): ToolResult {
	const current = getDefaultConnection();
	if (current.defaultInstance) {
		return toToolResult({
			status: "info",
			title: "Connection already set",
			jsonData: current,
		});
	}
	const instances = getAvailableInstances().sort();
	if (instances.length === 0) {
		return toToolResult({
			status: "warn",
			title: "No instances available",
			textSections: [
				"Create 'instance_credentials' and add a JSON credentials file.",
			],
		});
	}
	const chosen = instances[0];
	const updated = applyDefaultConnection(chosen, LEGACY_AUTO_BRANCH);
	return toToolResult({
		status: "success",
		title: "Auto-selected default connection",
		jsonData: updated,
		textSections: [
			"You can change it:",
			'@[connection.set instance="<NAME>" branch="main"]',
		],
	});
}
