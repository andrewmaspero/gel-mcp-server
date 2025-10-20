import { transformBuildToolResponse } from "../codemods/replaceBuildToolResponse.js";

const FIXTURE_PATH = "/virtual/tools/example.ts";

describe("transformBuildToolResponse", () => {
	it("rewrites buildToolResponse call and adds data placeholder", () => {
		const input = `
import { buildToolResponse, validate } from "../utils.js";

export function handler() {
	return buildToolResponse({
		status: "success",
		title: "Done",
	});
}
`.trimStart();

		const result = transformBuildToolResponse(input, FIXTURE_PATH);
		expect(result.changed).toBe(true);
		expect(result.stats.replacedCalls).toBe(1);
		expect(result.stats.addedDataPlaceholders).toBe(1);
		expect(result.stats.updatedImports).toBe(1);
		expect(result.outputText).toMatchInlineSnapshot(`
"import { buildStructuredResponse, validate } from "../utils.js";
export function handler() {
    return buildStructuredResponse({
        status: "success",
        title: "Done",
        data: /* TODO: populate structuredContent payload */
        {}
    });
}
"
`);
	});

	it("keeps existing data property intact", () => {
		const input = `
import { buildToolResponse } from "../utils.js";

const respond = () =>
	buildToolResponse({
		status: "error",
		title: "Fail",
		data: { errorCode: "ERR", fixSteps: [] },
	});
`.trimStart();

		const result = transformBuildToolResponse(input, FIXTURE_PATH);
		expect(result.changed).toBe(true);
		expect(result.stats.replacedCalls).toBe(1);
		expect(result.stats.addedDataPlaceholders).toBe(0);
		expect(result.outputText).toMatchInlineSnapshot(`
"import { buildStructuredResponse } from "../utils.js";
const respond = () => buildStructuredResponse({
    status: "error",
    title: "Fail",
    data: { errorCode: "ERR", fixSteps: [] }
});
"
`);
	});

	it("is idempotent when applied twice", () => {
		const input = `
import { buildToolResponse } from "../utils.js";

export const respond = () => buildToolResponse({ status: "info", title: "Info" });
`.trimStart();

		const first = transformBuildToolResponse(input, FIXTURE_PATH);
		expect(first.changed).toBe(true);

		const second = transformBuildToolResponse(first.outputText, FIXTURE_PATH);
		expect(second.changed).toBe(false);
	});
});
