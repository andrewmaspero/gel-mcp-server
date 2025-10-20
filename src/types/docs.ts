import { z } from "zod";
import { ToolStatusSchema } from "./mcp.js";

export const DocsMatchSchema = z.object({
	chunkId: z.number().int().nonnegative(),
	startLine: z.number().int().nonnegative(),
	endLine: z.number().int().nonnegative(),
	score: z.number().min(0).max(100).optional(),
	excerpt: z.string(),
});

export const DocsResponseSchema = z.object({
	action: z.literal("search"),
	status: ToolStatusSchema,
	term: z.string(),
	totalMatches: z.number().int().nonnegative(),
	returned: z.number().int().nonnegative(),
	matches: z.array(DocsMatchSchema),
	notes: z.array(z.string()).default([]),
	errorCode: z.string().optional(),
});

export type DocsResponse = z.infer<typeof DocsResponseSchema>;
