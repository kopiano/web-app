"""Run with Python Playwright installed; optionally pass a real TTS WAV path."""
import io
import json
import math
import os
from pathlib import Path
import signal
import struct
import subprocess
import sys
import time
import urllib.request
import wave

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = 'http://127.0.0.1:3012'
HTML = '''<html><head><meta charset="utf-8"></head><body><button id="send">Send</button><div id="root"></div>
<script type="module">
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => type => type;
window.__vite_plugin_react_preamble_installed__ = true;
const ReactModule = await import('/node_modules/.vite/deps/react.js');
const React = ReactModule.default || ReactModule;
const DomModule = await import('/node_modules/.vite/deps/react-dom_client.js');
const {createRoot} = DomModule.default || DomModule;
const {default: Player} = await import('/src/components/AutomaticVoicePlayback.tsx');
const api = await import('/src/api/voice.js');
const root = createRoot(document.getElementById('root'));
window.started = 0; window.errors = 0; window.ended = 0;
document.addEventListener('ended', () => window.ended++, true);
localStorage.setItem('token', 'isolated-test-token');
window.renderPlayer = props => root.render(React.createElement(Player, {
  onStarted: () => window.started++, onError: () => window.errors++,
  audioContext: window.context, ...props
}));
document.querySelector('#send').onclick = async () => {
  try {
    window.context = new AudioContext();
    await window.context.resume();
    if (api.canUseCharacterTtsDirectStream()) throw new Error('Token session must use HTTP');
    const result = await api.generateCharacterTts({
      character_id: 'test-character', text: '你好！我在呢。想聊点什么？',
      language: 'en', speed_factor: 1
    });
    window.props = {segments: [result.audio_url, result.audio_url], enabled: false, autoPlay: true};
    window.renderPlayer(window.props);
    window.generated = true;
  } catch(error) { window.testError = String(error); }
};
window.ready = true;
</script></body></html>'''

if len(sys.argv) > 1:
    audio = Path(sys.argv[1]).read_bytes()
else:
    output = io.BytesIO()
    with wave.open(output, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(24000)
        wav.writeframes(b''.join(struct.pack('<h', int(2000 * math.sin(n / 24000 * 2 * math.pi * 440)))
                                 for n in range(9600)))
    audio = output.getvalue()

server = subprocess.Popen(['npm', 'run', 'dev', '--', '--host', '127.0.0.1', '--port', '3012'],
                          cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                          start_new_session=True)
try:
    for _ in range(100):
        if server.poll() is not None:
            raise RuntimeError('Test Vite server exited before startup')
        try:
            urllib.request.urlopen(BASE, timeout=1)
            break
        except OSError:
            time.sleep(.2)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        failures = []
        page.on('pageerror', lambda error: failures.append(str(error)))
        page.route('**/__voice_test', lambda route: route.fulfill(content_type='text/html', body=HTML))
        page.route('**/voice.wav', lambda route: route.fulfill(content_type='audio/wav', body=audio))
        requests = []

        def tts(route):
            requests.append(route.request)
            route.fulfill(json={'code': 200, 'data': {'audio_url': BASE + '/voice.wav'}}, headers={
                'Access-Control-Allow-Origin': BASE,
                'Access-Control-Allow-Credentials': 'true',
                'Access-Control-Allow-Headers': 'authorization,content-type',
            })

        page.route('**/api/tts', tts)
        page.goto(BASE + '/__voice_test')
        page.wait_for_function('window.ready === true')
        page.click('#send')
        page.wait_for_function('window.generated || window.testError')
        assert page.evaluate('window.testError') is None
        posts = [request for request in requests if request.method == 'POST']
        assert len(posts) == 1
        assert posts[0].headers.get('authorization') == 'Bearer isolated-test-token'
        assert json.loads(posts[0].post_data)['language'] == 'zh'
        page.wait_for_timeout(250)
        assert page.evaluate('started') == 0, 'Do not play before text is sent'
        assert page.locator('audio:visible').count() == 0
        page.evaluate('renderPlayer({...props, enabled: true})')
        page.wait_for_function('started === 1')
        page.wait_for_function('document.querySelector("audio").currentTime > 0.1')
        page.evaluate('renderPlayer({...props, enabled: true, autoPlay: false})')
        page.wait_for_function('ended === 2', timeout=30000)
        assert page.evaluate('started') == 1
        assert page.evaluate('errors') == 0
        assert not failures, failures
        print('PASS: authenticated Chinese synthesis request, real media playback, sent gate, hidden controls, repeated cached segments')
        browser.close()
finally:
    if server.poll() is None:
        os.killpg(server.pid, signal.SIGTERM)
    server.wait(timeout=10)
