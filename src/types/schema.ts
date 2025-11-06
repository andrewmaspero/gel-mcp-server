import { z } from "zod";
import { ToolStatusSchema } from "./mcp.js";

export const SchemaActionSchema = z.enum([
	"overview",
	"types",
	"describe",
	"refresh",
]);

export const SchemaDescribeShape = z.object({
	typeName: z.string(),
	definition: z.unknown(),
	source: z.string().optional(),
	truncated: z.boolean().optional(),
	resourceUri: z.string().optional(),
	summary: z.string().optional(),
});

export const SchemaOverviewShape = z.object({
	types: z.array(z.string()),
	totalTypes: z.number().int().nonnegative(),
	truncated: z.boolean().optional(),
	resourceUri: z.string().optional(),
	summary: z.string().optional(),
});

export const SchemaRefreshShape = z.object({
	status: z.enum(["queued", "processing", "succeeded", "failed"]),
	command: z.string().optional(),
	durationMs: z.number().int().nonnegative().optional(),
	notes: z.array(z.string()).optional(),
	logResourceUri: z.string().optional(),
	reason: z.string().optional(),
});

export const SchemaResponseSchema = z.object({
	action: SchemaActionSchema,
	status: ToolStatusSchema,
	message: z.string(),
	instance: z.string().optional(),
	branch: z.string().optional(),
	autoSelected: z.boolean().optional(),
	describe: SchemaDescribeShape.optional(),
	overview: SchemaOverviewShape.optional(),
	refresh: SchemaRefreshShape.optional(),
	listedTypes: z.array(z.string()).optional(),
	resourceUri: z.string().optional(),
	diagnostics: z.array(z.string()).default([]),
	errorCode: z.string().optional(),
});

export type SchemaAction = z.infer<typeof SchemaActionSchema>;
export type SchemaResponse = z.infer<typeof SchemaResponseSchema>;
