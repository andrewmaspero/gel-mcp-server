import { z } from "zod";
import { ToolStatusSchema } from "./mcp.js";

export const QueryActionSchema = z.enum(["validate", "run", "file"]);

export const QueryResponseSchema = z.object({
	action: QueryActionSchema,
	status: ToolStatusSchema,
	message: z.string(),
	instance: z.string().optional(),
	branch: z.string().optional(),
	autoSelected: z.boolean().optional(),
	rowCount: z.number().int().nonnegative().optional(),
	limitApplied: z.number().int().positive().optional(),
	format: z.enum(["json", "text"]).optional(),
	resultPreview: z.string().optional(),
	rowsTruncated: z.boolean().optional(),
	argsUsed: z.record(z.string(), z.any()).optional(),
	query: z.string().optional(),
	filePath: z.string().optional(),
	resourceUri: z.string().optional(),
	samplingSummary: z.string().optional(),
	diagnostics: z.array(z.string()).default([]),
	errorCode: z.string().optional(),
});

export type QueryAction = z.infer<typeof QueryActionSchema>;
export type QueryResponse = z.infer<typeof QueryResponseSchema>;
