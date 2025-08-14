import fs from "node:fs";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDebugInfo } from "../database.js";
import { registerConnection } from "./connection.js";
import { registerDocs } from "./docs.js";
import { registerCacheTools } from "./cache.js";
import { registerPrompts } from "./prompts.js";
import { registerQuery } from "./query.js";
import { registerSchema } from "./schema.js";

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

	// Consolidated tools
	registerConnection(server);
	registerSchema(server);
	registerQuery(server);
	registerDocs(server);
    registerPrompts(server);
    registerCacheTools(server);

	// Advertise capabilities for clients that inspect during initialize
	// Note: McpServer will expose these automatically based on handlers,
	// but explicitly initializing reduces ambiguity in some clients.
}
