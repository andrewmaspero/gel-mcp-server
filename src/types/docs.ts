import { z } from "zod";
import { ToolStatusSchema } from "./mcp.js";

export const DocsMatchSchema = z.object({
	id: z.number(),
	filePath: z.string(),
	startLine: z.number(),
	endLine: z.number(),
	score: z.number(),
	snippet: z.string(),
	truncated: z.boolean().optional(),
	resourceUri: z.string().optional(),
});

export const DocsSearchResultSchema = z.object({
	term: z.string(),
	totalMatches: z.number(),
	returned: z.number(),
	matches: z.array(DocsMatchSchema),
});

export const DocsResponseSchema = z.object({
	status: ToolStatusSchema,
	message: z.string(),
	result: DocsSearchResultSchema,
});

export type DocsMatch = z.infer<typeof DocsMatchSchema>;
export type DocsSearchResult = z.infer<typeof DocsSearchResultSchema>;
