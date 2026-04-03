'use strict';
const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { parseLastRunAt, parseLastSummary } = require('../status.js');

test('parseLastRunAt returns null for empty log', () => {
  assert.equal(parseLastRunAt(''), null);
});

test('parseLastRunAt extracts timestamp from last starting line', () => {
  const log = `[2026-04-04 01:36:13] === PM Agent starting ===\nsome output\n[2026-04-04 01:37:42] Done.\n`;
  const result = parseLastRunAt(log);
  assert.equal(result, new Date('2026-04-04T01:36:13').getTime());
});

test('parseLastRunAt picks the LAST starting line when multiple runs exist', () => {
  const log = [
    '[2026-04-03 10:00:00] === PM Agent starting ===',
    'first run output',
    '[2026-04-03 10:01:00] Done.',
    '[2026-04-04 01:36:13] === PM Agent starting ===',
    'second run output',
    '[2026-04-04 01:37:42] Done.',
  ].join('\n');
  const result = parseLastRunAt(log);
  assert.equal(result, new Date('2026-04-04T01:36:13').getTime());
});

test('parseLastSummary returns null for empty log', () => {
  assert.equal(parseLastSummary(''), null);
});

test('parseLastSummary returns first non-empty line between starting and Done', () => {
  const log = `[2026-04-04 01:36:13] === PM Agent starting ===\n\nRun complete. Here's the summary:\n- MTB-6 moved to In Design\n[2026-04-04 01:37:42] Done.\n`;
  const result = parseLastSummary(log);
  assert.equal(result, "Run complete. Here's the summary:");
});

test('parseLastSummary returns null if no Done line follows starting line', () => {
  const log = `[2026-04-04 01:36:13] === PM Agent starting ===\nstill running\n`;
  assert.equal(parseLastSummary(log), null);
});
