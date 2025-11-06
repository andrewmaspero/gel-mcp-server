import { execSync as exec } from "node:child_process";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { findProjectRoot, getAvailableInstances } from "../../database.js";
import { emitConnectionChanged } from "../../events.js";
import { updateSchemaWatcher } from "../../schemaWatcher.js";
import { getDefaultConnection, setDefaultConnection } from "../../session.js";
import { buildStructuredResponse } from "../../utils.js";
import {
	checkRateLimit,
	validateBranchName,
	validateInstanceName,
} from "../../validation.js";
import {
	ConnectionResponseSchema,
	type ConnectionAction,
	type ConnectionBranch,
	type ConnectionResponse,
	type ConnectionState,
} from "../../types/connection.js";

export type ToolResult = CallToolResult;

const LEGACY_AUTO_BRANCH = "main";

type ConnectionResultStatus = "success" | "error" | "info" | "warn";

const STATUS_MAP: Record<ConnectionResultStatus, ConnectionResponse["status"]> = {
	success: "ok",
	error: "error",
	info: "info",
	warn: "warn",
};

export function getConnectionOutputSchema() {
	return ConnectionResponseSchema.shape;
}

function toConnectionState(
	sessionState: ReturnType<typeof getDefaultConnection>,
	overrides?: Partial<ConnectionState>,
): ConnectionState {
	const base: ConnectionState = {
		defaultInstance: sessionState.defaultInstance ?? null,
		defaultBranch: sessionState.defaultBranch ?? null,
	};
	return { ...base, ...overrides };
}

function createConnectionResult(
	action: ConnectionAction,
	status: ConnectionResultStatus,
	message: string,
	options: {
		state?: ReturnType<typeof getDefaultConnection> | ConnectionState;
		autoSelected?: boolean;
		instances?: string[];
		branches?: ConnectionBranch[];
		notes?: string[];
		textSections?: string[];
		nextSteps?: string[];
		errorCode?: string;
	} = {},
): ToolResult {
	const {
		state,
		autoSelected,
		instances,
		branches,
		notes,
		textSections,
		nextSteps,
		errorCode,
	} = options;
	const detailSections = textSections ?? notes;

	const resolvedState =
		state && "defaultInstance" in state && "defaultBranch" in state
			? ("autoSelected" in state
					? (state as ConnectionState)
					: toConnectionState(state as ReturnType<typeof getDefaultConnection>, {
							autoSelected,
						}))
			: toConnectionState(getDefaultConnection(), { autoSelected });

	const response = buildStructuredResponse<ConnectionResponse>({
		status,
		title: message,
		textSections: detailSections,
		nextSteps,
		data: {
			action,
			status: STATUS_MAP[status],
			message,
			state: resolvedState,
			instances,
			branches,
			notes: notes ?? detailSections ?? [],
			errorCode,
		},
	});
	return response as unknown as CallToolResult;
}

export function createConnectionError(
	action: ConnectionAction,
	message: string,
	details: string[],
	errorCode?: string,
): ToolResult {
	return createConnectionResult(action, "error", message, {
		notes: details,
		errorCode,
	});
}

export function enforceRateLimit(toolName: string) {
	checkRateLimit(toolName);
}

export function getCurrentConnection() {
	return toConnectionState(getDefaultConnection());
}

export function applyDefaultConnection(
	instance: string,
	branch?: string,
	options: { autoSelected?: boolean } = {},
) {
	setDefaultConnection(instance, branch);
	updateSchemaWatcher();
	const current = getDefaultConnection();
	emitConnectionChanged({
		instance: current.defaultInstance,
		branch: current.defaultBranch,
	});
	return toConnectionState(current, {
		autoSelected: options.autoSelected,
	});
}

export function handleGetConnection(): ToolResult {
	const current = getCurrentConnection();
	const message = current.defaultInstance
		? "Current default connection"
		: "No default connection set";
	const notes = current.defaultInstance
		? ["Use `connection.get` after updates to confirm defaults."]
		: [
				"Run @[connection.auto] to pick the first available instance, or @[connection.set instance=\"<NAME>\" branch=\"main\"] to set one manually.",
			];
	return createConnectionResult("get", "info", message, {
		state: current,
		notes,
	});
}

export function handleListInstances(): ToolResult {
	const instances = getAvailableInstances();
	if (instances.length === 0) {
		return createConnectionResult("listInstances", "warn", "No instances found", {
			notes: [
				"Create 'instance_credentials' and add JSON credential files (e.g., mydb.json).",
			],
		});
	}
	return createConnectionResult("listInstances", "success", `Found ${instances.length} instance(s)`, {
		instances,
		notes: [
			"Next: set a default connection:",
			'@[connection.set instance="<NAME>" branch="main"]',
		],
	});
}

export function handleListCredentials(): ToolResult {
	const instances = getAvailableInstances();
	if (instances.length === 0) {
		return createConnectionResult(
			"listCredentials",
			"warn",
			"No credentials found",
			{
				notes: [
					"Create 'instance_credentials' and add JSON credential files (e.g., mydb.json).",
				],
			},
		);
	}
	return createConnectionResult(
		"listCredentials",
		"success",
		`Found ${instances.length} credential file(s)`,
		{
			instances,
			notes: [
				"Next: set a default connection:",
				'@[connection.set instance="<NAME>" branch="main"]',
			],
		},
	);
}

