import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

interface RequestContextStore {
	requestId: string;
}

const storage = new AsyncLocalStorage<RequestContextStore>();

export function runWithRequestId<T>(
	requestId: string,
	callback: () => T,
): T {
	return storage.run({ requestId }, callback);
}

export function setRequestId(requestId: string): void {
	storage.enterWith({ requestId });
}

export function ensureRequestId(requestId?: string): string {
	const existing = storage.getStore()?.requestId;
	if (existing) {
		return existing;
	}
	const next = requestId ?? randomUUID();
	storage.enterWith({ requestId: next });
	return next;
}

export function getCurrentRequestId(): string | undefined {
	return storage.getStore()?.requestId;
}
