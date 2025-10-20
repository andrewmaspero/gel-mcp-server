import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DefaultToolResponseData } from "../utils.js";
import type { ToolResponse } from "../types/mcp.js";
import { registerConnection } from "../tools/connection.js";
import * as common from "../tools/connection/common.js";

const createResponse = (summary: string): ToolResponse<DefaultToolResponseData> => ({
	content: [{ type: "text", text: summary }],
	structuredContent: {
		meta: {
			status: "ok",
			summary,
			details: [],
			nextSteps: [],
		},
		data: {
			title: summary,
			textSections: [],
			nextSteps: [],
		},
	},
});

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

describe("registerConnection", () => {
	const spies: jest.SpyInstance[] = [];

	beforeEach(() => {
		spies.push(jest.spyOn(common, "enforceRateLimit").mockImplementation(() => {}));
		spies.push(
			jest
				.spyOn(common, "handleAutoConnection")
				.mockReturnValue(createResponse("auto") as unknown as ReturnType<typeof common.handleAutoConnection>),
		);
		spies.push(
			jest
				.spyOn(common, "handleGetConnection")
				.mockReturnValue(createResponse("get") as unknown as ReturnType<typeof common.handleGetConnection>),
		);
		spies.push(
			jest
				.spyOn(common, "handleSetConnection")
				.mockReturnValue(createResponse("set") as unknown as ReturnType<typeof common.handleSetConnection>),
		);
		spies.push(
			jest
				.spyOn(common, "handleListInstances")
				.mockReturnValue(createResponse("listInstances") as unknown as ReturnType<typeof common.handleListInstances>),
		);
		spies.push(
			jest
				.spyOn(common, "handleListCredentials")
				.mockReturnValue(createResponse("listCredentials") as unknown as ReturnType<typeof common.handleListCredentials>),
		);
		spies.push(
			jest
				.spyOn(common, "handleListBranches")
				.mockReturnValue(createResponse("listBranches") as unknown as ReturnType<typeof common.handleListBranches>),
		);
		spies.push(
			jest
				.spyOn(common, "handleSwitchBranch")
				.mockReturnValue(createResponse("switchBranch") as unknown as ReturnType<typeof common.handleSwitchBranch>),
		);
	});

	afterEach(() => {
		spies.splice(0).forEach((spy) => spy.mockRestore());
	});

	it("registers intent-level connection tools plus legacy shim", () => {
		const { server, tools } = createMockServer();

		registerConnection(server);

		expect(Array.from(tools.keys()).sort()).toEqual([
			"connection",
			"connection.auto",
			"connection.get",
			"connection.list-branches",
			"connection.list-credentials",
			"connection.list-instances",
			"connection.set",
			"connection.switch-branch",
		]);

		const legacyMeta = tools.get("connection")?.meta;
		expect(legacyMeta?.description).toMatch(/legacy consolidated/i);
	});

	it("delegates handlers to shared implementations with rate limiting", async () => {
		const { server, tools } = createMockServer();
		registerConnection(server);

		const auto = tools.get("connection.auto");
		expect(auto).toBeDefined();
		await auto?.handler({});
		expect(common.handleAutoConnection).toHaveBeenCalledTimes(1);
		expect(common.enforceRateLimit).toHaveBeenCalledWith("connection.auto");

		const legacy = tools.get("connection");
		expect(legacy).toBeDefined();

		await legacy?.handler({ action: "get" });
		expect(common.handleGetConnection).toHaveBeenCalledTimes(1);

		await legacy?.handler({ action: "listInstances" });
		expect(common.handleListInstances).toHaveBeenCalledTimes(1);

		await legacy?.handler({ action: "listCredentials" });
		expect(common.handleListCredentials).toHaveBeenCalledTimes(1);

		await legacy?.handler({ action: "listBranches", instance: "demo" });
		expect(common.handleListBranches).toHaveBeenCalledWith("demo");

		await legacy?.handler({ action: "switchBranch", instance: "demo", branch: "feature" });
		expect(common.handleSwitchBranch).toHaveBeenCalledWith({ instance: "demo", branch: "feature" });

		await legacy?.handler({ action: "set", instance: "demo", branch: "main" });
		expect(common.handleSetConnection).toHaveBeenCalledWith({ instance: "demo", branch: "main" });

		await legacy?.handler({});
		expect(common.handleAutoConnection).toHaveBeenCalledTimes(2);
	});
});
