import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import axios from 'axios';

const source = await readFile(new URL('../src/api/voice.js', import.meta.url), 'utf8');

async function loadVoiceApi(token = null) {
  const requests = [];
  const context = vm.createContext({
    URL, Blob, Error, Promise, TextDecoder,
    window: { location: { origin: 'https://chat.test' }, setTimeout, clearTimeout },
    fetch: async (url, options) => {
      requests.push({ url: String(url), ...options });
      return new Response('data: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: [DONE]\n\n');
    },
    WebSocket: class {
      static OPEN = 1;
      static CONNECTING = 0;
      readyState = 1;
      constructor() { queueMicrotask(() => this.onopen()); }
      send(body) {
        requests.push({ websocket: true, data: JSON.parse(body) });
        queueMicrotask(() => this.onmessage({ data: '{"type":"done"}' }));
      }
      close() { this.readyState = 3; }
    },
  });
  const axiosModule = new vm.SyntheticModule(['default'], function () {
    this.setExport('default', {
      create: options => axios.create({
        ...options,
        adapter: async config => {
          requests.push(config);
          return { config, status: 200, headers: {}, data: {
            code: 200, data: { audio_url: '/api/voice/media/test.wav' },
          } };
        },
      }),
    });
  }, { context });
  const authModule = new vm.SyntheticModule(['authStorage'], function () {
    this.setExport('authStorage', { getToken: () => token });
  }, { context });
  const module = new vm.SourceTextModule(source, {
    context,
    initializeImportMeta(meta) { meta.env = { VITE_API_URL: 'https://api.test/api/' }; },
  });
  await module.link(name => name === 'axios' ? axiosModule : authModule);
  await module.evaluate();
  return { api: module.namespace, requests };
}

test('HTTP synthesis authenticates and speaks the text language, not UI locale', async () => {
  const { api, requests } = await loadVoiceApi('test-token');
  const input = { character_id: 'character', text: '你好！我在呢。', language: 'en', speed_factor: 1 };
  const result = await api.generateCharacterTts(input);
  assert.equal(requests[0].headers.Authorization, 'Bearer test-token');
  assert.equal(JSON.parse(requests[0].data).language, 'zh');
  assert.equal(JSON.parse(requests[0].data).text, input.text);
  assert.equal(input.language, 'en');
  assert.equal(result.audio_url, 'https://api.test/api/voice/media/test.wav');
  assert.equal(api.canUseCharacterTtsDirectStream(), false);
  await api.generateCharacterTts({ ...input, text: 'Hello there!', language: 'zh' });
  assert.equal(JSON.parse(requests[1].data).language, 'en');
});

test('cookie streaming keeps Chinese text for HTTP and WebSocket transports', async () => {
  const { api, requests } = await loadVoiceApi();
  const input = { character_id: 'character', text: '你好，GPT！', language: 'en', speed_factor: 1 };
  assert.equal(api.canUseCharacterTtsDirectStream(), true);
  const url = new URL(api.characterTtsStreamUrl(input));
  assert.equal(url.searchParams.get('language'), 'zh');
  assert.equal(url.searchParams.get('text'), input.text);
  await api.streamCharacterTts(input);
  assert.equal(requests[0].data.language, 'zh');
  assert.equal(requests[0].data.text, input.text);
  assert.equal(url.searchParams.has('token'), false);
});

test('character requests and LLM streaming share the normal login credential', async () => {
  const { api, requests } = await loadVoiceApi('test-token');
  await api.getCharacters();
  assert.equal(requests[0].headers.Authorization, 'Bearer test-token');
  const deltas = [];
  const result = await api.streamLlmReply({ message: 'hello' }, delta => deltas.push(delta));
  assert.equal(requests[1].headers.Authorization, 'Bearer test-token');
  assert.equal(result.text, '你好');
  assert.deepEqual(deltas, ['你好']);
});