export function handleListBranches(instanceArg?: string): ToolResult {
	const projectRoot = findProjectRoot();
	const instance = instanceArg || getDefaultConnection().defaultInstance;
	if (!instance) {
		return createConnectionResult("listBranches", "error", "No instance provided", {
			notes: [
				'Provide `instance` or set a default first: @[connection.set instance="<NAME>" branch="main"]',
			],
		});
	}
	try {
		validateInstanceName(instance);
	} catch (error) {
		return createConnectionResult("listBranches", "error", "Invalid instance name", {
			notes: [error instanceof Error ? error.message : String(error)],
			errorCode: "INVALID_INSTANCE",
		});
	}
	const output = exec(`gel branch list --instance=${instance}`, {
		encoding: "utf8",
		timeout: 10000,
		cwd: projectRoot,
	});
	const lines = output.trim().split("\n");
	const branches: ConnectionBranch[] = [];
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
		return createConnectionResult(
			"listBranches",
			"warn",
			`No branches found for '${instance}'`,
			{
				notes: [output],
			},
		);
	}
	return createConnectionResult(
		"listBranches",
		"success",
		`Branches for '${instance}'`,
		{
			branches,
			state: getDefaultConnection(),
			notes: [
				"Next: switch:",
				'@[connection.switch-branch branch="<NAME>"]',
			],
		},
	);
}

export function handleSwitchBranch({
	instance,
	branch,
	confirmed,
	reason,
}: {
	instance?: string;
	branch?: string;
	confirmed: boolean;
	reason?: string;
}): ToolResult {
	const selectedInstance = instance || getDefaultConnection().defaultInstance;
	if (!selectedInstance) {
		return createConnectionResult("switchBranch", "error", "No instance provided", {
			notes: [
				'Set a default first: @[connection.set instance="<NAME>" branch="main"]',
			],
			errorCode: "MISSING_INSTANCE",
		});
	}
	if (!branch) {
		return createConnectionResult("switchBranch", "error", "Missing `branch`", {
			notes: [
				'Provide a branch: @[connection.switch-branch branch="main"]',
			],
			errorCode: "MISSING_BRANCH",
		});
	}
	if (!confirmed) {
		return createConnectionResult(
			"switchBranch",
			"info",
			"Confirmation required before switching branches",
			{
				notes: [
					"Re-run with `confirm: true` once the user has approved the branch change.",
				],
				errorCode: "CONFIRMATION_REQUIRED",
			},
		);
	}
	try {
		validateInstanceName(selectedInstance);
		validateBranchName(branch);
	} catch (error) {
		return createConnectionResult("switchBranch", "error", "Invalid input", {
			notes: [error instanceof Error ? error.message : String(error)],
			errorCode: "INVALID_INPUT",
		});
	}
	exec(`npx gel branch switch ${branch} --instance ${selectedInstance}`, {
		encoding: "utf8",
	});
	const updatedState = applyDefaultConnection(selectedInstance, branch);
	const successNotes = [
		"If you generated new EdgeQL builders, run @[schema.refresh] to sync local types.",
	];
	if (reason) {
		successNotes.push(`Reason provided: ${reason}`);
	}
	return createConnectionResult(
		"switchBranch",
		"success",
		`Switched to branch '${branch}' on '${selectedInstance}'`,
		{
			state: updatedState,
			notes: successNotes,
		},
	);
}

export function createSwitchBranchCancelledResult(
	message: string,
	notes: string[],
): ToolResult {
	return createConnectionResult("switchBranch", "info", message, { notes });
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
			return createConnectionResult("set", "error", "Invalid instance", {
				notes: [error instanceof Error ? error.message : String(error)],
				errorCode: "INVALID_INSTANCE",
			});
		}
	}
	if (branch) {
		try {
			validateBranchName(branch);
		} catch (error) {
			return createConnectionResult("set", "error", "Invalid branch", {
				notes: [error instanceof Error ? error.message : String(error)],
				errorCode: "INVALID_BRANCH",
			});
		}
	}
	const pickedInstance = instance ?? getAvailableInstances().sort()[0];
	if (!pickedInstance) {
		return createConnectionResult("set", "warn", "No instances available", {
			notes: [
				"Create 'instance_credentials' and add a JSON credentials file.",
			],
		});
	}
	const pickedBranch = branch ?? LEGACY_AUTO_BRANCH;
	const autoSelected = !instance;
	const updated = applyDefaultConnection(pickedInstance, pickedBranch, {
		autoSelected,
	});
	return createConnectionResult("set", "success", "Default connection updated", {
		state: updated,
		notes: [
			`Active defaults: ${pickedInstance}/${pickedBranch}`,
			"Use @[connection.get] to confirm or @[connection.switch-branch branch=\"<NAME>\"] to change branches.",
		],
	});
}

export function handleAutoConnection(): ToolResult {
	const current = getCurrentConnection();
	if (current.defaultInstance) {
		return createConnectionResult("auto", "info", "Connection already set", {
			state: current,
			notes: [
				"If you meant to change it, run @[connection.set instance=\"<NAME>\" branch=\"main\"].",
			],
		});
	}
	const instances = getAvailableInstances().sort();
	if (instances.length === 0) {
		return createConnectionResult("auto", "warn", "No instances available", {
			notes: [
				"Create 'instance_credentials' and add a JSON credentials file.",
			],
		});
	}
	const chosen = instances[0];
	const updated = applyDefaultConnection(chosen, LEGACY_AUTO_BRANCH, {
		autoSelected: true,
	});
	return createConnectionResult(
		"auto",
		"success",
		"Auto-selected default connection",
		{
			state: updated,
			notes: [
				`Selected ${chosen}/${LEGACY_AUTO_BRANCH}.`,
				"You can change it:",
				'@[connection.set instance="<NAME>" branch="main"]',
			],
		},
	);
}
