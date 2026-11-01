import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFallbackModels, createFallbackModelChain } from '../src/services/api/fallbackModels.mjs';

test('2.1.310 comma-separated model options preserve order and custom IDs', () => {
  assert.deepEqual(parseFallbackModels(undefined), []);
  assert.deepEqual(parseFallbackModels('model-a'), ['model-a']);
  assert.deepEqual(parseFallbackModels(' model-a, vendor/model-b ,default'), ['model-a','vendor/model-b','default']);
});

test('invalid or cyclical model chains are rejected explicitly', () => {
  for (const option of ['', ' ,model-a', 'model-a,', 'model-a,,model-b',
    'model-a, model-a', 'model a', '--version', 'https://bad.example']) {
    assert.throws(() => parseFallbackModels(option), /Invalid|Duplicate/);
  }
  assert.throws(() => parseFallbackModels('main,other', 'main'), /primary model/);
  assert.throws(() => parseFallbackModels(123), TypeError);
});

test('overload fallback moves through each model only once then stops', () => {
  const chain = createFallbackModelChain('model-b,model-c');
  assert.equal(chain.next('model-a'), 'model-b');
  assert.equal(chain.advance('model-a'), 'model-b');
  assert.equal(chain.next('model-b'), 'model-c');
  assert.equal(chain.advance('model-b'), 'model-c');
  assert.equal(chain.next('model-c'), undefined);
  assert.equal(chain.advance('model-c'), undefined);
  assert.equal(chain.next('model-b'), undefined);
});

test('fallback chain never returns current model or loops back to previously used models', () => {
  const chain = createFallbackModelChain('model-a,model-b,model-c');
  assert.equal(chain.next('model-a'), 'model-b');
  assert.equal(chain.advance('model-a'), 'model-b');
  assert.equal(chain.advance('model-b'), 'model-c');
  assert.equal(chain.advance('model-c'), undefined);
});
