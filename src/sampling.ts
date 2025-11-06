export type SamplingRole = "system" | "user" | "assistant";

export interface SamplingMessage {
	role: SamplingRole;
	content: string;
}

export interface SamplingRequest {
	purpose: string;
	messages: SamplingMessage[];
	maxTokens?: number;
	temperature?: number;
}

export interface SamplingResult {
	summary: string;
	raw?: unknown;
}

type SamplingProvider = (request: SamplingRequest) => Promise<SamplingResult | null>;

let provider: SamplingProvider | null = null;
let configEnabled: boolean | null = null;
let maxTokensOverride: number | null = null;

export function setSamplingConfig(enabled: boolean, maxTokens?: number) {
	configEnabled = enabled;
	maxTokensOverride =
		typeof maxTokens === "number" && Number.isFinite(maxTokens)
			? maxTokens
			: null;
}

export function setSamplingProvider(fn: SamplingProvider | null) {
	provider = fn;
}

export async function requestSampling(
	request: SamplingRequest,
): Promise<SamplingResult | null> {
	if (!provider || configEnabled === false) {
		return null;
	}
	const effectiveRequest = {
		...request,
		maxTokens:
			request.maxTokens ??
			(maxTokensOverride !== null ? maxTokensOverride : request.maxTokens),
	};
	try {
		return await provider(effectiveRequest);
	} catch {
		return null;
	}
}
