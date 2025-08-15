import { onConnectionChanged } from "./events.js";

type CacheEntry<T> = { value: T; expiresAt: number };

const store = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | undefined {
	const entry = store.get(key);
	if (!entry) return undefined;
	if (Date.now() > entry.expiresAt) {
		store.delete(key);
		return undefined;
	}
	return entry.value as T;
}

export function setCached<T>(key: string, value: T, ttlMs: number): void {
	store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function deleteByPrefix(prefix: string): void {
	for (const key of store.keys()) {
		if (key.startsWith(prefix)) store.delete(key);
	}
}

export function buildSchemaCacheKey(
	kind: "get-schema" | "list-schema-types",
	instance: string,
	branch?: string,
): string {
	const b = branch ?? "";
	return `schema:${kind}:${instance}:${b}`;
}

function invalidateSchemaFor(instance?: string, branch?: string) {
	if (!instance) return;
	const prefixGet = buildSchemaCacheKey("get-schema", instance, branch);
	const prefixList = buildSchemaCacheKey("list-schema-types", instance, branch);
	// Use exact deletes; also clear broader prefixes for safety
	store.delete(prefixGet);
	store.delete(prefixList);
	deleteByPrefix(`schema:get-schema:${instance}:`);
	deleteByPrefix(`schema:list-schema-types:${instance}:`);
}

onConnectionChanged(({ instance, branch }) => {
	invalidateSchemaFor(instance, branch);
});
