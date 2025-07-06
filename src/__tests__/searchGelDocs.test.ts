import { escapeRegExp } from "../tools/searchGelDocs.js";

describe("escapeRegExp", () => {
	it("escapes special regex characters", () => {
		const input = "a+b*c?";
		const escaped = escapeRegExp(input);
		expect(new RegExp(escaped).source).toBe("a\+b\*c\?");
	});
});
