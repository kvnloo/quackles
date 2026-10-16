import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const page=readFileSync('app/process/page.tsx','utf8');
assert.match(page,/<svg className="process-wordmark" aria-hidden="true" focusable="false"/,'ghost wordmark is a decorative non-focusable graphic, not low-contrast prose');
assert.doesNotMatch(page,/<span[^>]*className="process-wordmark"/);
console.log('decorative wordmark contract passed');
