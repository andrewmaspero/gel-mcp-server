import { z } from "zod";

export const CacheScopeSchema = z
	.object({
		instance: z.string().optional(),
		branch: z.string().optional(),
	})
	.partial();

export const CacheClearResultSchema = z.object({
	status: z.enum(["ok", "info"]),
	message: z.string(),
	scope: CacheScopeSchema.optional(),
});

export const CachePeekResultSchema = z.object({
	status: z.enum(["ok", "info"]),
	key: z.string(),
	hit: z.boolean(),
	value: z.unknown().optional(),
});

export type CacheScope = z.infer<typeof CacheScopeSchema>;
export type CacheClearResult = z.infer<typeof CacheClearResultSchema>;
export type CachePeekResult = z.infer<typeof CachePeekResultSchema>;
