import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface ElicitationParams {
	message: string;
	requestedSchema: unknown;
}

type ElicitInputFn = (params: ElicitationParams) => Promise<{
	action: string;
	content?: unknown;
}>;

export function getElicitInputFunction(server: McpServer): ElicitInputFn | null {
	const candidate = server as unknown as {
		elicitInput?: ElicitInputFn;
		server?: { elicitInput?: ElicitInputFn };
	};

	if (typeof candidate.elicitInput === "function") {
		return candidate.elicitInput.bind(server);
	}

	if (typeof candidate.server?.elicitInput === "function") {
		return candidate.server.elicitInput.bind(candidate.server);
	}

	return null;
}

export async function runElicitation(
	server: McpServer,
	params: ElicitationParams,
): Promise<{ action: string; content?: unknown } | null> {
	const fn = getElicitInputFunction(server);
	if (!fn) {
		return null;
	}
	try {
		return await fn(params);
	} catch {
		return null;
	}
}
