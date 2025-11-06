import { collectBuildToolResponseCalls } from "../analysis/buildToolResponseAudit.js";

describe("collectBuildToolResponseCalls", () => {
	const report = collectBuildToolResponseCalls();

	it("finds buildToolResponse call sites for each tool file", () => {
		expect(report.length).toBeGreaterThan(0);
		for (const entry of report) {
			expect(entry.calls.length).toBeGreaterThan(0);
		}
	});

	it("matches expected call counts per file", () => {
	const summary = report.map((entry) => ({
		file: entry.file,
		callCount: entry.calls.length,
	}));
	expect(summary).toMatchInlineSnapshot(`
[
  {
    "callCount": 9,
    "file": "src/tools/schema.ts",
  },
]
`);
	});
});
