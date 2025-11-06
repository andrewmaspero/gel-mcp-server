import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerConnection } from "../tools/connection.js";
import type { ToolResponse } from "../types/mcp.js";
import type { ConnectionResponse } from "../types/connection.js";

type SessionState = {
	defaultInstance?: string;
	defaultBranch?: string;
};

let sessionState: SessionState = {};
const setDefaultConnectionMock = jest.fn(
	(instance?: string, branch?: string) => {
		if (instance !== undefined) {
			sessionState.defaultInstance = instance;
		}
		if (branch !== undefined) {
			sessionState.defaultBranch = branch;
		}
	},
);
const getDefaultConnectionMock = jest.fn(() => ({ ...sessionState }));

jest.mock("../session.js", () => ({
	setDefaultConnection: (...args: Parameters<typeof setDefaultConnectionMock>) =>
		setDefaultConnectionMock(...args),
	getDefaultConnection: () => getDefaultConnectionMock(),
}));

let availableInstances = ["alpha", "beta"];
const getAvailableInstancesMock = jest.fn(() => availableInstances.slice());

jest.mock("../database.js", () => ({
	findProjectRoot: () => process.cwd(),
	getAvailableInstances: () => getAvailableInstancesMock(),
}));

const updateSchemaWatcherMock = jest.fn();
jest.mock("../schemaWatcher.js", () => ({
	updateSchemaWatcher: (...args: Parameters<typeof updateSchemaWatcherMock>) =>
		updateSchemaWatcherMock(...args),
}));

const emitConnectionChangedMock = jest.fn();
jest.mock("../events.js", () => ({
	emitConnectionChanged: (...args: Parameters<typeof emitConnectionChangedMock>) =>
		emitConnectionChangedMock(...args),
}));

let branchListOutput = `* main
  feature`;

const execSyncMock = jest.fn((command: string) => {
	if (command.startsWith("gel branch list")) {
		return branchListOutput;
	}
	if (command.startsWith("npx gel branch switch")) {
		return "";
	}
	throw new Error(`Unexpected command: ${command}`);
});

jest.mock("node:child_process", () => ({
	execSync: (command: string) => execSyncMock(command),
}));

type RegisteredTool = {
	meta: Parameters<McpServer["registerTool"]>[1];
	handler: (args: Record<string, unknown>) => Promise<unknown>;
};

const createMockServer = () => {
	const tools = new Map<string, RegisteredTool>();
	const elicitInput = jest.fn(async () => ({
		action: "accept",
		content: { confirm: true, reason: "Scenario approval" },
	}));

	const coreServer = { elicitInput };
	const server = {
		registerTool: (
			name: string,
			meta: Parameters<McpServer["registerTool"]>[1],
			handler: (args: Record<string, unknown>) => Promise<unknown>,
		) => {
			tools.set(name, { meta, handler });
		},
		server: coreServer,
	} as unknown as McpServer;

	return { server, tools, elicitInput };
};

const callTool = async (
	tools: Map<string, RegisteredTool>,
	name: string,
	args: Record<string, unknown>,
) => {
	const entry = tools.get(name);
	if (!entry) {
		throw new Error(`Tool ${name} not registered`);
	}
	const result = (await entry.handler(args)) as ToolResponse<ConnectionResponse>;
	return result;
};

describe("connection intent scenario flow", () => {
	beforeEach(() => {
		sessionState = {};
		setDefaultConnectionMock.mockClear();
		getDefaultConnectionMock.mockClear();
		getDefaultConnectionMock.mockImplementation(() => ({ ...sessionState }));
		availableInstances = ["alpha", "beta"];
		getAvailableInstancesMock.mockClear();
		getAvailableInstancesMock.mockImplementation(() => availableInstances.slice());
		updateSchemaWatcherMock.mockClear();
		emitConnectionChangedMock.mockClear();
		branchListOutput = `* main
  feature`;
		execSyncMock.mockClear();
		execSyncMock.mockImplementation((command: string) => {
			if (command.startsWith("gel branch list")) {
				return branchListOutput;
			}
			if (command.startsWith("npx gel branch switch")) {
				return "";
			}
			throw new Error(`Unexpected command: ${command}`);
		});
	});

	it("walks through auto → get → list → set → list branches → switch flow", async () => {
		const { server, tools, elicitInput } = createMockServer();
		registerConnection(server);

		const auto = await callTool(tools, "connection.auto", {});
		expect(auto.structuredContent.data.state?.defaultInstance).toBe("alpha");
		expect(auto.structuredContent.data.state?.defaultBranch).toBe("main");
		expect(auto.structuredContent.data.state?.autoSelected).toBe(true);
		expect(setDefaultConnectionMock).toHaveBeenLastCalledWith("alpha", "main");

		const currentAfterAuto = await callTool(tools, "connection.get", {});
		expect(currentAfterAuto.structuredContent.data.state?.defaultInstance).toBe("alpha");
		expect(currentAfterAuto.structuredContent.data.status).toBe("info");

		const instances = await callTool(tools, "connection.list-instances", {});
		expect(instances.structuredContent.data.instances).toEqual(["alpha", "beta"]);

		const set = await callTool(tools, "connection.set", {
			instance: "beta",
			branch: "dev",
		});
		expect(set.structuredContent.data.state?.defaultInstance).toBe("beta");
		expect(set.structuredContent.data.state?.defaultBranch).toBe("dev");
		expect(setDefaultConnectionMock).toHaveBeenLastCalledWith("beta", "dev");

		const branches = await callTool(tools, "connection.list-branches", {
			instance: "beta",
		});
		expect(execSyncMock).toHaveBeenCalledWith(
			expect.stringContaining("gel branch list --instance=beta"),
		);
		expect(branches.structuredContent.data.branches?.map((b) => b.name)).toEqual([
			"main",
			"feature",
		]);

		const switchResult = await callTool(tools, "connection.switch-branch", {
			branch: "feature",
		});
		expect(elicitInput).toHaveBeenCalledTimes(1);
		expect(execSyncMock).toHaveBeenCalledWith(
			expect.stringContaining("npx gel branch switch feature --instance beta"),
		);
		expect(setDefaultConnectionMock).toHaveBeenLastCalledWith("beta", "feature");
		expect(emitConnectionChangedMock).toHaveBeenLastCalledWith({
			instance: "beta",
			branch: "feature",
		});
		expect(updateSchemaWatcherMock).toHaveBeenCalled();
		expect(switchResult.structuredContent.data.state?.defaultBranch).toBe("feature");
		expect(switchResult.structuredContent.data.notes).toEqual(
			expect.arrayContaining(["Reason provided: Scenario approval"]),
		);
	});
});
