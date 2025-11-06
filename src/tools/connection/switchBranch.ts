import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodRawShape } from "zod";
import {
	enforceRateLimit,
	getCurrentConnection,
	getConnectionOutputSchema,
	handleSwitchBranch,
	createSwitchBranchCancelledResult,
	type ToolResult,
} from "./common.js";
import { runElicitation } from "../../elicitation.js";

const TOOL_NAME = "connection.switch-branch";

const inputSchema = {
	instance: z
		.string()
		.optional()
		.describe("Optional. Override the session instance when switching branches."),
	branch: z
		.string()
		.describe("Required. Branch name to switch the connection to."),
	confirm: z
		.boolean()
		.optional()
		.describe("Set to true only after the user has explicitly confirmed the branch change via elicitation."),
} satisfies ZodRawShape;

type BranchSwitchElicitationResponse = {
	confirm: boolean;
	reason?: string;
};

async function requestBranchSwitchConfirmation(
	server: McpServer,
	instance: string,
	branch: string,
) {
	const current = getCurrentConnection();
	const messageParts = [
		`Switch the active branch to '${branch}' on instance '${instance}'.`,
	];
	if (current?.defaultBranch) {
		messageParts.push(`Current default branch: '${current.defaultBranch}'.`);
	}

	const elicitResult = await runElicitation(server, {
		message: messageParts.join(" "),
		requestedSchema: {
			type: "object",
			additionalProperties: false,
			required: ["confirm"],
			properties: {
				confirm: {
					type: "boolean",
					title: "Confirm branch switch",
					description: "Select true to proceed with the branch change.",
					default: false,
				},
				reason: {
					type: "string",
					title: "Reason (optional)",
					description:
						"Provide context for why this branch switch is being performed.",
					minLength: 0,
					maxLength: 200,
				},
			},
		},
	});

	if (!elicitResult) {
		throw new Error("Server does not support elicitation");
	}

	if (elicitResult.action !== "accept" || !elicitResult.content) {
		return { confirmed: false } as const;
	}

	const content = elicitResult.content as BranchSwitchElicitationResponse;
	if (!content.confirm) {
		return { confirmed: false } as const;
	}

	const reason =
		content.reason && content.reason.trim().length > 0
			? content.reason.trim()
			: undefined;
	return { confirmed: true, reason } as const;
}

export function registerConnectionSwitchBranch(server: McpServer) {
	server.registerTool(
		TOOL_NAME,
		{
			title: "Switch Branch",
			description:
				"Switch the active branch for the current or provided instance using `gel branch switch`. Requires prior credentials setup.",
			inputSchema,
			outputSchema: getConnectionOutputSchema(),
		},
		async (args): Promise<ToolResult> => {
			enforceRateLimit(TOOL_NAME);
			const branch = args.branch as string | undefined;
			const currentState = getCurrentConnection();
			const instance =
				(args.instance as string | undefined) ??
				(currentState.defaultInstance ?? undefined);

			if (!branch) {
				return handleSwitchBranch({
					instance,
					branch,
					confirmed: true,
				}) as ToolResult;
			}

			if (!instance) {
				return handleSwitchBranch({
					instance,
					branch,
					confirmed: true,
				}) as ToolResult;
			}

			let confirmed = args.confirm === true;
			let reason: string | undefined;

			if (!confirmed) {
				try {
					const confirmation = await requestBranchSwitchConfirmation(
						server,
						instance ?? "(default instance)",
						branch,
					);
					if (!confirmation.confirmed) {
						return createSwitchBranchCancelledResult("Branch switch cancelled", [
							"Confirmation was declined or cancelled. The active branch remains unchanged.",
						]) as ToolResult;
					}
					confirmed = true;
					reason = confirmation.reason;
				} catch (error) {
					return createSwitchBranchCancelledResult(
						"Branch switch requires manual confirmation",
						[
							`Unable to prompt for confirmation automatically: ${
								error instanceof Error ? error.message : String(error)
							}`,
							"Re-run the tool with `confirm: true` once the user has approved the change.",
						],
					) as ToolResult;
				}
			}

			return handleSwitchBranch({
				instance,
				branch,
				confirmed,
				reason,
			}) as ToolResult;
		},
	);
}
