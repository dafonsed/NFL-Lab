import { SourceStore } from '../lib/source.mjs';
const result = await new SourceStore().sync();
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
