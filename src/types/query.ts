import { z } from "zod";
import { ToolStatusSchema } from "./mcp.js";

export const QueryActionSchema = z.enum(["validate", "run", "file"]);

export const QueryResponseSchema = z.object({
	action: QueryActionSchema,
	status: ToolStatusSchema,
	instance: z.string().optional(),
	branch: z.string().optional(),
	autoSelected: z.boolean().optional(),
	rowCount: z.number().int().nonnegative().optional(),
	resultPreview: z.string().optional(),
	argsUsed: z.record(z.string(), z.any()).optional(),
	filePath: z.string().optional(),
	resourceUri: z.string().optional(),
	diagnostics: z.array(z.string()).default([]),
	errorCode: z.string().optional(),
});

export type QueryAction = z.infer<typeof QueryActionSchema>;
export type QueryResponse = z.infer<typeof QueryResponseSchema>;
