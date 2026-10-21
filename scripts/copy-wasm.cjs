const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm');
const destDir = path.join(__dirname, '../public');
const dest = path.join(destDir, 'sql-wasm.wasm');

if (fs.existsSync(src)) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
  console.log('[copy-wasm] Successfully copied sql-wasm.wasm to public/');
} else {
  console.warn('[copy-wasm] sql.js not installed in node_modules yet; skipping copy.');
}
