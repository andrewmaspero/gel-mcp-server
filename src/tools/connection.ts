import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerConnectionAuto } from "./connection/auto.js";
import { registerConnectionGet } from "./connection/get.js";
import { registerConnectionListBranches } from "./connection/listBranches.js";
import { registerConnectionListCredentials } from "./connection/listCredentials.js";
import { registerConnectionListInstances } from "./connection/listInstances.js";
import { registerConnectionSet } from "./connection/set.js";
import { registerConnectionSwitchBranch } from "./connection/switchBranch.js";
import { registerLegacyConnection } from "./connection/legacy.js";

export interface RegisterConnectionToolsOptions {
	registerLegacyTool?: boolean;
}

export function registerConnectionTools(
	server: McpServer,
	options: RegisterConnectionToolsOptions = {},
) {
	const { registerLegacyTool = true } = options;

	registerConnectionAuto(server);
	registerConnectionGet(server);
	registerConnectionSet(server);
	registerConnectionListInstances(server);
	registerConnectionListCredentials(server);
	registerConnectionListBranches(server);
	registerConnectionSwitchBranch(server);

	if (registerLegacyTool) {
		registerLegacyConnection(server);
	}
}

export function registerConnection(server: McpServer) {
	registerConnectionTools(server);
}
