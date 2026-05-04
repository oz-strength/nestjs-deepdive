const { existsSync, writeFileSync } = require('fs');
const { join } = require('path');

// prettier v3 ships index.cjs + index.mjs but no index.js
// VS Code Prettier extension resolves the file path directly and expects index.js
const shimPath = join(__dirname, '..', 'node_modules', 'prettier', 'index.js');
if (!existsSync(shimPath)) {
  writeFileSync(shimPath, "module.exports = require('./index.cjs');\n");
  console.log('postinstall: created prettier/index.js shim for VS Code compatibility');
}
