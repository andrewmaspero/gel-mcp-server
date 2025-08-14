import fs from "node:fs";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDebugInfo } from "../database.js";
import { registerDescribeSchema } from "./describeSchema.js";
import { registerExecuteEdgeql } from "./executeEdgeql.js";
import { registerExecuteEdgeqlFile } from "./executeEdgeqlFile.js";
import { registerExecuteTypescript } from "./executeTypescript.js";
import { registerGetSchema } from "./get-schema.js";
import { registerListBranches } from "./list-branches.js";
import { registerListCredentials } from "./list-credentials.js";
import { registerListInstances } from "./list-instances.js";
import { registerListSchemaTypes } from "./list-schema-types.js";
import { registerPrompts } from "./prompts.js";
import { registerRefreshSchema } from "./refreshSchema.js";
import { registerSearchDocs } from "./searchGelDocs.js";
import { registerSessionManagement } from "./session-management.js";
import { registerSwitchBranch } from "./switch-branch.js";
import { registerValidateQuery } from "./validateQuery.js";

export function registerAllTools(server: McpServer) {
	// Debug tool to check working directory and file system
	server.registerTool(
		"debug-filesystem",
		{
			title: "Debug Filesystem",
			description:
				"Debug tool to check current working directory and file system",
			inputSchema: {},
		},
		async () => {
			const cwd = process.cwd();
			const debugInfo = getDebugInfo();
			const files = fs.readdirSync(cwd);
			const credentialsDir = path.join(
				debugInfo.projectRoot,
				"instance_credentials",
			);
			const credentialsExists = fs.existsSync(credentialsDir);
			let credentialFiles: string[] = [];

			if (credentialsExists) {
				credentialFiles = fs.readdirSync(credentialsDir);
			}

			return {
				content: [
					{ type: "text", text: `Current working directory: ${cwd}` },
					{
						type: "text",
						text: `Project root (detected): ${debugInfo.projectRoot}`,
					},
					{ type: "text", text: `Module __dirname: ${debugInfo.dirname}` },
					{ type: "text", text: `Files in CWD: ${files.join(", ")}` },
					{
						type: "text",
						text: `Credentials directory (${credentialsDir}) exists: ${credentialsExists}`,
					},
					{
						type: "text",
						text: `Credential files: ${credentialFiles.join(", ")}`,
					},
				],
			};
		},
	);

	registerExecuteEdgeql(server);
	registerExecuteEdgeqlFile(server);
	registerValidateQuery(server);
	registerDescribeSchema(server);
	registerExecuteTypescript(server);
	registerRefreshSchema(server);
	registerSearchDocs(server);
	registerListInstances(server);
	registerListBranches(server);
	registerSwitchBranch(server);
	registerListCredentials(server);
	registerGetSchema(server);
	registerListSchemaTypes(server);
	registerSessionManagement(server);
	registerPrompts(server);

	// Advertise capabilities for clients that inspect during initialize
	// Note: McpServer will expose these automatically based on handlers,
	// but explicitly initializing reduces ambiguity in some clients.
}
