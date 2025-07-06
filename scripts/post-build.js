#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const indexPath = path.join(__dirname, "..", "build", "index.js");

try {
	if (fs.existsSync(indexPath)) {
		fs.chmodSync(indexPath, "755");
		console.log("✅ Successfully made index.js executable");
	} else {
		console.warn(
			"⚠️  Warning: build/index.js not found, cannot make executable",
		);
	}
} catch (err) {
	console.error("❌ Error setting permissions:", err.message);
	process.exit(1);
}
