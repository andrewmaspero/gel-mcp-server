import { z } from "zod";
import { ToolStatusSchema } from "./mcp.js";

export const ConnectionActionSchema = z.enum([
	"auto",
	"set",
	"get",
	"listInstances",
	"listCredentials",
	"listBranches",
	"switchBranch",
]);

export const ConnectionStateSchema = z.object({
	defaultInstance: z.string().nullable(),
	defaultBranch: z.string().nullable(),
	autoSelected: z.boolean().optional(),
});

export const ConnectionBranchSchema = z.object({
	name: z.string(),
	current: z.boolean(),
});

export const ConnectionResponseSchema = z.object({
	action: ConnectionActionSchema,
	status: ToolStatusSchema,
	message: z.string(),
	state: ConnectionStateSchema.optional(),
	instances: z.array(z.string()).optional(),
	branches: z.array(ConnectionBranchSchema).optional(),
	notes: z.array(z.string()).default([]),
	errorCode: z.string().optional(),
});

export type ConnectionAction = z.infer<typeof ConnectionActionSchema>;
export type ConnectionState = z.infer<typeof ConnectionStateSchema>;
export type ConnectionBranch = z.infer<typeof ConnectionBranchSchema>;
export type ConnectionResponse = z.infer<typeof ConnectionResponseSchema>;
