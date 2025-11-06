import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = path.dirname(fileURLToPath(new URL(import.meta.url)));
const repoRoot = path.resolve(__dirname, "../..");
const PNPM_CMD = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const DEFAULT_TIMEOUT_MS = 60_000;

async function withClient(handler) {
	const transport = new StdioClientTransport({
		command: PNPM_CMD,
		args: ["start:stdio"],
		cwd: repoRoot,
		stderr: "pipe",
	});
	const client = new Client({
		name: "promptfoo-mcp-smoke",
		version: "0.1.0",
	});
	try {
		await client.connect(transport, { timeout: DEFAULT_TIMEOUT_MS });
		return await handler(client);
	} finally {
		await client.close();
	}
}

async function executeDocsSearch(term) {
	return withClient(async (client) => {
		const toolResult = await client.callTool({
			name: "docs",
			arguments: {
				action: "search",
				term,
				context_lines: 2,
			},
		});
		return {
			output: JSON.stringify(
				toolResult.structuredContent ?? {
					status: toolResult.isError ? "error" : "ok",
					message:
						toolResult.content?.map((item) => item.text ?? "").join("\n") ?? "",
				},
				null,
				2,
			),
			metadata: {
				toolResult,
			},
		};
	});
}

async function executeListResources() {
	return withClient(async (client) => {
		const resources = await client.listResources({});
		const summary = {
			names: resources.resources?.map((resource) => resource.name) ?? [],
			uris: resources.resources?.map((resource) => resource.uri) ?? [],
			count: resources.resources?.length ?? 0,
		};
		return {
			output: JSON.stringify({ summary, resources }, null, 2),
			metadata: { resources, summary },
		};
	});
}

async function executeListTools() {
	return withClient(async (client) => {
		const tools = await client.listTools({});
		const summary = {
			names: tools.tools?.map((tool) => tool.name) ?? [],
			count: tools.tools?.length ?? 0,
		};
		return {
			output: JSON.stringify({ summary, tools }, null, 2),
			metadata: { tools, summary },
		};
	});
}

export default class GelMcpSmokeProvider {
	id() {
		return "gel-mcp-smoke";
	}

	async callApi(_prompt, context = { vars: {} }) {
		const vars = context?.vars ?? {};
		const action = typeof vars.action === "string" ? vars.action : "list-tools";
		try {
			if (action === "docs-search") {
				const term = typeof vars.term === "string" && vars.term.length > 0 ? vars.term : "connection";
				return await executeDocsSearch(term);
			}
			if (action === "list-resources") {
				return await executeListResources();
			}
			if (action === "list-tools") {
				return await executeListTools();
			}
			return {
				output: JSON.stringify(
					{
						status: "error",
						message: `Unsupported smoke action: ${action}`,
					},
					null,
					2,
				),
				error: `Unsupported smoke action: ${action}`,
			};
		} catch (error) {
			return {
				error: error instanceof Error ? error.message : String(error),
				output: JSON.stringify(
					{
						status: "error",
						reason: error instanceof Error ? error.message : String(error),
					},
					null,
					2,
				),
			};
		}
	}
}
