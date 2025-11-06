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
    "callCount": 4,
    "file": "src/tools/cache.ts",
  },
  {
    "callCount": 1,
    "file": "src/tools/connection/common.ts",
  },
  {
    "callCount": 5,
    "file": "src/tools/docs.ts",
  },
  {
    "callCount": 8,
    "file": "src/tools/query.ts",
  },
  {
    "callCount": 2,
    "file": "src/tools/schema.ts",
  },
]
`);
	});
});
