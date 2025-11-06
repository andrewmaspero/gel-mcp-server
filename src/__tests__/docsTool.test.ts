import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { registerDocs } from "../tools/docs.js";

type RegisteredTool = {
	meta: Parameters<McpServer["registerTool"]>[1];
	handler: (args: Record<string, unknown>) => Promise<unknown>;
};

const createMockServer = () => {
	const tools = new Map<string, RegisteredTool>();
	const server = {
	registerTool: (
		name: string,
		meta: Parameters<McpServer["registerTool"]>[1],
		handler: (args: Record<string, unknown>) => Promise<unknown>,
	) => {
			tools.set(name, { meta, handler });
		},
	} as unknown as McpServer;
	return { server, tools };
};

describe("docs tool", () => {
	it("returns structured search results with optional resource links when truncated", async () => {
		const { server, tools } = createMockServer();
		registerDocs(server);

		const docsTool = tools.get("docs");
		expect(docsTool).toBeDefined();

		if (!docsTool) {
			throw new Error("docs tool was not registered");
		}
		const response = (await docsTool.handler({
			term: "EdgeQL",
			context_lines: 10,
		})) as CallToolResult;

		const typedResponse = response as {
			structuredContent?: {
				meta: Record<string, unknown>;
				data: Record<string, unknown>;
			};
			resourceLinks?: Array<Record<string, unknown>>;
		};

		expect(typedResponse.structuredContent).toBeDefined();
	const structured = typedResponse.structuredContent;
	if (!structured) {
		throw new Error("structured content missing on docs response");
	}
	expect(structured.meta.status).toBeDefined();
	const data = structured.data as {
		result?: { matches: unknown[] };
	};
	expect(data.result).toBeDefined();
	expect(data.result?.matches.length ?? 0).toBeGreaterThan(0);

		if (typedResponse.resourceLinks?.length) {
			expect(typedResponse.resourceLinks[0]).toMatchObject({
				type: "resource_link",
				uri: expect.stringContaining("resource://"),
			});
		}
	});
});
