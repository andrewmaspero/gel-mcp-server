import { escapeRegExp } from "../lib/regex.js";

describe("escapeRegExp", () => {
	it("escapes special regex characters", () => {
		const input = "a+b*c?";
		const escaped = escapeRegExp(input);
		// The RegExp.source string escapes special characters, so expect backslashes
		expect(new RegExp(escaped).source).toBe("a\\+b\\*c\\?");
	});
});
