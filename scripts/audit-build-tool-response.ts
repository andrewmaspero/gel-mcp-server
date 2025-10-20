import path from "node:path";
import process from "node:process";
import { writeBuildToolResponseReport } from "../src/analysis/buildToolResponseAudit.js";

async function main() {
	const targetPath = path.resolve("docs/reports/buildToolResponse-map.json");
	const report = writeBuildToolResponseReport(targetPath);
	const totalCalls = report.reduce((sum, entry) => sum + entry.calls.length, 0);
	// eslint-disable-next-line no-console -- intentional CLI feedback
	console.log(
		`Wrote ${totalCalls} buildToolResponse call(s) across ${report.length} tool module(s) to ${path.relative(process.cwd(), targetPath)}`,
	);
}

main().catch((error) => {
	// eslint-disable-next-line no-console -- intentional CLI error feedback
	console.error(error);
	process.exitCode = 1;
});
