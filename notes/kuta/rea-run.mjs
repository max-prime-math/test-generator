// Usage: node run.mjs calls.json out.json  — runs REA MCP tool calls in one Ghidra session.
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
const reaRoot = 'C:/Users/Max/scoop/persist/nodejs/cache/_npx/ec0ab2283efe73f6/node_modules/rea-agents';
const tools = 'C:/Users/Max/bnk-decoder/.tools';
const require = createRequire(join(reaRoot, 'package.json'));
const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/client')));
const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/client/stdio')));
const client = new Client({ name: 'kuta-research', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(reaRoot, 'scripts/rea.mjs'), 'mcp'], env: { ...process.env, GHIDRA_INSTALL_DIR: join(tools, 'ghidra/ghidra_12.1.4_PUBLIC'), JAVA_HOME: join(tools, 'jdk/jdk-21.0.12.1+1') } }));
const calls = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = [];
for (const call of calls) {
  const t = Date.now();
  try { out.push({ call, result: await client.callTool(call, { timeout: 7200000, maxTotalTimeout: 7200000 }) }); }
  catch (e) { out.push({ call, error: e.message }); }
  console.log(call.name, ((Date.now() - t) / 1000).toFixed(0) + 's');
  writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
}
await client.close();
