import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAutoCompactWindowOption as parse } from '../src/services/api/autoCompactWindow.mjs';
test('new auto-compact CLI accepts auto, plain tokens and shorthand', () => {
  for (const [input, expected] of [['auto','auto'],[' AUTO ','auto'],['100k',100000],['500K',500000],['1M',1000000],['200000',200000],['200',200000],['1000',1000000],['750.5k',750500]]) {
    assert.equal(parse(input),expected,input);
  }
});
test('invalid and out-of-range token windows are rejected', () => {
  for (const input of ['', '99k','99','1001','1000001','2m','-100k','1e6','NaN','200mb','0','auto,500k']) {
    assert.equal(parse(input),undefined,input);
  }
});
