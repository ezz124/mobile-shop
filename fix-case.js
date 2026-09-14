const fs = require('fs');
const path = 'e:/mbile-erp/server/core/ipc.ts';
let content = fs.readFileSync(path, 'utf8');

// Fix: replace mode: 'insensitive' with mode: 'insensitive' as const
content = content.replaceAll("mode: 'insensitive' }", "mode: 'insensitive' as const }");

fs.writeFileSync(path, content);
console.log('Done!');
