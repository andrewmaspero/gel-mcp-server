import { z } from "zod";
import { ToolStatusSchema } from "./mcp.js";

export const SchemaActionSchema = z.enum([
	"overview",
	"types",
	"describe",
	"refresh",
]);

export const SchemaResponseSchema = z.object({
	action: SchemaActionSchema,
	status: ToolStatusSchema,
	instance: z.string().optional(),
	branch: z.string().optional(),
	autoSelected: z.boolean().optional(),
	typeName: z.string().optional(),
	overviewCount: z.number().int().nonnegative().optional(),
	listedTypes: z.array(z.string()).optional(),
	schemaJson: z.unknown().optional(),
	generationLog: z.string().optional(),
	notes: z.array(z.string()).default([]),
	errorCode: z.string().optional(),
});

export type SchemaAction = z.infer<typeof SchemaActionSchema>;
export type SchemaResponse = z.infer<typeof SchemaResponseSchema>;
