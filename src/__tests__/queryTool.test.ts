import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { MAX_INLINE_RESPONSE_CHARS } from "../constants.js";
import { registerQuery } from "../tools/query.js";
import type { QueryResponse } from "../types/query.js";
import { getClientWithDefaults } from "../utils.js";
import { createEphemeralTextResource } from "../resources/index.js";
import { requestSampling } from "../sampling.js";

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

jest.mock("../utils.js", () => {
	const actual = jest.requireActual("../utils.js");
	return {
		...actual,
		getClientWithDefaults: jest.fn(),
		validateConnectionArgs: jest.fn(),
	};
});

jest.mock("../resources/index.js", () => ({
	createEphemeralTextResource: jest.fn(() => "resource://ephemeral/test"),
}));

jest.mock("../sampling.js", () => ({
	requestSampling: jest.fn(async () => ({ summary: "Result summary" })),
}));

const mockedGetClientWithDefaults =
	getClientWithDefaults as jest.MockedFunction<typeof getClientWithDefaults>;

const mockedCreateResource = createEphemeralTextResource as jest.MockedFunction<
	typeof createEphemeralTextResource
>;
const mockedRequestSampling = requestSampling as jest.MockedFunction<
	typeof requestSampling
>;

describe("query tool structured responses", () => {
	beforeEach(() => {
		mockedGetClientWithDefaults.mockReset();
		mockedCreateResource.mockClear();
		mockedRequestSampling.mockClear();
	});

	it("returns structured metadata with resource links for large run results", async () => {
		const largeRow = {
			big: "A".repeat(MAX_INLINE_RESPONSE_CHARS + 200),
		};
mockedGetClientWithDefaults.mockReturnValueOnce({
	client: {
		query: jest.fn(async () => [largeRow]),
	},
	instance: "demo",
	branch: "main",
	autoSelected: true,
} as any);

		const { server, tools } = createMockServer();
		registerQuery(server);

		const queryTool = tools.get("query");
		expect(queryTool).toBeDefined();
		if (!queryTool) throw new Error("query tool not registered");

		const response = (await queryTool.handler({
			action: "run",
			query: "SELECT big FROM Thing",
			format: "json",
		})) as CallToolResult;

const structured = (response as {
	structuredContent?: { meta: { status?: string }; data: unknown };
}).structuredContent;
		expect(structured).toBeDefined();
		if (!structured) throw new Error("structured content missing");

		expect(structured.meta.status).toBe("ok");
const data = structured.data as QueryResponse;
		expect(data.action).toBe("run");
		expect(data.status).toBe("ok");
		expect(data.limitApplied).toBe(50);
		expect(data.rowCount).toBe(1);
		expect(data.resourceUri).toBe("resource://ephemeral/test");
		expect(data.samplingSummary).toBe("Result summary");
		expect(data.diagnostics.length).toBeGreaterThan(0);

const contentEntries = (response as {
	content?: Array<Record<string, unknown>>;
}).content;
const resourceEntry = contentEntries?.find((entry) => entry.type === "resource_link");
expect(resourceEntry).toMatchObject({
	uri: "resource://ephemeral/test",
	type: "resource_link",
});

		expect(mockedRequestSampling).toHaveBeenCalledTimes(1);
		expect(mockedCreateResource).toHaveBeenCalledTimes(1);
	});

	it("reports validation success inside structured payload", async () => {
		const txQuery = jest.fn(async () => []);
const transaction = jest.fn(async (fn: (tx: { query: typeof txQuery }) => Promise<void>) => {
	await fn({ query: txQuery });
});

mockedGetClientWithDefaults.mockReturnValueOnce({
	client: {
		transaction: transaction as any,
	},
	instance: "demo",
	branch: "main",
	autoSelected: false,
} as any);

		const { server, tools } = createMockServer();
		registerQuery(server);

		const queryTool = tools.get("query");
		expect(queryTool).toBeDefined();
		if (!queryTool) throw new Error("query tool not registered");

		const response = (await queryTool.handler({
			action: "validate",
			query: "SELECT 1",
		})) as CallToolResult;

const structured = (response as {
	structuredContent?: { meta: { status?: string }; data: unknown };
}).structuredContent;
		expect(structured).toBeDefined();
		if (!structured) throw new Error("structured content missing");

		expect(structured.meta.status).toBe("ok");
		const data = structured.data as QueryResponse;
		expect(data.action).toBe("validate");
		expect(data.status).toBe("ok");
		expect(data.query).toBe("SELECT 1");
		expect(data.diagnostics.length).toBe(0);

		expect(transaction).toHaveBeenCalledTimes(1);
		expect(txQuery).toHaveBeenCalledTimes(1);
	});
});
