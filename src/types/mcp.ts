import { z } from "zod";

export const ToolStatusSchema = z.enum(["ok", "error", "info", "warn"]);
export type ToolStatus = z.infer<typeof ToolStatusSchema>;

export const TokenUsageSchema = z
	.object({
		inline: z.number().nonnegative().optional(),
		total: z.number().nonnegative().optional(),
	})
	.partial()
	.optional();

export const RateLimitHintSchema = z
	.object({
		remaining: z.number().int().nonnegative().optional(),
		resetSeconds: z.number().int().nonnegative().optional(),
	})
	.partial()
	.optional();

export const ToolResponseMetaSchema = z.object({
	status: ToolStatusSchema,
	summary: z.string(),
	details: z.array(z.string()).default([]),
	nextSteps: z.array(z.string()).default([]),
	truncated: z.boolean().optional(),
	tokenUsage: TokenUsageSchema,
	rateLimit: RateLimitHintSchema,
});

export type ToolResponseMeta = z.infer<typeof ToolResponseMetaSchema>;

export function createToolResponseEnvelopeSchema<T extends z.ZodTypeAny>(
	dataSchema: T,
) {
	return z.object({
		meta: ToolResponseMetaSchema,
		data: dataSchema,
	});
}

export type ToolResponseEnvelope<T> = {
	meta: ToolResponseMeta;
	data: T;
};

export type ToolContent =
	| { type: "text"; text: string }
	| {
			type: "resource_link";
			uri: string;
			name: string;
			title?: string;
			description?: string;
			mimeType?: string;
		};

export interface ToolResponse<T> {
	content: ToolContent[];
	structuredContent: ToolResponseEnvelope<T>;
	isError?: boolean;
}
