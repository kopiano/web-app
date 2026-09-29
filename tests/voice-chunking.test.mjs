import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const chat = await readFile(new URL('../src/pages/Chat.tsx', import.meta.url), 'utf8');
const source = chat.slice(chat.indexOf('function takeReadySpeechText('), chat.indexOf('interface VoiceMessagePlayerProps'));
const context = vm.createContext({});
vm.runInContext(ts.transpile(source, { target: ts.ScriptTarget.ES2022 }), context);
const split = (text, flush = false, first = true) =>
  context.takeReadySpeechText(text, flush, 120, 48, first);

test('first Chinese phrase is submitted before the old six-character threshold', () => {
  assert.deepEqual([...split('你好呀！后面还在生成').chunks], ['你好呀！']);
  assert.equal(split('你好呀！后面还在生成').remainder, '后面还在生成');
});

test('unpunctuated Chinese starts after sixteen characters rather than twenty-eight', () => {
  const text = '这是一段没有标点符号的中文回复用来验证首段等待长度';
  const result = split(text);
  assert.equal(result.chunks[0].length, 16);
  assert.equal(result.chunks.join('') + result.remainder, text);
});

test('subsequent short clauses are batched rather than synthesized individually', () => {
  const text = '这是第一句话。这是第二句话。这是第三句话。这是第四句话。';
  const result = split(text, false, false);
  assert.equal(result.chunks.length, 0);
  assert.equal(result.remainder, text);
  assert.deepEqual([...split(text, true, false).chunks], [text]);
});

test('English first chunk ends at a word boundary and flush preserves remaining text', () => {
  const text = 'Understanding automatic voice playback takes a little care.';
  const result = split(text, true);
  assert.equal(result.chunks[0], 'Understanding automatic');
  assert.equal(result.chunks.join(' '), text);
});

test('one large delta still uses a short first chunk and larger subsequent chunks', () => {
  const text = '这是一句用来测试的中文。'.repeat(30);
  const result = split(text, true);
  assert.equal(result.chunks.join(''), text);
  assert.ok(result.chunks[0].length <= 16);
  assert.ok(result.chunks[1].length >= 48);
  assert.ok(result.chunks.length < 10);
});

function scheduler() {
  const timers = new Map();
  const spoken = [];
  let timerId = 0;
  const sandbox = vm.createContext({
    window: {
      setTimeout(callback, delay) { timers.set(++timerId, { callback, delay }); return timerId; },
      clearTimeout(id) { timers.delete(id); },
    },
    generateSpeechChunk: async text => spoken.push(text),
    patchVoiceMessage() {},
    canUseCharacterTtsDirectStream: () => false,
  });
  const start = chat.indexOf('const queueSpeechText =');
  const end = chat.indexOf('voiceReplyInFlightRef.current = true;', start);
  const code = `${source}
    const ttsInput = {}; const env = {};
    let ttsError = null, pendingSpeechText = '', queuedSpeechChunks = 0;
    let firstSpeechTimer, firstSpeechStreamUrl = '', queuedTts = Promise.resolve();
    ${chat.slice(start, end).replaceAll('import.meta.env', 'env')}`;
  vm.runInContext(ts.transpile(code, { target: ts.ScriptTarget.ES2022 }), sandbox);
  return { timers, spoken, sandbox,
    push: (text, flush = false) => vm.runInContext(`queueSpeechText(${JSON.stringify(text)}, ${flush})`, sandbox),
    settle: () => vm.runInContext('queuedTts', sandbox),
  };
}

test('slow Chinese stream submits its first four characters after 150ms, without replay on flush', async () => {
  const queue = scheduler();
  queue.push('你好这是测试');
  assert.equal(queue.spoken.length, 0);
  const [id, timer] = [...queue.timers][0];
  assert.equal(timer.delay, 150);
  queue.timers.delete(id);
  timer.callback();
  await queue.settle();
  assert.deepEqual(queue.spoken, ['你好这是测试']);
  queue.push('后面的内容。', true);
  await queue.settle();
  assert.deepEqual(queue.spoken, ['你好这是测试', '后面的内容。']);
});

test('normal first-chunk dispatch cancels the timer and does not split later text', async () => {
  const queue = scheduler();
  queue.push('你好这是测试');
  assert.equal(queue.timers.size, 1);
  queue.push('。后面的内容仍在生成');
  await queue.settle();
  assert.equal(queue.timers.size, 0);
  assert.deepEqual(queue.spoken, ['你好这是测试。']);
  queue.push('。', true);
  await queue.settle();
  assert.deepEqual(queue.spoken, ['你好这是测试。', '后面的内容仍在生成。']);
});
