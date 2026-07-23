/* Live in-browser demo framework for the CS486 slides (first used by L17).
 *
 * - Pyodide (real Python + numpy) is loaded lazily, only when a student clicks
 *   "Run", and cached across demos on a deck.
 * - Pure-JS/Canvas demos run instantly with no download.
 * - Each demo lives in a <div class="live-demo" data-demo="NAME"> that already
 *   contains a static .demo-fallback (kept for print/PDF and no-JS). The module
 *   upgrades the mount with an interactive .demo-live layer.
 * - Demo inputs stop key events from reaching reveal.js so typing / sliders do
 *   not trigger slide navigation.
 *
 * Add a new demo by calling register('name', (api) => ({ init, onEnter, onLeave })).
 */

const PYODIDE_VERSION = 'v0.28.3';
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;

/* ---------------------------------------------------------------- helpers -- */

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
}

/* A labelled range slider that reports its live value. */
function slider(label, { min, max, step, value, fmt = (v) => v, oninput }) {
  const val = el('span', { class: 'demo-val', text: fmt(value) });
  const input = el('input', { type: 'range', min, max, step, value });
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    val.textContent = fmt(v);
    oninput && oninput(v);
  });
  const field = el('label', { class: 'demo-field' }, [label + ' ', input, val]);
  return { field, input, get: () => parseFloat(input.value), setText: (t) => (val.textContent = t) };
}

function button(label, onclick, cls = '') {
  return el('button', { class: 'demo-btn ' + cls, type: 'button', onclick }, label);
}

/* --------------------------------------------------------------- Pyodide -- */

let _pyPromise = null;
let _numpyPromise = null;

async function getPyodide(onStatus) {
  if (!_pyPromise) {
    _pyPromise = (async () => {
      onStatus && onStatus('Loading Python runtime (~10 MB, one time)...');
      if (!window.loadPyodide) await loadScript(PYODIDE_BASE + 'pyodide.js');
      const py = await window.loadPyodide({ indexURL: PYODIDE_BASE });
      return py;
    })();
  }
  return _pyPromise;
}

async function getPyodideWithNumpy(onStatus) {
  const py = await getPyodide(onStatus);
  if (!_numpyPromise) {
    _numpyPromise = (async () => {
      onStatus && onStatus('Loading numpy...');
      await py.loadPackage('numpy');
    })();
  }
  await _numpyPromise;
  return py;
}

/* Run Python capturing stdout+stderr into `write`. Returns the last expression
 * value is NOT used; demos read results via py.globals. */
async function runPython(py, code, write) {
  // Pyodide's batched stdout/stderr callback delivers one line at a time
  // WITHOUT the trailing newline, so re-add it for readable multi-line output.
  const restore = [];
  if (py.setStdout) { py.setStdout({ batched: (s) => write(s + '\n') }); restore.push(() => py.setStdout({})); }
  if (py.setStderr) { py.setStderr({ batched: (s) => write(s + '\n', true) }); restore.push(() => py.setStderr({})); }
  try {
    await py.runPythonAsync(code);
  } finally {
    restore.forEach((f) => f());
  }
}

/* --------------------------------------------------- Transformers.js ------ */
/* Lazy, cached embedding model. Only downloads when a student embeds custom
 * text; WebGPU when available, WASM otherwise; failures are caught so callers
 * can fall back to precomputed vectors instead of a broken demo. */

const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1';
let _embedderPromise = null;

async function getEmbedder(onStatus) {
  if (!_embedderPromise) {
    _embedderPromise = (async () => {
      onStatus && onStatus('Loading embedding model (~23 MB, one time)...');
      const mod = await import(/* webpackIgnore: true */ TRANSFORMERS_URL);
      const device = (typeof navigator !== 'undefined' && navigator.gpu) ? 'webgpu' : 'wasm';
      const extractor = await mod.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { device });
      return extractor;
    })().catch((e) => { _embedderPromise = null; throw e; });
  }
  return _embedderPromise;
}

async function embedTexts(extractor, texts, onStatus) {
  const out = [];
  for (let i = 0; i < texts.length; i++) {
    onStatus && onStatus(`Embedding ${i + 1}/${texts.length}...`);
    const r = await extractor(texts[i], { pooling: 'mean', normalize: true });
    out.push(Array.from(r.data));
  }
  return out;
}

/* --- Real (small) causal language model, lazily loaded & cached. Used by L20
 * for tokenization, next-token distributions, and teacher-forcing loss. Just
 * the tokenizer is tiny; the full model is a one-time ~80 MB download. Failures
 * are caught so demos fall back to precomputed samples. */
const LM_MODEL = 'Xenova/distilgpt2';
let _tokPromise = {};
let _lmPromise = null;

async function getTokenizer(id, onStatus) {
  id = id || LM_MODEL;
  if (!_tokPromise[id]) {
    _tokPromise[id] = (async () => {
      onStatus && onStatus('Loading tokenizer (one time)...');
      const mod = await import(/* webpackIgnore: true */ TRANSFORMERS_URL);
      return mod.AutoTokenizer.from_pretrained(id);
    })().catch((e) => { _tokPromise[id] = null; throw e; });
  }
  return _tokPromise[id];
}

async function getCausalLM(id, onStatus) {
  id = id || LM_MODEL;
  if (!_lmPromise) {
    _lmPromise = (async () => {
      onStatus && onStatus('Loading language model (~80 MB, one time)...');
      const mod = await import(/* webpackIgnore: true */ TRANSFORMERS_URL);
      const device = (typeof navigator !== 'undefined' && navigator.gpu) ? 'webgpu' : 'wasm';
      const tokenizer = await mod.AutoTokenizer.from_pretrained(id);
      const model = await mod.AutoModelForCausalLM.from_pretrained(id, { dtype: 'q8', device });
      return { tokenizer, model };
    })().catch((e) => { _lmPromise = null; throw e; });
  }
  return _lmPromise;
}

/* Real chat model (Qwen3-0.6B) via the text-generation pipeline. Bigger, WebGPU
 * when available; gated behind a button and paired with precomputed samples so
 * the slide still teaches if the download/hardware is unavailable. (L21) */
const CHAT_MODEL = 'onnx-community/Qwen3-0.6B-ONNX';
let _chatPromise = null;

async function getChatLM(id, onStatus) {
  id = id || CHAT_MODEL;
  if (!_chatPromise) {
    _chatPromise = (async () => {
      onStatus && onStatus('Loading Qwen3-0.6B (~0.5 GB, one time)...');
      const mod = await import(/* webpackIgnore: true */ TRANSFORMERS_URL);
      const device = (typeof navigator !== 'undefined' && navigator.gpu) ? 'webgpu' : 'wasm';
      const generator = await mod.pipeline('text-generation', id, { device, dtype: 'q4f16' });
      return { generator, mod };
    })().catch((e) => { _chatPromise = null; throw e; });
  }
  return _chatPromise;
}

/* Real CLIP for zero-shot image-text alignment (L23). Small enough to run
 * live; lazily loaded and cached, fallback-safe. */
const CLIP_MODEL = 'Xenova/clip-vit-base-patch32';
let _clipPromise = null;

async function getClip(onStatus) {
  if (!_clipPromise) {
    _clipPromise = (async () => {
      onStatus && onStatus('Loading CLIP (~90 MB, one time)...');
      const mod = await import(/* webpackIgnore: true */ TRANSFORMERS_URL);
      const device = (typeof navigator !== 'undefined' && navigator.gpu) ? 'webgpu' : 'wasm';
      return mod.pipeline('zero-shot-image-classification', CLIP_MODEL, { device });
    })().catch((e) => { _clipPromise = null; throw e; });
  }
  return _clipPromise;
}

/* Stream a chat completion, calling onToken(text) for each new chunk. */
async function chatStream(lm, messages, opts, onToken) {
  const streamer = new lm.mod.TextStreamer(lm.generator.tokenizer, {
    skip_prompt: true, skip_special_tokens: true, callback_function: onToken,
  });
  return lm.generator(messages, {
    max_new_tokens: opts.max || 160,
    do_sample: !!opts.doSample,
    temperature: opts.T, top_k: opts.k, top_p: opts.p,
    streamer,
  });
}

/* Full-sequence logits: returns { ids:number[], logits:Float32Array[seq][vocab
 * as flat], seq, vocab }. logits are the raw scores at every position. */
async function lmForward(lm, text) {
  const enc = await lm.tokenizer(text);
  const out = await lm.model(enc);
  const L = out.logits;                    // Tensor [1, seq, vocab]
  const [, seq, vocab] = L.dims;
  const data = L.data;                     // Float32Array length seq*vocab
  const ids = Array.from(enc.input_ids.data, (x) => Number(x));
  return { ids, data, seq, vocab };
}

function softmaxT(logits, T = 1) {
  let m = -Infinity; for (const x of logits) if (x > m) m = x;
  const e = new Array(logits.length); let s = 0;
  for (let i = 0; i < logits.length; i++) { e[i] = Math.exp((logits[i] - m) / (T || 1)); s += e[i]; }
  for (let i = 0; i < e.length; i++) e[i] /= s;
  return e;
}

/* Indices of the top-k entries of an array (descending by value). */
function topkIdx(arr, k) {
  const idx = Array.from(arr.keys());
  idx.sort((a, b) => arr[b] - arr[a]);
  return idx.slice(0, k);
}

/* ------------------------------------------------------- vector helpers --- */

function cosine(a, b) {
  let s = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return s / ((Math.sqrt(na) * Math.sqrt(nb)) || 1);
}

/* Top principal component of mean-centered rows via power iteration. */
function _topPC(rows, d) {
  const n = rows.length;
  const matVec = (u) => {
    const cu = new Array(n);
    for (let k = 0; k < n; k++) { let s = 0; const r = rows[k]; for (let i = 0; i < d; i++) s += r[i] * u[i]; cu[k] = s; }
    const out = new Array(d).fill(0);
    for (let k = 0; k < n; k++) { const c = cu[k], r = rows[k]; for (let i = 0; i < d; i++) out[i] += r[i] * c; }
    return out;
  };
  const norm = (u) => Math.sqrt(u.reduce((s, x) => s + x * x, 0)) || 1;
  let u = new Array(d).fill(0).map((_, i) => Math.sin(i * 0.7 + 1)); // deterministic seed
  let m = norm(u); u = u.map((x) => x / m);
  for (let it = 0; it < 150; it++) { const v = matVec(u); m = norm(v); u = v.map((x) => x / m); }
  return u;
}

/* Project vectors to 2D with mean-centered PCA (top 2 components). */
function pca2(vectors) {
  const n = vectors.length, d = vectors[0].length;
  const mean = new Array(d).fill(0);
  for (const v of vectors) for (let i = 0; i < d; i++) mean[i] += v[i] / n;
  const C = vectors.map((v) => v.map((x, i) => x - mean[i]));
  const pc1 = _topPC(C, d);
  const C2 = C.map((r) => { let p = 0; for (let i = 0; i < d; i++) p += r[i] * pc1[i]; return r.map((x, i) => x - p * pc1[i]); });
  const pc2 = _topPC(C2, d);
  return C.map((r) => { let a = 0, b = 0; for (let i = 0; i < d; i++) { a += r[i] * pc1[i]; b += r[i] * pc2[i]; } return [a, b]; });
}

/* Small seedable RNG (mulberry32) for reproducible demos. */
function rng32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------- registry --- */

const registry = {};
function register(name, factory) { registry[name] = factory; }

/* ------------------------------------------------------------- canvas ------ */
/* Minimal plotting helpers on a 2D canvas with a data->pixel mapping. */

function makePlot(canvas, { xMin, xMax, yMin, yMax, padL = 34, padR = 10, padT = 10, padB = 22 }) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const sx = (x) => padL + (x - xMin) / (xMax - xMin) * (W - padL - padR);
  const sy = (y) => H - padB - (y - yMin) / (yMax - yMin) * (H - padT - padB);
  return {
    ctx, W, H, sx, sy,
    clear() { ctx.clearRect(0, 0, W, H); },
    axes(xlabel, ylabel) {
      ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(padL, padT); ctx.lineTo(padL, H - padB); ctx.lineTo(W - padR, H - padB); ctx.stroke();
      ctx.fillStyle = '#6b7280'; ctx.font = '11px ui-monospace, monospace';
      if (xlabel) { ctx.textAlign = 'right'; ctx.fillText(xlabel, W - padR, H - 6); }
      if (ylabel) { ctx.save(); ctx.translate(11, padT + 4); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'right'; ctx.fillText(ylabel, 0, 0); ctx.restore(); }
    },
    line(xs, ys, { color = '#1d4ed8', width = 2.5, dash = null } = {}) {
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; if (dash) ctx.setLineDash(dash);
      ctx.beginPath();
      for (let i = 0; i < xs.length; i++) { const px = sx(xs[i]), py = sy(ys[i]); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.stroke(); ctx.restore();
    },
    points(xs, ys, { color = '#1f2937', r = 3 } = {}) {
      ctx.fillStyle = color;
      for (let i = 0; i < xs.length; i++) { ctx.beginPath(); ctx.arc(sx(xs[i]), sy(ys[i]), r, 0, 7); ctx.fill(); }
    },
    dot(x, y, { color = '#dc2626', r = 5 } = {}) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(sx(x), sy(y), r, 0, 7); ctx.fill(); },
  };
}

function canvasEl(w, h) { return el('canvas', { class: 'demo-canvas', width: w, height: h }); }

/* ---------------------------------------------------------- mount/upgrade -- */

function upgrade(root) {
  if (root.__upgraded) return;
  const name = root.dataset.demo;
  const factory = registry[name];
  if (!factory) return;
  root.__upgraded = true;

  const live = el('div', { class: 'demo-live' });
  const status = el('div', { class: 'demo-status' });
  root.appendChild(live);

  // Isolate reveal keyboard nav while interacting inside the demo.
  ['keydown', 'keyup', 'keypress'].forEach((ev) =>
    live.addEventListener(ev, (e) => e.stopPropagation()));

  const setStatus = (msg, kind = '') => { status.textContent = msg || ''; status.className = 'demo-status ' + kind; };

  const api = {
    root, live, status, setStatus, el, slider, button, canvasEl, makePlot,
    getPyodide: () => getPyodide(setStatus),
    getPyodideWithNumpy: () => getPyodideWithNumpy(setStatus),
    runPython,
    getEmbedder: () => getEmbedder(setStatus),
    embedTexts: (ex, texts) => embedTexts(ex, texts, setStatus),
    getTokenizer: (id) => getTokenizer(id, setStatus),
    getCausalLM: (id) => getCausalLM(id, setStatus),
    getChatLM: (id) => getChatLM(id, setStatus),
    getClip: () => getClip(setStatus),
    chatStream, lmForward, softmaxT, topkIdx,
    cosine, pca2, rng32,
  };

  const inst = factory(api) || {};
  root.__inst = inst;
  if (inst.mount) live.appendChild(inst.mount);
  live.appendChild(status);
  if (inst.init) inst.init();
  root.classList.add('is-live');
}

function upgradeAll() { document.querySelectorAll('.live-demo').forEach(upgrade); }

/* ---------------------------------------------------------- reveal hooks --- */

function wireReveal() {
  if (typeof Reveal === 'undefined') { window.addEventListener('load', upgradeAll); return; }
  const start = () => {
    upgradeAll();
    const fire = () => {
      const cur = Reveal.getCurrentSlide();
      document.querySelectorAll('.live-demo').forEach((d) => {
        const inst = d.__inst; if (!inst) return;
        const inside = cur && cur.contains(d);
        if (inside && inst.onEnter) inst.onEnter();
        if (!inside && inst.onLeave) inst.onLeave();
      });
    };
    Reveal.on('slidechanged', fire);
    fire();
  };
  if (Reveal.isReady && Reveal.isReady()) start();
  else Reveal.on('ready', start);
}

/* =====================================================================
 *  DEMO 1 - gradient descent on L(x) = (x-2)^2   (pure JS)
 * ===================================================================== */
register('grad-descent', (api) => {
  const L = (x) => (x - 2) ** 2;
  const dL = (x) => 2 * (x - 2);
  const X0 = -3;
  let x = X0, steps = 0, timer = null, trail = [];

  const canvas = api.canvasEl(440, 240);
  const plot = api.makePlot(canvas, { xMin: -3.2, xMax: 7.2, yMin: -2, yMax: 27 });
  const readout = el('div', { class: 'demo-readout' });
  const etaCtl = api.slider('learning rate \u03b7', { min: 0.01, max: 1.05, step: 0.01, value: 0.1, fmt: (v) => v.toFixed(2) });

  function draw(diverged) {
    plot.clear();
    plot.axes('x', 'L(x)');
    const xs = [], ys = [];
    for (let t = -3.2; t <= 7.2; t += 0.05) { xs.push(t); ys.push(L(t)); }
    plot.line(xs, ys, { color: '#1d4ed8', width: 2.5 });
    plot.dot(2, 0, { color: '#16a34a', r: 4 });
    // trail
    trail.forEach((tx, i) => plot.dot(tx, L(tx), { color: 'rgba(220,38,38,0.35)', r: 3 }));
    if (Math.abs(x) < 20) plot.dot(x, L(x), { color: '#dc2626', r: 6 });
    readout.innerHTML = '';
    readout.appendChild(el('span', { html: `step: <b>${steps}</b>` }));
    readout.appendChild(el('span', { html: `x = <b>${x.toFixed(3)}</b>` }));
    readout.appendChild(el('span', { html: `L(x) = <b>${(Math.abs(x) < 1e6 ? L(x).toFixed(3) : '\u221e')}</b>` }));
    readout.appendChild(el('span', { html: `dL/dx = <b>${(Math.abs(x) < 1e6 ? dL(x).toFixed(3) : '\u221e')}</b>` }));
    if (diverged) { const w = el('span', { html: '<b style="color:#b91c1c">diverging! \u03b7 too large</b>' }); readout.appendChild(w); }
  }

  function step() {
    const eta = etaCtl.get();
    x = x - eta * dL(x);
    steps++;
    if (Math.abs(x) < 8) trail.push(x);
    const diverged = Math.abs(x) > 12 || !isFinite(x);
    draw(diverged);
    if (diverged) stop();
    return diverged;
  }
  function run() { stop(); timer = setInterval(() => { const d = step(); if (d || steps > 60 || Math.abs(dL(x)) < 1e-3) stop(); }, 250); }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  function reset() { stop(); x = X0; steps = 0; trail = []; draw(false); }

  const controls = el('div', { class: 'demo-controls' }, [
    etaCtl.field,
    api.button('Step', () => { stop(); step(); }),
    api.button('Run', run),
    api.button('Reset', reset, 'ghost'),
  ]);
  const stage = el('div', { class: 'demo-stage' }, [canvas, readout]);
  const mount = el('div', {}, [controls, stage,
    el('div', { class: 'demo-hint', text: 'Small \u03b7: slow but steady. Around \u03b7 = 1 it overshoots; push higher and it diverges.' })]);

  return { mount, init: reset, onLeave: stop };
});

/* =====================================================================
 *  DEMO 2 - autograd from scratch   (Pyodide, editable)
 * ===================================================================== */
register('autograd', (api) => {
  const code = `# A tiny reverse-mode autograd (this is what .backward() does).
class Value:
    def __init__(self, data, _children=()):
        self.data = data
        self.grad = 0.0
        self._backward = lambda: None
        self._prev = set(_children)

    def __sub__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        out = Value(self.data - other.data, (self, other))
        def _backward():
            self.grad += out.grad
            other.grad += -out.grad
        out._backward = _backward
        return out

    def __pow__(self, n):
        out = Value(self.data ** n, (self,))
        def _backward():
            self.grad += n * (self.data ** (n - 1)) * out.grad
        out._backward = _backward
        return out

    def backward(self):
        topo, seen = [], set()
        def build(v):
            if v not in seen:
                seen.add(v)
                for c in v._prev:
                    build(c)
                topo.append(v)
        build(self)
        self.grad = 1.0
        for v in reversed(topo):
            v._backward()

# Try changing the starting value of x:
x = Value(-4.0)
L = (x - 2) ** 2
L.backward()
print("forward:  L =", L.data)
print("backward: x.grad =", x.grad)   # expect 2*(x-2) = -12`;

  const editor = el('textarea', { class: 'demo-editor', rows: 12, spellcheck: 'false' });
  editor.value = code;
  const output = el('pre', { class: 'demo-output', text: 'Click "Run Python" to execute.' });

  async function run() {
    runBtn.disabled = true;
    output.textContent = '';
    try {
      const py = await api.getPyodide();
      api.setStatus('Running...', '');
      let buf = '';
      await api.runPython(py, editor.value, (s) => { buf += s; output.textContent = buf; });
      api.setStatus('Done.', 'ok');
    } catch (e) {
      api.setStatus('Error - see output.', 'err');
      output.innerHTML = '<span class="out-err">' + String(e).replace(/</g, '&lt;') + '</span>';
    } finally { runBtn.disabled = false; }
  }
  const runBtn = api.button('Run Python', run);
  const resetBtn = api.button('Reset code', () => { editor.value = code; }, 'ghost');

  const mount = el('div', {}, [
    el('div', { class: 'demo-controls' }, [runBtn, resetBtn]),
    el('div', { class: 'demo-split' }, [editor, output]),
    el('div', { class: 'demo-hint', text: 'Real Python in your browser. The graph x \u2192 (x\u22122) \u2192 square \u2192 L is built as you compute, then backward() multiplies local derivatives.' }),
  ]);
  return { mount };
});

/* =====================================================================
 *  DEMO 3 - train the line   (Pyodide numpy, JS draws)
 * ===================================================================== */
register('train-line', (api) => {
  const lrCtl = api.slider('learning rate', { min: 0.01, max: 0.5, step: 0.01, value: 0.1, fmt: (v) => v.toFixed(2) });
  const stepCtl = api.slider('steps', { min: 10, max: 200, step: 10, value: 60, fmt: (v) => String(v) });
  const fitCanvas = api.canvasEl(320, 230);
  const lossCanvas = api.canvasEl(300, 230);
  const readout = el('div', { class: 'demo-readout' });

  let data = null; // {x, y, W, B, losses}

  function pycode(lr, steps) {
    return `import numpy as np
rng = np.random.default_rng(0)
x = np.linspace(-2, 2, 40)
y = 1.5 * x + 0.5 + rng.normal(0, 0.35, size=x.shape)
w, b = 0.0, 0.0
lr, n = ${lr}, ${steps}
W, B, losses = [], [], []
for _ in range(n):
    y_hat = w * x + b
    err = y_hat - y
    losses.append(float(np.mean(err**2)))
    w -= lr * float(np.mean(2 * err * x))
    b -= lr * float(np.mean(2 * err))
    W.append(w); B.append(b)
print(f"final: w={w:.3f}, b={b:.3f}  (true w=1.5, b=0.5)")
print(f"loss: {losses[0]:.3f} -> {losses[-1]:.4f}")`;
  }

  function drawFit(frame) {
    const { x, y, W, B } = data;
    const p = api.makePlot(fitCanvas, { xMin: -2.3, xMax: 2.3, yMin: -4, yMax: 4.5 });
    p.clear(); p.axes('x', 'y');
    p.points(x, y, { color: '#1f2937', r: 3 });
    const w = W[frame], b = B[frame];
    p.line([-2.3, 2.3], [w * -2.3 + b, w * 2.3 + b], { color: '#16a34a', width: 3 });
  }
  function drawLoss(frame) {
    const { losses } = data;
    const yMax = Math.max(...losses) * 1.05 || 1;
    const p = api.makePlot(lossCanvas, { xMin: 0, xMax: losses.length - 1, yMin: 0, yMax });
    p.clear(); p.axes('step', 'loss');
    const xs = losses.map((_, i) => i);
    p.line(xs.slice(0, frame + 1), losses.slice(0, frame + 1), { color: '#dc2626', width: 2.5 });
    p.dot(frame, losses[frame], { color: '#dc2626', r: 4 });
  }
  function showFrame(frame) {
    drawFit(frame); drawLoss(frame);
    readout.innerHTML = '';
    readout.appendChild(el('span', { html: `step <b>${frame}</b> / ${data.W.length - 1}` }));
    readout.appendChild(el('span', { html: `w = <b>${data.W[frame].toFixed(3)}</b>` }));
    readout.appendChild(el('span', { html: `b = <b>${data.B[frame].toFixed(3)}</b>` }));
    readout.appendChild(el('span', { html: `loss = <b>${data.losses[frame].toFixed(4)}</b>` }));
  }

  let timer = null;
  function animate() {
    if (timer) clearInterval(timer);
    let f = 0; const n = data.W.length;
    timer = setInterval(() => { showFrame(f); f++; if (f >= n) { clearInterval(timer); timer = null; } }, Math.max(20, 1200 / n)); }

  const output = el('pre', { class: 'demo-output', text: 'Click "Train" to run the loop in Python.' });
  async function train() {
    trainBtn.disabled = true; output.textContent = '';
    try {
      const py = await api.getPyodideWithNumpy();
      api.setStatus('Training...', '');
      let buf = '';
      await api.runPython(py, pycode(lrCtl.get(), stepCtl.get()), (s) => { buf += s; output.textContent = buf; });
      const g = py.globals;
      data = {
        x: g.get('x').toJs(), y: g.get('y').toJs(),
        W: g.get('W').toJs(), B: g.get('B').toJs(), losses: g.get('losses').toJs(),
      };
      api.setStatus('Done.', 'ok');
      animate();
    } catch (e) {
      api.setStatus('Error - see output.', 'err');
      output.innerHTML = '<span class="out-err">' + String(e).replace(/</g, '&lt;') + '</span>';
    } finally { trainBtn.disabled = false; }
  }
  const trainBtn = api.button('Train', train);

  const mount = el('div', {}, [
    el('div', { class: 'demo-controls' }, [lrCtl.field, stepCtl.field, trainBtn]),
    el('div', { class: 'demo-stage' }, [fitCanvas, lossCanvas, readout]),
    output,
    el('div', { class: 'demo-hint', text: 'Same loop as the slide, in numpy: predict \u2192 MSE \u2192 gradients \u2192 update. Watch the line snap to the data as the loss drops. High learning rate can overshoot.' }),
  ]);
  const preview = () => {
    const p = api.makePlot(fitCanvas, { xMin: -2.3, xMax: 2.3, yMin: -4, yMax: 4.5 }); p.clear(); p.axes('x', 'y');
    const q = api.makePlot(lossCanvas, { xMin: 0, xMax: 1, yMin: 0, yMax: 1 }); q.clear(); q.axes('step', 'loss');
  };
  return { mount, init: preview, onLeave: () => { if (timer) { clearInterval(timer); timer = null; } } };
});

/* =====================================================================
 *  DEMO 4a - cross-entropy playground: sigmoid + cross-entropy (JS)
 * ===================================================================== */
register('ce-playground', (api) => {
  const sig = (z) => 1 / (1 + Math.exp(-z));
  const zCanvas = api.canvasEl(380, 240);
  const zCtl = api.slider('score z', { min: -6, max: 6, step: 0.1, value: 2, fmt: (v) => v.toFixed(1) });
  let yTrue = 1;
  const ceOut = el('div', { class: 'demo-readout' });
  function drawCE() {
    const z = zCtl.get(), p = sig(z);
    const loss = yTrue === 1 ? -Math.log(p) : -Math.log(1 - p);
    const plot = api.makePlot(zCanvas, { xMin: -6, xMax: 6, yMin: -0.05, yMax: 1.05 });
    plot.clear(); plot.axes('z', '\u03c3(z)');
    const xs = [], ys = [];
    for (let t = -6; t <= 6; t += 0.1) { xs.push(t); ys.push(sig(t)); }
    plot.line(xs, ys, { color: '#7c3aed', width: 2.5 });
    plot.dot(z, p, { color: '#dc2626', r: 5 });
    ceOut.innerHTML = '';
    ceOut.appendChild(el('span', { html: `true label: <b>${yTrue === 1 ? 'spam (y=1)' : 'not spam (y=0)'}</b>` }));
    ceOut.appendChild(el('span', { html: `&#375; = \u03c3(z) = <b>${p.toFixed(3)}</b>` }));
    ceOut.appendChild(el('span', { html: `loss = <b>${loss.toFixed(3)}</b>` }));
    ceOut.appendChild(el('span', { html: (loss < 0.3 ? '<b style="color:#166534">confident &amp; right</b>' : (loss > 1.5 ? '<b style="color:#b91c1c">confidently wrong</b>' : 'unsure')) }));
  }
  const flipBtn = api.button('flip true label', () => { yTrue = yTrue === 1 ? 0 : 1; drawCE(); }, 'ghost');
  const mount = el('div', {}, [
    el('div', { class: 'demo-controls' }, [zCtl.field, flipBtn]),
    el('div', { class: 'demo-stage' }, [zCanvas, ceOut]),
    el('div', { class: 'demo-hint', text: 'Cross-entropy = \u2212log(prob of the true class). Confident and wrong is punished hard.' }),
  ]);
  zCtl.input.addEventListener('input', drawCE);
  return { mount, init: drawCE };
});

/* =====================================================================
 *  DEMO 4b - softmax playground: softmax + temperature (JS)
 * ===================================================================== */
register('softmax-playground', (api) => {
  const labels = ['dog', 'cat', 'bird', 'fish'];
  const logits = [1.0, 3.0, 1.5, 0.5];
  const barsWrap = el('div', { class: 'demo-bars' });
  const barEls = labels.map(() => {
    const fill = el('div', { class: 'db-fill' }); const val = el('div', { class: 'db-val' });
    const bar = el('div', { class: 'db-bar' }, [val, fill, el('div', { class: 'db-lab' })]);
    return { bar, fill, val };
  });
  barEls.forEach((b, i) => { b.bar.querySelector('.db-lab').textContent = labels[i]; barsWrap.appendChild(b.bar); });
  const tempCtl = api.slider('temperature', { min: 0.2, max: 3, step: 0.1, value: 1, fmt: (v) => v.toFixed(1) });
  const logitCtls = labels.map((lab, i) =>
    api.slider(lab, { min: -2, max: 5, step: 0.1, value: logits[i], fmt: (v) => v.toFixed(1), oninput: (v) => { logits[i] = v; drawSM(); } }));
  function drawSM() {
    const T = tempCtl.get();
    const z = logits.map((l) => l / T);
    const m = Math.max(...z);
    const ex = z.map((v) => Math.exp(v - m));
    const s = ex.reduce((a, b) => a + b, 0);
    const p = ex.map((v) => v / s);
    const best = p.indexOf(Math.max(...p));
    barEls.forEach((b, i) => { b.fill.style.height = (p[i] * 96 + 2) + 'px'; b.val.textContent = p[i].toFixed(2); b.bar.classList.toggle('hot', i === best); });
  }
  const mount = el('div', {}, [
    el('div', { class: 'demo-controls' }, [tempCtl.field]),
    el('div', { class: 'demo-controls' }, logitCtls.map((c) => c.field)),
    barsWrap,
    el('div', { class: 'demo-hint', text: 'Softmax turns scores into probabilities. Low temperature sharpens; high temperature flattens (the decoding knob in L20/L21).' }),
  ]);
  tempCtl.input.addEventListener('input', drawSM);
  return { mount, init: drawSM };
});

/* =====================================================================
 *  DEMO 5 - overfitting playground   (Pyodide numpy fit, JS draws)
 * ===================================================================== */
register('overfitting', (api) => {
  const degCtl = api.slider('polynomial degree', { min: 1, max: 9, step: 1, value: 1, fmt: (v) => String(v) });
  const fitCanvas = api.canvasEl(330, 240);
  const curveCanvas = api.canvasEl(300, 240);
  const readout = el('div', { class: 'demo-readout' });
  let base = null; // fixed data + per-degree train/val, computed once
  let ready = false;

  function pycode() {
    return `import numpy as np
rng = np.random.default_rng(1)
f = lambda t: 0.5*t + np.sin(t)
xt = np.sort(rng.uniform(-3, 3, 12)); yt = f(xt) + rng.normal(0, 0.35, 12)
xv = np.sort(rng.uniform(-3, 3, 12)); yv = f(xv) + rng.normal(0, 0.35, 12)

def fit(deg):
    X = np.vander(xt, deg + 1)
    return np.linalg.lstsq(X, yt, rcond=None)[0]

def mse(c, xx, yy):
    return float(np.mean((np.polyval(c, xx) - yy) ** 2))

degs = list(range(1, 10))
xt_l = xt.tolist(); yt_l = yt.tolist(); xv_l = xv.tolist(); yv_l = yv.tolist()`;
  }
  function pyForDegree(deg) {
    return `train = [mse(fit(d), xt, yt) for d in degs]
val = [mse(fit(d), xv, yv) for d in degs]
c = fit(${deg})
xs = np.linspace(-3.3, 3.3, 140)
ys = np.clip(np.polyval(c, xs), -8, 8)
xs_l = xs.tolist(); ys_l = ys.tolist()`;
  }

  let py = null;
  async function ensure() {
    if (ready) return;
    py = await api.getPyodideWithNumpy();
    api.setStatus('Fitting...', '');
    await api.runPython(py, pycode(), () => {});
    base = {
      xt: py.globals.get('xt_l').toJs(), yt: py.globals.get('yt_l').toJs(),
      xv: py.globals.get('xv_l').toJs(), yv: py.globals.get('yv_l').toJs(),
    };
    ready = true;
  }
  async function refresh() {
    try {
      await ensure();
      await api.runPython(py, pyForDegree(degCtl.get()), () => {});
      const g = py.globals;
      const train = g.get('train').toJs(), val = g.get('val').toJs();
      const xs = g.get('xs_l').toJs(), ys = g.get('ys_l').toJs();
      const deg = degCtl.get();
      // fit plot
      const p1 = api.makePlot(fitCanvas, { xMin: -3.4, xMax: 3.4, yMin: -4, yMax: 4 });
      p1.clear(); p1.axes('x', 'y');
      p1.line(xs, ys.map((v) => Math.max(-4, Math.min(4, v))), { color: '#7c3aed', width: 2.5 });
      p1.points(base.xt, base.yt, { color: '#1d4ed8', r: 3 });
      p1.points(base.xv, base.yv, { color: '#dc2626', r: 3 });
      // train/val vs degree
      const yMax = Math.max(Math.max(...train), Math.max(...val)) * 1.1 || 1;
      const p2 = api.makePlot(curveCanvas, { xMin: 1, xMax: 9, yMin: 0, yMax });
      p2.clear(); p2.axes('degree', 'loss');
      const degs = train.map((_, i) => i + 1);
      p2.line(degs, train, { color: '#1d4ed8', width: 2.5 });
      p2.line(degs, val, { color: '#dc2626', width: 2.5 });
      p2.dot(deg, train[deg - 1], { color: '#1d4ed8', r: 4 });
      p2.dot(deg, val[deg - 1], { color: '#dc2626', r: 4 });
      readout.innerHTML = '';
      readout.appendChild(el('span', { html: `degree <b>${deg}</b>` }));
      readout.appendChild(el('span', { html: `<span style="color:#1d4ed8">train</span> = <b>${train[deg - 1].toFixed(3)}</b>` }));
      readout.appendChild(el('span', { html: `<span style="color:#dc2626">val</span> = <b>${val[deg - 1].toFixed(3)}</b>` }));
      const tr = train[deg - 1], vl = val[deg - 1];
      const verdict = tr > 0.4 ? '<b style="color:#b45309">underfitting</b>' : ((vl - tr) > 0.2 ? '<b style="color:#b91c1c">overfitting</b>' : '<b style="color:#166534">good fit</b>');
      readout.appendChild(el('span', { html: verdict }));
      api.setStatus('Done.', 'ok');
    } catch (e) {
      api.setStatus('Error: ' + String(e), 'err');
    }
  }

  degCtl.input.addEventListener('change', () => { if (ready) refresh(); });
  const runBtn = api.button('Fit in Python', refresh);

  const mount = el('div', {}, [
    el('div', { class: 'demo-controls' }, [degCtl.field, runBtn]),
    el('div', { class: 'demo-stage' }, [fitCanvas, curveCanvas, readout]),
    el('div', { class: 'demo-hint', text: 'Blue = training points, red = validation points. Raise the degree: training loss keeps dropping but validation loss turns up \u2014 that gap is overfitting.' }),
  ]);
  const preview = () => {
    const p = api.makePlot(fitCanvas, { xMin: -3.4, xMax: 3.4, yMin: -4, yMax: 4 }); p.clear(); p.axes('x', 'y');
    const q = api.makePlot(curveCanvas, { xMin: 1, xMax: 9, yMin: 0, yMax: 1 }); q.clear(); q.axes('degree', 'loss');
  };
  return { mount, init: preview };
});

/* =====================================================================
 *  DEMO 6 - nonlinearity playground (JS): activation ON vs OFF
 *  Fit a 1-hidden-layer net to a wavy 1D target. OFF (identity) collapses
 *  to a straight line; ON (tanh) bends to fit. Trains synchronously and
 *  animates captured frames so the final fit is reliable on stage.
 * ===================================================================== */
register('nonlinearity', (api) => {
  const H = 12, N = 44;
  const target = (x) => 0.8 * Math.sin(2 * x);
  const xs = []; for (let i = 0; i < N; i++) xs.push(-3 + 6 * i / (N - 1));
  const ys = xs.map(target);
  let useAct = false, frames = [], timer = null;

  const canvas = api.canvasEl(460, 250);
  const readout = el('div', { class: 'demo-readout' });
  const grid = []; for (let t = -3; t <= 3.0001; t += 0.08) grid.push(t);
  const gact = (z) => useAct ? Math.tanh(z) : z;

  function initParams() {
    const r = api.rng32(7);
    return {
      W1: new Array(H).fill(0).map(() => (r() * 2 - 1) * 1.6),
      b1: new Array(H).fill(0).map(() => (r() * 2 - 1) * 1.6),
      W2: new Array(H).fill(0).map(() => (r() * 2 - 1) * 0.6),
      b2: 0,
    };
  }
  const curveFor = (W1, b1, W2, b2) => grid.map((x) => { let o = b2; for (let j = 0; j < H; j++) o += W2[j] * gact(W1[j] * x + b1[j]); return o; });

  function train() {
    const P0 = initParams();
    let W1 = P0.W1, b1 = P0.b1, W2 = P0.W2, b2 = P0.b2;
    const vW1 = new Array(H).fill(0), vb1 = new Array(H).fill(0), vW2 = new Array(H).fill(0);
    let vb2 = 0;
    const g = gact;
    const dg = (a) => useAct ? (1 - a * a) : 1;
    const curveAt = () => curveFor(W1, b1, W2, b2);
    const lr = 0.05, mom = 0.9, total = 900, capEvery = 20;
    const caps = [];
    for (let step = 0; step <= total; step++) {
      if (step % capEvery === 0) {
        let loss = 0; for (let i = 0; i < N; i++) { let o = b2; for (let j = 0; j < H; j++) o += W2[j] * g(W1[j] * xs[i] + b1[j]); loss += (o - ys[i]) ** 2; }
        caps.push({ ys: curveAt(), loss: loss / N });
      }
      const gW1 = new Array(H).fill(0), gb1 = new Array(H).fill(0), gW2 = new Array(H).fill(0); let gb2 = 0;
      for (let i = 0; i < N; i++) {
        const x = xs[i]; let o = b2; const a = new Array(H);
        for (let j = 0; j < H; j++) { a[j] = g(W1[j] * x + b1[j]); o += W2[j] * a[j]; }
        const err = o - ys[i];
        gb2 += err;
        for (let j = 0; j < H; j++) { gW2[j] += err * a[j]; const dz = err * W2[j] * dg(a[j]); gW1[j] += dz * x; gb1[j] += dz; }
      }
      const s = lr / N;
      for (let j = 0; j < H; j++) {
        vW1[j] = mom * vW1[j] - s * gW1[j]; W1[j] += vW1[j];
        vb1[j] = mom * vb1[j] - s * gb1[j]; b1[j] += vb1[j];
        vW2[j] = mom * vW2[j] - s * gW2[j]; W2[j] += vW2[j];
      }
      vb2 = mom * vb2 - s * gb2; b2 += vb2;
    }
    return { caps, grid };
  }

  function drawFrame(grid, cap, idx, n) {
    const p = api.makePlot(canvas, { xMin: -3.2, xMax: 3.2, yMin: -1.5, yMax: 1.5 });
    p.clear(); p.axes('x', 'y');
    p.points(xs, ys, { color: '#1f2937', r: 3 });
    p.line(grid, cap.ys.map((v) => Math.max(-1.5, Math.min(1.5, v))), { color: useAct ? '#16a34a' : '#dc2626', width: 3 });
    readout.innerHTML = '';
    readout.appendChild(el('span', { html: `activation: <b>${useAct ? 'ON (tanh)' : 'OFF (linear)'}</b>` }));
    readout.appendChild(el('span', { html: `step <b>${idx * 20}</b>` }));
    readout.appendChild(el('span', { html: `loss = <b>${cap.loss.toFixed(4)}</b>` }));
    if (!useAct) readout.appendChild(el('span', { html: '<b style="color:#b91c1c">stuck as a straight line</b>' }));
    else if (idx === n - 1) readout.appendChild(el('span', { html: '<b style="color:#166534">bent to fit the curve</b>' }));
  }
  function run() {
    if (timer) clearInterval(timer);
    const { caps, grid } = train();
    frames = caps; let f = 0;
    timer = setInterval(() => { drawFrame(grid, frames[f], f, frames.length); f++; if (f >= frames.length) { clearInterval(timer); timer = null; } }, 55);
  }
  const toggle = api.button('activation: OFF', () => {
    if (timer) { clearInterval(timer); timer = null; }
    useAct = !useAct; toggle.textContent = 'activation: ' + (useAct ? 'ON' : 'OFF'); preview();
  }, 'ghost');

  const mount = el('div', {}, [
    el('div', { class: 'demo-note', html: '<code>nn.Sequential(nn.Linear(1,12), nn.Tanh(), nn.Linear(12,1))</code> &nbsp;&middot;&nbsp; target: y = sin(2x)' }),
    el('div', { class: 'demo-controls' }, [toggle, api.button('Train', run)]),
    el('div', { class: 'demo-stage' }, [canvas, readout]),
    el('div', { class: 'demo-hint', text: 'Same net, same data. Activation OFF: stacked linear layers stay a line. ON: the layer bends to fit the wave. That bend is what nonlinearity buys.' }),
  ]);
  const preview = () => {
    const P = initParams();
    const p = api.makePlot(canvas, { xMin: -3.2, xMax: 3.2, yMin: -1.5, yMax: 1.5 });
    p.clear(); p.axes('x', 'y');
    p.points(xs, ys, { color: '#1f2937', r: 3 });
    p.line(grid, curveFor(P.W1, P.b1, P.W2, P.b2).map((v) => Math.max(-1.5, Math.min(1.5, v))), { color: '#94a3b8', width: 2.5, dash: [5, 4] });
    readout.innerHTML = '';
    readout.appendChild(el('span', { html: `activation: <b>${useAct ? 'ON (tanh)' : 'OFF (linear)'}</b>` }));
    readout.appendChild(el('span', { html: 'untrained &mdash; press <b>Train</b>' }));
  };
  return { mount, init: preview, onLeave: () => { if (timer) { clearInterval(timer); timer = null; } } };
});

/* =====================================================================
 *  DEMO 7 - XOR neural-net playground (JS): 2-2-1 MLP trained live
 *  Forward + backprop in JS on the XOR cloud; animate the decision
 *  boundary forming. Fixed seed converges; reseed as an escape hatch.
 * ===================================================================== */
register('xor-net', (api) => {
  const HID = 2;
  // Curated init that reliably drives the 2-2-1 net to a crisp XOR solution.
  const seed = 1;
  let useAct = false;
  let pts = [], frames = [], timer = null;

  const boundary = api.canvasEl(300, 260);
  const lossCanvas = api.canvasEl(280, 260);
  const readout = el('div', { class: 'demo-readout' });

  function makeData(s) {
    const r = api.rng32(s * 101 + 5);
    const corners = [[-1, -1, 0], [1, 1, 0], [-1, 1, 1], [1, -1, 1]];
    const out = [];
    for (const [cx, cy, lab] of corners)
      for (let k = 0; k < 14; k++) out.push([cx + (r() - 0.5) * 0.7, cy + (r() - 0.5) * 0.7, lab]);
    return out;
  }
  const sig = (z) => 1 / (1 + Math.exp(-z));

  function train() {
    const r = api.rng32(seed * 2654435761);
    // 2-HID-1: W1 [HID][2], b1[HID], W2[HID], b2
    let W1 = new Array(HID).fill(0).map(() => [(r() * 2 - 1) * 1.5, (r() * 2 - 1) * 1.5]);
    let b1 = new Array(HID).fill(0).map(() => (r() * 2 - 1) * 0.5);
    let W2 = new Array(HID).fill(0).map(() => (r() * 2 - 1) * 1.5);
    let b2 = (r() * 2 - 1) * 0.5;
    const vW1 = W1.map(() => [0, 0]), vb1 = b1.map(() => 0), vW2 = W2.map(() => 0); let vb2 = 0;
    const act = (t) => useAct ? Math.tanh(t) : t;
    const fwd = (x1, x2) => {
      const a = new Array(HID); let o = b2;
      for (let j = 0; j < HID; j++) { a[j] = act(W1[j][0] * x1 + W1[j][1] * x2 + b1[j]); o += W2[j] * a[j]; }
      return { a, p: sig(o) };
    };
    const lr = 0.5, mom = 0.85, total = 1400, capEvery = 28;
    const caps = [];
    const snapGrid = () => {
      const G = 30, vals = [];
      for (let iy = 0; iy < G; iy++) { const row = []; for (let ix = 0; ix < G; ix++) { const x1 = -2 + 4 * ix / (G - 1), x2 = 2 - 4 * iy / (G - 1); row.push(fwd(x1, x2).p); } vals.push(row); }
      return { G, vals };
    };
    const lossHist = [];
    for (let step = 0; step <= total; step++) {
      let loss = 0;
      const gW1 = W1.map(() => [0, 0]), gb1 = b1.map(() => 0), gW2 = W2.map(() => 0); let gb2 = 0;
      for (const [x1, x2, y] of pts) {
        const { a, p } = fwd(x1, x2);
        loss += -(y * Math.log(p + 1e-9) + (1 - y) * Math.log(1 - p + 1e-9));
        const dO = p - y;
        gb2 += dO;
        for (let j = 0; j < HID; j++) {
          gW2[j] += dO * a[j];
          const dz = dO * W2[j] * (useAct ? (1 - a[j] * a[j]) : 1);
          gW1[j][0] += dz * x1; gW1[j][1] += dz * x2; gb1[j] += dz;
        }
      }
      const n = pts.length; loss /= n;
      if (step % capEvery === 0) { caps.push({ grid: snapGrid(), loss }); }
      lossHist.push(loss);
      const s = lr / n;
      for (let j = 0; j < HID; j++) {
        vW1[j][0] = mom * vW1[j][0] - s * gW1[j][0]; W1[j][0] += vW1[j][0];
        vW1[j][1] = mom * vW1[j][1] - s * gW1[j][1]; W1[j][1] += vW1[j][1];
        vb1[j] = mom * vb1[j] - s * gb1[j]; b1[j] += vb1[j];
        vW2[j] = mom * vW2[j] - s * gW2[j]; W2[j] += vW2[j];
      }
      vb2 = mom * vb2 - s * gb2; b2 += vb2;
    }
    caps.forEach((c, i) => c.lossHist = lossHist.slice(0, (i + 1) * capEvery + 1));
    caps._finalLoss = lossHist[lossHist.length - 1];
    return caps;
  }

  function drawBoundary(cap) {
    const ctx = boundary.getContext('2d'), W = boundary.width, Ht = boundary.height;
    ctx.clearRect(0, 0, W, Ht);
    const { G, vals } = cap.grid, cw = W / G, ch = Ht / G;
    for (let iy = 0; iy < G; iy++) for (let ix = 0; ix < G; ix++) {
      const p = vals[iy][ix];
      const g = Math.round(80 + 150 * p), rr = Math.round(80 + 150 * (1 - p));
      ctx.fillStyle = `rgb(${rr},${g},110)`;
      ctx.fillRect(ix * cw, iy * ch, cw + 1, ch + 1);
    }
    const sx = (x) => (x + 2) / 4 * W, sy = (y) => (2 - y) / 4 * Ht;
    ctx.lineWidth = 1.6;
    for (const [x1, x2, y] of pts) {
      const px = sx(x1), py = sy(x2);
      if (y) { ctx.fillStyle = '#111827'; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.rect(px - 4, py - 4, 8, 8); ctx.fill(); ctx.stroke(); }
      else { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111827'; ctx.beginPath(); ctx.arc(px, py, 4.5, 0, 7); ctx.fill(); ctx.stroke(); }
    }
  }
  function drawLoss(cap) {
    const p = api.makePlot(lossCanvas, { xMin: 0, xMax: Math.max(1, (frames.length - 1) * 28), yMin: 0, yMax: Math.max(0.2, frames[0].loss * 1.05) });
    p.clear(); p.axes('step', 'loss');
    const xs = cap.lossHist.map((_, i) => i), ys = cap.lossHist;
    p.line(xs, ys, { color: '#dc2626', width: 2.5 });
    readout.innerHTML = '';
    readout.appendChild(el('span', { html: `activation: <b>${useAct ? 'ON' : 'OFF'}</b>` }));
    readout.appendChild(el('span', { html: `loss = <b>${cap.loss.toFixed(3)}</b>` }));
    const verdict = !useAct ? '<b style="color:#b91c1c">linear net can\u2019t separate XOR</b>' : (cap.loss < 0.15 ? '<b style="color:#166534">XOR solved</b>' : (cap.loss < 0.4 ? 'learning...' : '<b style="color:#b45309">still mixing</b>'));
    readout.appendChild(el('span', { html: verdict }));
    readout.appendChild(el('span', { html: '<span style="color:#6b7280;">&#9711; class 0 &nbsp; &#9632; class 1</span>' }));
  }
  function run() {
    if (timer) clearInterval(timer);
    pts = makeData(seed);
    frames = train(); let f = 0;
    timer = setInterval(() => { drawBoundary(frames[f]); drawLoss(frames[f]); f++; if (f >= frames.length) { clearInterval(timer); timer = null; } }, 45);
  }
  const actToggle = api.button('activation: OFF', () => {
    if (timer) { clearInterval(timer); timer = null; }
    useAct = !useAct; actToggle.textContent = 'activation: ' + (useAct ? 'ON' : 'OFF'); preview();
  }, 'ghost');
  const mount = el('div', {}, [
    el('div', { class: 'demo-note', html: '<code>nn.Sequential(nn.Linear(2,2), nn.Tanh(), nn.Linear(2,1))</code> &nbsp;&middot;&nbsp; task: XOR' }),
    el('div', { class: 'demo-controls' }, [api.button('Train', run), actToggle]),
    el('div', { class: 'demo-stage' }, [boundary, lossCanvas, readout]),
    el('div', { class: 'demo-hint', text: 'Green/red = the net\u2019s decision surface; markers are the true labels. Turn the activation OFF and the 2-2-1 net becomes linear \u2014 it cannot separate XOR no matter how long it trains.' }),
  ]);
  const preview = () => {
    pts = makeData(seed);
    const ctx = boundary.getContext('2d'); ctx.clearRect(0, 0, boundary.width, boundary.height); ctx.fillStyle = '#f1f5f9'; ctx.fillRect(0, 0, boundary.width, boundary.height);
    const sx = (x) => (x + 2) / 4 * boundary.width, sy = (y) => (2 - y) / 4 * boundary.height;
    ctx.lineWidth = 1.6;
    for (const [x1, x2, y] of pts) {
      const px = sx(x1), py = sy(x2);
      if (y) { ctx.fillStyle = '#111827'; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.rect(px - 4, py - 4, 8, 8); ctx.fill(); ctx.stroke(); }
      else { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111827'; ctx.beginPath(); ctx.arc(px, py, 4.5, 0, 7); ctx.fill(); ctx.stroke(); }
    }
    const q = api.makePlot(lossCanvas, { xMin: 0, xMax: 1, yMin: 0, yMax: 1 }); q.clear(); q.axes('step', 'loss');
    readout.innerHTML = '';
    readout.appendChild(el('span', { html: `activation: <b>${useAct ? 'ON' : 'OFF'}</b>` }));
    readout.appendChild(el('span', { html: 'untrained &mdash; press <b>Train</b>' }));
    readout.appendChild(el('span', { html: '<span style="color:#6b7280;">&#9711; class 0 &nbsp; &#9632; class 1</span>' }));
  };
  return { mount, init: preview, onLeave: () => { if (timer) { clearInterval(timer); timer = null; } } };
});

/* =====================================================================
 *  DEMO 8 - embedding explorer (Transformers.js + precomputed fallback)
 *  init() shows a REAL precomputed scatter (offline/PDF-safe). "Embed"
 *  runs the live model on whatever the student types, projects with PCA.
 * ===================================================================== */
register('embed-explorer', (api) => {
  // Precomputed with Xenova/all-MiniLM-L6-v2 (mean-pooled, normalized) + 2D PCA.
  const PRE = [
    { w: 'dog', x: 0.3471, y: 0.3107, nn: ['puppy (0.80)', 'cat (0.66)', 'horse (0.53)'] },
    { w: 'puppy', x: 0.2952, y: 0.3596, nn: ['dog (0.80)', 'kitten (0.61)', 'cat (0.53)'] },
    { w: 'cat', x: 0.2658, y: 0.3648, nn: ['kitten (0.79)', 'dog (0.66)', 'puppy (0.53)'] },
    { w: 'kitten', x: 0.2455, y: 0.3872, nn: ['cat (0.79)', 'puppy (0.61)', 'dog (0.52)'] },
    { w: 'horse', x: 0.2605, y: 0.0191, nn: ['dog (0.53)', 'puppy (0.51)', 'kitten (0.44)'] },
    { w: 'car', x: 0.2513, y: -0.3418, nn: ['truck (0.69)', 'bicycle (0.52)', 'bus (0.50)'] },
    { w: 'truck', x: 0.1901, y: -0.4078, nn: ['car (0.69)', 'bus (0.51)', 'bicycle (0.51)'] },
    { w: 'bus', x: 0.0242, y: -0.4499, nn: ['truck (0.51)', 'car (0.50)', 'bicycle (0.44)'] },
    { w: 'bicycle', x: 0.177, y: -0.517, nn: ['car (0.52)', 'truck (0.51)', 'bus (0.44)'] },
    { w: 'apple', x: -0.0555, y: -0.0095, nn: ['banana (0.42)', 'car (0.41)', 'kitten (0.39)'] },
    { w: 'banana', x: -0.2036, y: -0.0148, nn: ['orange (0.52)', 'apple (0.42)', 'kitten (0.41)'] },
    { w: 'orange', x: -0.1738, y: 0.0294, nn: ['banana (0.52)', 'dog (0.39)', 'apple (0.37)'] },
    { w: 'king', x: -0.538, y: 0.079, nn: ['queen (0.68)', 'prince (0.59)', 'banana (0.40)'] },
    { w: 'queen', x: -0.5744, y: 0.0532, nn: ['king (0.68)', 'prince (0.58)', 'banana (0.40)'] },
    { w: 'prince', x: -0.5113, y: 0.1378, nn: ['king (0.59)', 'queen (0.58)', 'banana (0.37)'] },
  ];
  const DEFAULT_TEXT = PRE.map((p) => p.w).join(', ');

  const canvas = api.canvasEl(480, 250);
  canvas.classList.add('clickable');
  const neigh = el('div', { class: 'demo-readout' });
  const box = el('textarea', { class: 'demo-editor demo-textbox', rows: 2, spellcheck: 'false' });
  box.value = DEFAULT_TEXT;
  let pts = PRE.map((p) => ({ ...p })), sel = null, layout = [];

  function neighborWords(nnList) { return nnList.map((s) => s.split(' ')[0]); }
  function draw() {
    const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const p of pts) { xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x); yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y); }
    const padX = (xMax - xMin) * 0.14 + 1e-6, padY = (yMax - yMin) * 0.14 + 1e-6;
    xMin -= padX; xMax += padX; yMin -= padY; yMax += padY;
    const sx = (x) => 46 + (x - xMin) / (xMax - xMin) * (W - 60);
    const sy = (y) => H - 26 - (y - yMin) / (yMax - yMin) * (H - 44);
    layout = pts.map((p) => ({ ...p, px: sx(p.x), py: sy(p.y) }));
    const hi = sel != null ? new Set(neighborWords(pts[sel].nn)) : null;
    ctx.font = '11px ui-monospace, monospace';
    // dots first
    layout.forEach((p, i) => {
      let color = '#94a3b8';
      if (sel != null) { if (i === sel) color = '#1d4ed8'; else if (hi.has(p.w)) color = '#d97706'; }
      ctx.beginPath(); ctx.arc(p.px, p.py, i === sel ? 6 : 4.5, 0, 7); ctx.fillStyle = color; ctx.fill();
    });
    // declutter labels vertically so tight clusters stay readable
    const labs = layout.map((p) => ({ p, lx: p.px + 7, ly: p.py + 4, w: ctx.measureText(p.w).width }));
    labs.sort((a, b) => a.ly - b.ly);
    for (let pass = 0; pass < 8; pass++) {
      for (let i = 0; i < labs.length; i++) for (let j = i + 1; j < labs.length; j++) {
        const a = labs[i], b = labs[j];
        if (Math.abs(a.ly - b.ly) < 11 && !(a.lx + a.w < b.lx - 2 || b.lx + b.w < a.lx - 2)) {
          if (a.ly <= b.ly) b.ly += 5; else a.ly += 5;
        }
      }
    }
    labs.forEach(({ p, lx, ly }, i) => {
      const idx = layout.indexOf(p);
      const isHi = sel != null && (idx === sel || hi.has(p.w));
      if (Math.abs(ly - (p.py + 4)) > 4) { ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(lx - 1, ly - 3); ctx.stroke(); }
      ctx.fillStyle = isHi ? '#111827' : '#64748b';
      ctx.fillText(p.w, lx, Math.min(canvas.height - 2, Math.max(9, ly)));
    });
    neigh.innerHTML = '';
    if (sel != null) {
      neigh.appendChild(el('span', { html: `nearest to <b>${pts[sel].w}</b>:` }));
      pts[sel].nn.forEach((s) => neigh.appendChild(el('span', { text: '  ' + s })));
    } else {
      neigh.appendChild(el('span', { text: 'click a point to see its' }));
      neigh.appendChild(el('span', { text: 'nearest neighbors' }));
    }
  }
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * canvas.width / r.width, my = (e.clientY - r.top) * canvas.height / r.height;
    let best = -1, bd = 1e9;
    layout.forEach((p, i) => { const d = (p.px - mx) ** 2 + (p.py - my) ** 2; if (d < bd) { bd = d; best = i; } });
    if (best >= 0 && bd < 900) { sel = best; draw(); }
  });

  async function embed() {
    const words = box.value.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).slice(0, 40);
    if (words.length < 3) { api.setStatus('Enter at least 3 words.', 'err'); return; }
    embedBtn.disabled = true;
    try {
      const ex = await api.getEmbedder();
      const vecs = await api.embedTexts(ex, words);
      api.setStatus('Projecting...', '');
      const xy = api.pca2(vecs);
      pts = words.map((w, i) => {
        const sims = words.map((w2, j) => ({ w: w2, s: api.cosine(vecs[i], vecs[j]) })).filter((_, j) => j !== i).sort((a, b) => b.s - a.s);
        return { w, x: xy[i][0], y: xy[i][1], nn: sims.slice(0, 3).map((o) => `${o.w} (${o.s.toFixed(2)})`) };
      });
      sel = null; draw();
      api.setStatus('Done \u2014 real embeddings.', 'ok');
    } catch (err) {
      api.setStatus('Model unavailable \u2014 showing precomputed set.', 'err');
      pts = PRE.map((p) => ({ ...p })); sel = null; draw();
    } finally { embedBtn.disabled = false; }
  }
  const embedBtn = api.button('Embed', embed);
  const resetBtn = api.button('Reset words', () => { box.value = DEFAULT_TEXT; pts = PRE.map((p) => ({ ...p })); sel = null; draw(); api.setStatus('', ''); }, 'ghost');

  const mount = el('div', {}, [
    box,
    el('div', { class: 'demo-controls' }, [embedBtn, resetBtn]),
    el('div', { class: 'demo-stage' }, [canvas, neigh]),
    el('div', { class: 'demo-hint', text: 'Type any words or short sentences. MiniLM computes a contextual embedding (not a fixed lookup), then PCA squeezes it to 2D. Similar meanings land near each other.' }),
  ]);
  return { mount, init: draw };
});

/* =====================================================================
 *  DEMO 9 - k-means playground (JS): step Lloyd's algorithm
 * ===================================================================== */
register('kmeans', (api) => {
  const K = 3;
  const COLORS = ['#1d4ed8', '#16a34a', '#dc2626'];
  let seed = 1, data = [], cents = [], assign = [], iter = 0, timer = null;
  const canvas = api.canvasEl(360, 280);
  const readout = el('div', { class: 'demo-readout' });

  function makeData(s) {
    const r = api.rng32(s * 733 + 11);
    const centers = [[-1.1, 0.9], [1.2, 0.7], [0.1, -1.1]];
    const out = [];
    for (const [cx, cy] of centers) for (let k = 0; k < 16; k++) out.push([cx + (r() - 0.5) * 1.1, cy + (r() - 0.5) * 1.1]);
    return out;
  }
  function initCentroids(s) {
    const r = api.rng32(s * 977 + 3);
    cents = []; const used = new Set();
    while (cents.length < K) { const i = Math.floor(r() * data.length); if (!used.has(i)) { used.add(i); cents.push([data[i][0], data[i][1]]); } }
    assign = data.map(() => -1); iter = 0;
  }
  function assignStep() {
    let changed = 0;
    assign = data.map(([x, y], i) => {
      let best = 0, bd = 1e9;
      cents.forEach(([cx, cy], k) => { const d = (x - cx) ** 2 + (y - cy) ** 2; if (d < bd) { bd = d; best = k; } });
      if (best !== assign[i]) changed++;
      return best;
    });
    return changed;
  }
  function updateStep() {
    cents = cents.map((c, k) => {
      const members = data.filter((_, i) => assign[i] === k);
      if (!members.length) return c;
      return [members.reduce((s, p) => s + p[0], 0) / members.length, members.reduce((s, p) => s + p[1], 0) / members.length];
    });
  }
  function inertia() {
    let s = 0; data.forEach(([x, y], i) => { const c = cents[assign[i]] || [0, 0]; s += (x - c[0]) ** 2 + (y - c[1]) ** 2; }); return s;
  }
  function draw() {
    const p = api.makePlot(canvas, { xMin: -2.6, xMax: 2.6, yMin: -2.4, yMax: 2.4 });
    p.clear(); p.axes('', '');
    data.forEach(([x, y], i) => p.dot(x, y, { color: assign[i] >= 0 ? COLORS[assign[i]] : '#94a3b8', r: 3.5 }));
    cents.forEach((c, k) => {
      const ctx = canvas.getContext('2d'); const px = p.sx(c[0]), py = p.sy(c[1]);
      ctx.beginPath(); ctx.arc(px, py, 9, 0, 7); ctx.fillStyle = COLORS[k]; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
    });
    readout.innerHTML = '';
    readout.appendChild(el('span', { html: `iteration <b>${iter}</b>` }));
    readout.appendChild(el('span', { html: assign[0] >= 0 ? `inertia = <b>${inertia().toFixed(2)}</b>` : 'centroids placed' }));
  }
  function step() {
    const changed = assignStep();   // 1) assign every point to its nearest centroid
    updateStep();                    // 2) move each centroid to its members' mean
    iter++; draw();
    if (changed === 0) { api.setStatus('Converged \u2014 assignments stopped changing.', 'ok'); return true; }
    return false;
  }
  function reseed() { if (timer) { clearInterval(timer); timer = null; } data = makeData(++seed); initCentroids(seed); api.setStatus('', ''); draw(); }
  function run() { if (timer) clearInterval(timer); timer = setInterval(() => { if (step()) { clearInterval(timer); timer = null; } }, 650); }

  const mount = el('div', {}, [
    el('div', { class: 'demo-controls' }, [api.button('Step', () => { if (timer) { clearInterval(timer); timer = null; } step(); }), api.button('Run', run), api.button('Reseed', reseed, 'ghost')]),
    el('div', { class: 'demo-stage' }, [canvas, readout]),
    el('div', { class: 'demo-hint', text: 'Each step: assign every point to its nearest centroid, then move each centroid to its members\u2019 mean. Repeat until nothing moves.' }),
  ]);
  const preview = () => { data = makeData(seed); initCentroids(seed); draw(); };
  return { mount, init: preview, onLeave: () => { if (timer) { clearInterval(timer); timer = null; } } };
});

/* =====================================================================
 *  DEMO 10 - PCA mechanics: rotatable 3D cloud + its 2D PCA projection
 *  Points are stored in PC-aligned coords, so "flatten" = drop PC3 and
 *  face the PC1-PC2 plane, landing exactly on the right-hand 2D panel.
 * ===================================================================== */
register('pca-3d', (api) => {
  const cloudCanvas = api.canvasEl(300, 300);
  const projCanvas = api.canvasEl(300, 300);
  cloudCanvas.classList.add('grabbable');
  let pc = [];                     // points in PC coords [[u,v,w], ...]
  let seed = 3, yaw = 0.7, pitch = -0.5, flat = 0;
  let anim = null, dragging = false, lastX = 0, lastY = 0;

  const gaussRand = (r) => { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

  function build(s) {
    const r = api.rng32((s * 2654435761) >>> 0);
    const n = 240, raw = [];
    for (let i = 0; i < n; i++) raw.push([gaussRand(r) * 1.7, gaussRand(r) * 0.95, gaussRand(r) * 0.26]);
    const m = [0, 0, 0]; for (const p of raw) { m[0] += p[0] / n; m[1] += p[1] / n; m[2] += p[2] / n; }
    const C = raw.map((p) => [p[0] - m[0], p[1] - m[1], p[2] - m[2]]);
    const cov = new Array(9).fill(0);
    for (const p of C) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i * 3 + j] += p[i] * p[j] / n;
    const mv = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
    const nrm = (v) => { const L = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / L, v[1] / L, v[2] / L]; };
    const power = (M) => { let v = nrm([1, 0.3, -0.2]); for (let k = 0; k < 80; k++) v = nrm(mv(M, v)); return v; };
    const pc1 = power(cov);
    const t1 = mv(cov, pc1), l1 = t1[0] * pc1[0] + t1[1] * pc1[1] + t1[2] * pc1[2];
    const cov2 = cov.slice(); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov2[i * 3 + j] -= l1 * pc1[i] * pc1[j];
    const pc2 = power(cov2);
    const pc3 = nrm([pc1[1] * pc2[2] - pc1[2] * pc2[1], pc1[2] * pc2[0] - pc1[0] * pc2[2], pc1[0] * pc2[1] - pc1[1] * pc2[0]]);
    pc = C.map((p) => [p[0] * pc1[0] + p[1] * pc1[1] + p[2] * pc1[2], p[0] * pc2[0] + p[1] * pc2[1] + p[2] * pc2[2], p[0] * pc3[0] + p[1] * pc3[1] + p[2] * pc3[2]]);
  }

  let umin = -2, uspan = 4;
  const colorFor = (u) => { const t = Math.max(0, Math.min(1, (u - umin) / uspan)); return `rgb(${Math.round(29 + 191 * t)},${Math.round(78 - 40 * t)},${Math.round(216 - 178 * t)})`; };

  function drawCloud() {
    const ctx = cloudCanvas.getContext('2d'), W = cloudCanvas.width, H = cloudCanvas.height;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cxp = Math.cos(pitch), sxp = Math.sin(pitch);
    const us = pc.map((p) => p[0]); umin = Math.min(...us); uspan = (Math.max(...us) - umin) || 1;
    const sc = (W * 0.42) / 3.2;
    const proj = pc.map((p) => {
      const x = p[0], y = p[1], z = p[2] * (1 - flat);
      const x1 = cyw * x + syw * z, z1 = -syw * x + cyw * z;
      const y2 = cxp * y - sxp * z1, z2 = sxp * y + cxp * z1;
      return { px: W / 2 + x1 * sc, py: H / 2 - y2 * sc, depth: z2, u: p[0] };
    });
    proj.sort((a, b) => a.depth - b.depth);
    for (const q of proj) { const t = Math.max(0, Math.min(1, (q.depth + 2) / 4)); ctx.globalAlpha = 0.5 + 0.45 * t; ctx.fillStyle = colorFor(q.u); ctx.beginPath(); ctx.arc(q.px, q.py, 2.2 + 1.6 * t, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  function drawProj() {
    const p = api.makePlot(projCanvas, { xMin: -3.2, xMax: 3.2, yMin: -3.2, yMax: 3.2 }); p.clear(); p.axes('PC1', 'PC2');
    const ctx = projCanvas.getContext('2d');
    for (const pp of pc) { ctx.fillStyle = colorFor(pp[0]); ctx.beginPath(); ctx.arc(p.sx(pp[0]), p.sy(pp[1]), 2.6, 0, 7); ctx.fill(); }
  }
  const draw = () => { drawCloud(); drawProj(); };

  function flatten() {
    if (anim) clearInterval(anim);
    const target = flat < 0.5 ? 1 : 0;
    anim = setInterval(() => {
      flat += (target - flat) * 0.14;
      if (target === 1) { yaw += (0 - yaw) * 0.14; pitch += (0 - pitch) * 0.14; }
      drawCloud();
      if (Math.abs(flat - target) < 0.01) { flat = target; if (target === 1) { yaw = 0; pitch = 0; } drawCloud(); clearInterval(anim); anim = null; }
    }, 30);
  }
  function reseed() { if (anim) { clearInterval(anim); anim = null; } seed++; flat = 0; yaw = 0.7; pitch = -0.5; build(seed); draw(); }

  cloudCanvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; cloudCanvas.setPointerCapture(e.pointerId); });
  cloudCanvas.addEventListener('pointermove', (e) => { if (!dragging) return; yaw += (e.clientX - lastX) * 0.01; pitch += (e.clientY - lastY) * 0.01; pitch = Math.max(-1.4, Math.min(1.4, pitch)); lastX = e.clientX; lastY = e.clientY; drawCloud(); });
  cloudCanvas.addEventListener('pointerup', () => { dragging = false; });
  cloudCanvas.addEventListener('pointercancel', () => { dragging = false; });

  const mount = el('div', {}, [
    el('div', { class: 'demo-note', html: 'Drag the 3D cloud to rotate. PCA finds the flat plane of most spread and drops the thin 3rd direction.' }),
    el('div', { class: 'demo-controls' }, [api.button('Flatten to 2D', flatten), api.button('Reseed', reseed, 'ghost')]),
    el('div', { class: 'demo-stage' }, [
      el('div', { class: 'pca-panel' }, [el('div', { class: 'pca-cap', text: '3D data (drag to rotate)' }), cloudCanvas]),
      el('div', { class: 'pca-panel' }, [el('div', { class: 'pca-cap', text: 'PCA \u2192 2D' }), projCanvas]),
    ]),
  ]);
  return { mount, init: () => { build(seed); draw(); }, onLeave: () => { if (anim) { clearInterval(anim); anim = null; } } };
});

/* =====================================================================
 *  DEMO 11 - WildVis: real WildChat conversation embeddings (1536-d
 *  OpenAI text-embedding-3-small -> PCA 2D). Hover reads a conversation;
 *  click opens the real thread on wildvisualizer.com. Data by Deng et al.
 * ===================================================================== */
register('wildvis', (api) => {
  const canvas = api.canvasEl(760, 340);
  canvas.classList.add('grabbable');
  const tip = el('div', { class: 'wv-tip' });
  let data = null, scale = 1, tx = 0, ty = 0, hover = -1;
  let isDown = false, moved = false, downX = 0, downY = 0, lastX = 0, lastY = 0;

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const toXY = (e) => { const r = canvas.getBoundingClientRect(); return { mx: (e.clientX - r.left) * canvas.width / r.width, my: (e.clientY - r.top) * canvas.height / r.height, ox: e.clientX - r.left, oy: e.clientY - r.top }; };
  const S = (d) => [d.e[0] * scale + tx, -d.e[1] * scale + ty];

  function fit() {
    const xs = data.map((d) => d.e[0]), ys = data.map((d) => d.e[1]);
    const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
    const pad = 26, W = canvas.width, H = canvas.height;
    scale = Math.min((W - 2 * pad) / (xmax - xmin || 1), (H - 2 * pad) / (ymax - ymin || 1));
    tx = W / 2 - scale * (xmin + xmax) / 2;
    ty = H / 2 + scale * (ymin + ymax) / 2;
  }
  function draw() {
    const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < data.length; i++) {
      if (i === hover) continue;
      const [px, py] = S(data[i]); if (px < -4 || px > W + 4 || py < -4 || py > H + 4) continue;
      ctx.beginPath(); ctx.arc(px, py, 2.2, 0, 7);
      ctx.fillStyle = data[i].d === 'lmsyschat' ? 'rgba(37,99,235,0.7)' : 'rgba(22,163,74,0.65)'; ctx.fill();
    }
    if (hover >= 0) { const [px, py] = S(data[hover]); ctx.beginPath(); ctx.arc(px, py, 5, 0, 7); ctx.fillStyle = '#f59e0b'; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = '#111827'; ctx.stroke(); }
  }
  function nearest(mx, my) { let best = -1, bd = 90; for (let i = 0; i < data.length; i++) { const [px, py] = S(data[i]); const dd = (px - mx) ** 2 + (py - my) ** 2; if (dd < bd) { bd = dd; best = i; } } return best; }

  canvas.addEventListener('mousemove', (e) => {
    if (!data) return; const { mx, my, ox, oy } = toXY(e);
    if (isDown) { tx += (mx - lastX); ty += (my - lastY); lastX = mx; lastY = my; if (Math.abs(mx - downX) + Math.abs(my - downY) > 4) moved = true; draw(); tip.style.display = 'none'; return; }
    const h = nearest(mx, my);
    if (h !== hover) { hover = h; draw(); }
    if (h >= 0) { tip.innerHTML = '<b>' + esc(data[h].d) + '</b><br>' + esc(data[h].c); tip.style.display = 'block'; tip.style.left = Math.min(ox + 14, canvas.clientWidth - 250) + 'px'; tip.style.top = Math.min(oy + 14, canvas.clientHeight - 60) + 'px'; }
    else tip.style.display = 'none';
  });
  canvas.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  canvas.addEventListener('mousedown', (e) => { const { mx, my } = toXY(e); isDown = true; moved = false; downX = mx; downY = my; lastX = mx; lastY = my; });
  window.addEventListener('mouseup', (e) => {
    if (!isDown) return; isDown = false;
    if (!moved && hover >= 0) window.open('https://wildvisualizer.com/conversation/' + encodeURIComponent(data[hover].d) + '/' + encodeURIComponent(data[hover].i) + '?from=embedding&lang=english', '_blank', 'noopener');
  });
  canvas.addEventListener('wheel', (e) => {
    if (!data) return; e.preventDefault(); const { mx, my } = toXY(e);
    const wx = (mx - tx) / scale, wy = (ty - my) / scale;
    scale *= Math.exp(-e.deltaY * 0.0012);
    tx = mx - wx * scale; ty = my + wy * scale; draw();
  }, { passive: false });

  async function load() {
    api.setStatus('Loading real conversation embeddings...');
    try { const res = await fetch('data/wildchat_embeddings.json'); data = await res.json(); fit(); draw(); api.setStatus(data.length + ' real conversations \u2014 hover to read, click to open.', 'ok'); }
    catch (e) { api.setStatus('Could not load the embedding data.', 'err'); }
  }

  function zoomBy(f) {
    if (!data) return;
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const wx = (cx - tx) / scale, wy = (ty - cy) / scale;
    scale *= f; tx = cx - wx * scale; ty = cy + wy * scale; draw();
  }

  const link = el('a', { class: 'wv-link', href: 'https://wildvisualizer.com/embeddings/english?dataset=wildchat', target: '_blank', rel: 'noopener' }, 'Explore it live at wildvisualizer.com \u2197');
  const wrap = el('div', { class: 'wv-wrap' }, [canvas, tip]);
  const mount = el('div', {}, [
    el('div', { class: 'demo-note', html: 'Each dot is a real conversation &mdash; a 1536-dim vector (OpenAI text-embedding-3-small) projected to 2D with PCA.' }),
    el('div', { class: 'demo-controls' }, [api.button('Zoom +', () => zoomBy(1.3)), api.button('Zoom \u2212', () => zoomBy(1 / 1.3)), api.button('Reset view', () => { if (data) { fit(); draw(); } }), link]),
    wrap,
  ]);
  return { mount, init: load, onLeave: () => { tip.style.display = 'none'; hover = -1; } };
});

/* =====================================================================
 *  DEMO 12 - Image-to-LaTeX fine-attention viewer. Hover an output token
 *  to display only its pink, fine-grained spatial attention over the image.
 * ===================================================================== */
register('im2latex-attention', (api) => {
  let data = null;
  let active = -1;
  const image = el('img', {
    class: 'im2latex-attn-image',
    alt: 'Rendered mathematical expression used by the Image-to-LaTeX model',
  });
  const overlay = el('div', { class: 'im2latex-attn-overlay', 'aria-hidden': 'true' });
  const ribbon = el('div', { class: 'im2latex-token-ribbon', role: 'list', 'aria-label': 'Generated LaTeX output tokens' });
  const readout = el('div', { class: 'im2latex-attn-readout', 'aria-live': 'polite' });
  const stage = el('div', { class: 'im2latex-attn-stage' }, [image, overlay]);

  function displayToken(token) {
    if (token === '\\left[') return '[';
    if (token === '\\right]') return ']';
    if (token === '\\overline') return '\\bar';
    return token;
  }

  function show(index) {
    if (!data || !data.tokens[index]) return;
    active = index;
    const token = data.tokens[index];
    const max = Math.max(...token.scores, 1e-9);
    [...overlay.children].forEach((cell, i) => {
      const score = token.scores[i] || 0;
      const opacity = score <= 0 ? 0 : 0.08 + 0.78 * Math.pow(score / max, 0.68);
      cell.style.backgroundColor = `rgba(236,72,153,${opacity.toFixed(3)})`;
    });
    [...ribbon.children].forEach((button, i) => button.classList.toggle('active', i === index));
    readout.innerHTML = `output token <b>${displayToken(token.label)}</b> &rarr; pink cells show where its visual payload is read`;
  }

  function build() {
    image.src = data.image;
    overlay.style.gridTemplateColumns = `repeat(${data.cols}, 1fr)`;
    overlay.style.gridTemplateRows = `repeat(${data.rows}, 1fr)`;
    overlay.innerHTML = '';
    for (let i = 0; i < data.rows * data.cols; i++) overlay.appendChild(el('span'));

    ribbon.innerHTML = '';
    data.tokens.forEach((token, index) => {
      const button = el('button', {
        class: 'im2latex-token',
        type: 'button',
        text: displayToken(token.label),
        'aria-label': `Show fine attention for output token ${displayToken(token.label)}`,
      });
      button.addEventListener('mouseenter', () => show(index));
      button.addEventListener('focus', () => show(index));
      button.addEventListener('click', () => show(index));
      ribbon.appendChild(button);
    });
    show(Math.min(4, data.tokens.length - 1)); // B: a clear, localized example.
  }

  async function load() {
    api.setStatus('Loading the original Image-to-LaTeX fine-attention map...');
    try {
      const response = await fetch('data/im2latex_attention.json');
      data = await response.json();
      build();
      api.setStatus('');
    } catch (error) {
      api.setStatus('Could not load the Image-to-LaTeX attention data.', 'err');
    }
  }

  const mount = el('div', { class: 'im2latex-attn-demo' }, [
    el('div', { class: 'demo-note', html: 'Hover a generated LaTeX token. The <b>pink</b> map is its spatial attention over the source image.' }),
    stage,
    ribbon,
    readout,
  ]);
  return { mount, init: load, onLeave: () => { active = -1; } };
});

/* =====================================================================
 *  DEMO 13 - real Qwen3-0.6B causal attention. Pick a sentence + measured
 *  head, click a query word, and inspect its allowed source weights.
 *  Data is precomputed in data/attn_tokens.json for reliable slide/PDF use.
 * ===================================================================== */
register('attention', (api) => {
  const canvas = api.canvasEl(320, 320);
  canvas.classList.add('clickable');
  const panel = el('div', { class: 'attn-panel' });
  const sentRow = el('div', { class: 'demo-controls' });
  const headRow = el('div', { class: 'demo-controls' });
  let data = null, si = 0, hi = 0, qi = null;

  const tokens = () => data.sentences[si].tokens;
  const headA = () => data.sentences[si].heads[hi].A;

  function layout() {
    const W = canvas.width, H = canvas.height, n = tokens().length;
    const padL = 88, padT = 70;
    const cell = Math.min(34, (W - padL - 8) / n, (H - padT - 8) / n);
    return { W, H, n, padL, padT, cell };
  }

  function draw() {
    const ctx = canvas.getContext('2d'); const { W, H, n, padL, padT, cell } = layout();
    const A = headA(), toks = tokens();
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.font = '12px ui-monospace, monospace';
    // key labels (top, rotated)
    ctx.fillStyle = '#374151'; ctx.textAlign = 'left';
    for (let j = 0; j < n; j++) {
      ctx.save(); ctx.translate(padL + j * cell + cell / 2 + 4, padT - 8); ctx.rotate(-Math.PI / 4);
      ctx.fillText(toks[j], 0, 0); ctx.restore();
    }
    // query labels (left)
    ctx.textAlign = 'right';
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = (i === qi) ? '#b91c1c' : '#374151';
      ctx.fillText(toks[i], padL - 6, padT + i * cell + cell / 2 + 4);
    }
    // Cells. A causal decoder has no future weights; render the mask explicitly
    // instead of making zero-valued future cells look like ordinary white cells.
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const w = A[i][j];
      const masked = data.causal && j > i;
      if (masked) {
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(padL + j * cell, padT + i * cell, cell - 1, cell - 1);
        ctx.fillStyle = '#cbd5e1'; ctx.textAlign = 'center';
        ctx.fillText('\u00d7', padL + j * cell + cell / 2, padT + i * cell + cell / 2 + 4);
      } else {
        ctx.fillStyle = `rgba(29,78,216,${Math.pow(w, 0.7).toFixed(3)})`;
        ctx.fillRect(padL + j * cell, padT + i * cell, cell - 1, cell - 1);
      }
    }
    // selected query row outline
    if (qi != null) {
      ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2.5;
      ctx.strokeRect(padL - 1, padT + qi * cell - 1, n * cell + 1, cell + 1);
    }
    ctx.textAlign = 'left'; ctx.fillStyle = '#6b7280'; ctx.font = '11px ui-monospace, monospace';
    ctx.fillText('source key \u2192', padL, padT + n * cell + 16);
    drawPanel();
  }

  function drawPanel() {
    panel.innerHTML = '';
    const toks = tokens();
    if (qi == null) {
      panel.appendChild(el('p', { class: 'attn-hint', html: 'Click any <b>row</b> (query word) to see where it looks.' }));
      return;
    }
    const row = headA()[qi];
    panel.appendChild(el('p', { class: 'attn-q', html: `query: <b>${toks[qi]}</b> attends to&hellip;` }));
    const order = toks.map((t, j) => [t, row[j], j])
      .filter(([, , j]) => !data.causal || j <= qi)
      .sort((a, b) => b[1] - a[1]);
    const max = order[0][1] || 1;
    const bars = el('div', { class: 'attn-bars2' });
    order.slice(0, 6).forEach(([t, w]) => {
      const r = el('div', { class: 'attn-row' }, [
        el('span', { class: 'attn-lab', text: t }),
        el('div', { class: 'attn-track' }, [el('div', { class: 'attn-fill', style: `width:${(w / max * 100).toFixed(1)}%` })]),
        el('span', { class: 'attn-num', text: w.toFixed(2) }),
      ]);
      bars.appendChild(r);
    });
    panel.appendChild(bars);
  }

  canvas.addEventListener('click', (e) => {
    if (!data) return;
    const { padL, padT, cell, n } = layout();
    const r = canvas.getBoundingClientRect();
    const my = (e.clientY - r.top) * canvas.height / r.height;
    const i = Math.floor((my - padT) / cell);
    if (i >= 0 && i < n) { qi = i; draw(); }
  });

  const markActive = (rowEl, k) => [...rowEl.children].forEach((b, idx) => { const a = idx === k; b.classList.toggle('primary', a); b.classList.toggle('ghost', !a); });
  function setHead(k) { hi = k; markActive(headRow, k); draw(); }
  function setSent(k) {
    si = k; hi = 0;
    qi = tokens().indexOf(data.sentences[si].default_query);
    if (qi < 0) qi = null;
    markActive(sentRow, k);
    buildHeadRow(); draw();
  }
  function buildHeadRow() {
    headRow.innerHTML = '';
    data.sentences[si].heads.forEach((h, k) =>
      headRow.appendChild(api.button(h.label, () => setHead(k), k === hi ? 'primary' : 'ghost')));
  }

  const mount = el('div', {}, [
    sentRow, headRow,
    el('div', { class: 'demo-stage' }, [canvas, panel]),
  ]);

  async function load() {
    if (data) return;
    api.setStatus('Loading real attention weights...');
    try {
      const res = await fetch('data/attn_tokens.json'); data = await res.json();
      data.sentences.forEach((s, k) =>
        sentRow.appendChild(api.button(s.label || ('"' + s.text + '"'), () => setSent(k), k === 0 ? 'primary' : 'ghost')));
      qi = tokens().indexOf(data.sentences[si].default_query); if (qi < 0) qi = null;
      buildHeadRow(); draw();
      const modelName = String(data.model || 'decoder').split('/').pop();
      api.setStatus(`Real ${modelName} causal attention. Click a query row.`, 'ok');
    } catch (e) { api.setStatus('Could not load attention data.', 'err'); }
  }
  return { mount, init: load };
});

/* =====================================================================
 *  DEMO 13 - causal masking: toggle the mask, pick a query, watch the
 *  attention renormalize over allowed (<= t) positions only. (pure JS)
 * ===================================================================== */
register('causal-mask', (api) => {
  const toks = ['The', 'cat', 'sat', 'on', 'the', 'mat'];
  const n = toks.length;
  const canvas = api.canvasEl(240, 240);
  canvas.classList.add('clickable');
  const panel = el('div', { class: 'attn-panel' });
  let causal = true, qi = 3;
  // fixed "raw" scores (pre-softmax), same for both modes so the effect is clear
  const raw = [];
  const r = api.rng32(7);
  for (let i = 0; i < n; i++) { raw.push([]); for (let j = 0; j < n; j++) raw[i].push(0.4 + 1.6 * r()); }

  function weights(i) {
    const s = raw[i].map((v, j) => (causal && j > i) ? -Infinity : v);
    const m = Math.max(...s.filter((x) => isFinite(x)));
    const ex = s.map((v) => isFinite(v) ? Math.exp(v - m) : 0);
    const z = ex.reduce((a, b) => a + b, 0) || 1;
    return ex.map((v) => v / z);
  }
  function layout() { const W = canvas.width, H = canvas.height, padL = 52, padT = 44; const cell = Math.min(38, (W - padL - 6) / n, (H - padT - 6) / n); return { W, H, padL, padT, cell }; }

  function draw() {
    const ctx = canvas.getContext('2d'); const { W, H, padL, padT, cell } = layout();
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = '#374151'; ctx.textAlign = 'left';
    for (let j = 0; j < n; j++) { ctx.save(); ctx.translate(padL + j * cell + cell / 2 + 3, padT - 6); ctx.rotate(-Math.PI / 4); ctx.fillText(toks[j], 0, 0); ctx.restore(); }
    ctx.textAlign = 'right';
    for (let i = 0; i < n; i++) { ctx.fillStyle = i === qi ? '#b91c1c' : '#374151'; ctx.fillText(toks[i], padL - 5, padT + i * cell + cell / 2 + 3); }
    for (let i = 0; i < n; i++) {
      const w = weights(i);
      for (let j = 0; j < n; j++) {
        const masked = causal && j > i;
        if (masked) { ctx.fillStyle = '#f3f4f6'; ctx.fillRect(padL + j * cell, padT + i * cell, cell - 1, cell - 1); ctx.fillStyle = '#cbd5e1'; ctx.textAlign = 'center'; ctx.fillText('\u2715', padL + j * cell + cell / 2, padT + i * cell + cell / 2 + 4); }
        else { ctx.fillStyle = `rgba(29,78,216,${Math.pow(w[j], 0.7).toFixed(3)})`; ctx.fillRect(padL + j * cell, padT + i * cell, cell - 1, cell - 1); }
      }
    }
    if (qi != null) { ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2.5; ctx.strokeRect(padL - 1, padT + qi * cell - 1, n * cell + 1, cell + 1); }
    drawPanel();
  }
  function drawPanel() {
    panel.innerHTML = '';
    panel.appendChild(el('p', { class: 'attn-q', html: `query: <b>${toks[qi]}</b> (position ${qi + 1})` }));
    const w = weights(qi); const bars = el('div', { class: 'attn-bars2' });
    toks.forEach((t, j) => {
      const masked = causal && j > qi;
      bars.appendChild(el('div', { class: 'attn-row' + (masked ? ' muted' : '') }, [
        el('span', { class: 'attn-lab', text: t }),
        el('div', { class: 'attn-track' }, [el('div', { class: 'attn-fill', style: `width:${(w[j] * 100).toFixed(1)}%` })]),
        el('span', { class: 'attn-num', text: masked ? '\u2014' : w[j].toFixed(2) }),
      ]));
    });
    panel.appendChild(bars);
    panel.appendChild(el('p', { class: 'attn-hint', html: causal ? 'Future words are blocked, so the weights renormalize over positions &le; t.' : 'No mask: the query can look both left and right.' }));
  }
  canvas.addEventListener('click', (e) => { const { padT, cell } = layout(); const r2 = canvas.getBoundingClientRect(); const my = (e.clientY - r2.top) * canvas.height / r2.height; const i = Math.floor((my - padT) / cell); if (i >= 0 && i < n) { qi = i; draw(); } });
  const toggle = api.button('causal mask: ON', () => { causal = !causal; toggle.textContent = 'causal mask: ' + (causal ? 'ON' : 'OFF'); toggle.classList.toggle('primary', causal); toggle.classList.toggle('ghost', !causal); draw(); }, 'primary');
  const mount = el('div', {}, [
    el('div', { class: 'demo-controls' }, [toggle]),
    el('div', { class: 'demo-stage' }, [canvas, panel]),
  ]);
  return { mount, init: draw };
});

/* =====================================================================
 *  DEMO 14 - path length: RNN (sequential, O(n)) vs attention (one hop,
 *  but O(n^2) pairwise scores). Slider over sequence length. (pure JS)
 * ===================================================================== */
register('path-length', (api) => {
  const canvas = api.canvasEl(720, 250);
  const readout = el('div', { class: 'demo-readout' });
  const nCtl = api.slider('sequence length n', { min: 4, max: 16, step: 1, value: 8, fmt: (v) => v });

  function draw() {
    const n = nCtl.get();
    const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    const padL = 30, padR = 30, y1 = 78, y2 = 196;
    const xs = (i) => padL + (W - padL - padR) * (n <= 1 ? 0 : i / (n - 1));
    ctx.font = '13px ui-monospace, monospace'; ctx.textAlign = 'left'; ctx.fillStyle = '#374151';
    ctx.fillText('RNN: state passed step by step', padL, y1 - 40);
    ctx.fillText('Causal attention: last query reaches every earlier source', padL, y2 - 40);

    // RNN chain
    ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 3;
    ctx.beginPath(); for (let i = 0; i < n - 1; i++) { ctx.moveTo(xs(i) + 8, y1); ctx.lineTo(xs(i + 1) - 8, y1); } ctx.stroke();
    for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(xs(i), y1, 7, 0, 7); ctx.fillStyle = (i === 0 || i === n - 1) ? '#dc2626' : '#93c5fd'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#1e3a8a'; ctx.stroke(); }

    // Causal attention from the final query to every allowed earlier source.
    ctx.strokeStyle = 'rgba(37,99,235,0.18)'; ctx.lineWidth = 1;
    for (let i = 0; i < n - 1; i++) { const mx = (xs(i) + xs(n - 1)) / 2, h = 10 + (n - 1 - i) * 5; ctx.beginPath(); ctx.moveTo(xs(i), y2); ctx.quadraticCurveTo(mx, y2 - h, xs(n - 1), y2); ctx.stroke(); }
    ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2.5; { const mx = (xs(0) + xs(n - 1)) / 2; ctx.beginPath(); ctx.moveTo(xs(0), y2); ctx.quadraticCurveTo(mx, y2 - (18 + (n - 1) * 5), xs(n - 1), y2); ctx.stroke(); }
    for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(xs(i), y2, 7, 0, 7); ctx.fillStyle = (i === 0 || i === n - 1) ? '#dc2626' : '#93c5fd'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#1e3a8a'; ctx.stroke(); }

    readout.innerHTML = '';
    readout.appendChild(el('span', { html: `RNN: first &harr; last token is <b>${n - 1} steps</b> apart (must go one at a time)` }));
    readout.appendChild(el('span', { html: `Causal attention: last query reaches any earlier source in <b>1 hop</b>; sequence compute remains <b>O(n\u00b2)</b>` }));
  }
  const mount = el('div', {}, [
    el('div', { class: 'demo-controls' }, [nCtl.field]),
    el('div', { class: 'demo-stage' }, [canvas, readout]),
  ]);
  nCtl.input.addEventListener('input', draw);
  return { mount, init: draw };
});

/* =====================================================================
 *  DEMO 15 - permutation nuance for a causal decoder. Keep one final query
 *  fixed and shuffle only the same previous words. First-layer content-only
 *  attention is invariant by word; position information breaks the tie.
 * ===================================================================== */
register('attn-permute', (api) => {
  const dim = 6;
  const vocab = ['dog', 'bites', 'man', 'because'];
  const r = api.rng32(11);
  const content = {}; vocab.forEach((w) => { content[w] = Array.from({ length: dim }, () => r() * 2 - 1); });
  const u = Array.from({ length: dim }, () => r() * 2 - 1);  // a shared "position" direction
  const prefixes = [['dog', 'bites', 'man'], ['man', 'bites', 'dog']];
  const queryWord = 'because';
  let usePos = false;

  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  // The final query slot stays fixed. Only the same three source words shuffle.
  const vec = (w, slot) => usePos ? content[w].map((x, i) => x + 0.8 * slot * u[i]) : content[w];
  function weights(prefix) {
    const qslot = prefix.length;
    const q = vec(queryWord, qslot);
    const scores = prefix.map((word, slot) => dot(q, vec(word, slot)));
    const m = Math.max(...scores);
    const ex = scores.map((score) => Math.exp(score - m));
    const z = ex.reduce((a, b) => a + b, 0) || 1;
    return ex.map((v) => v / z);
  }
  const box = el('div', {});
  function render() {
    box.innerHTML = '';
    const rows = prefixes.map((order) => ({ order, w: weights(order) }));
    const byWord = (order, weightsForOrder) =>
      Object.fromEntries(order.map((token, index) => [token, weightsForOrder[index]]));
    prefixes.forEach((order, si) => {
      const w = rows[si].w;
      const grp = el('div', { class: 'permute-grp' });
      grp.appendChild(el('p', { class: 'attn-q', html: `&ldquo;${order.join(' ')} <b>because</b>&rdquo;<br><b>q<sub>because</sub></b> attends backward to:` }));
      const bars = el('div', { class: 'attn-bars2' });
      order.forEach((t, j) => bars.appendChild(el('div', { class: 'attn-row' }, [
        el('span', { class: 'attn-lab', text: t }),
        el('div', { class: 'attn-track' }, [el('div', { class: 'attn-fill', style: `width:${(w[j] * 100).toFixed(1)}%` })]),
        el('span', { class: 'attn-num', text: w[j].toFixed(2) }),
      ])));
      grp.appendChild(bars);
      box.appendChild(grp);
    });
    // Are the two weight assignments equal after matching each source by word?
    const a = byWord(prefixes[0], rows[0].w), b = byWord(prefixes[1], rows[1].w);
    const same = prefixes[0].every((t) => Math.abs(a[t] - b[t]) < 1e-3);
    const equation = (label, values) =>
      `<i>z</i><sub>${label}</sub> = ${values.dog.toFixed(2)}<i>v</i><sub>dog</sub> + ` +
      `${values.bites.toFixed(2)}<i>v</i><sub>bites</sub> + ${values.man.toFixed(2)}<i>v</i><sub>man</sub>`;
    box.appendChild(el('div', {
      class: 'permute-verdict ' + (same ? 'same' : 'diff'),
      html:
        `<div class="permute-sums"><span>${equation('1', a)}</span><b>${same ? '=' : '\u2260'}</b><span>${equation('2', b)}</span></div>` +
        `<div class="permute-conclusion">${same
          ? '<b>Same weighted sum \u2192 same context.</b> Layer 1 cannot tell who bit whom.'
          : '<b>Different weighted sums \u2192 different context</b> before next-token prediction.'}</div>`,
    }));
  }
  const toggle = api.button('add positions: OFF', () => { usePos = !usePos; toggle.textContent = 'add positions: ' + (usePos ? 'ON' : 'OFF'); toggle.classList.toggle('primary', usePos); toggle.classList.toggle('ghost', !usePos); render(); }, 'ghost');
  const mount = el('div', {}, [
    el('div', { class: 'demo-controls' }, [toggle]),
    box,
    el('div', { class: 'demo-hint', html: '<b>Deeper layers can differ anyway:</b> each source hidden state was built from a different causal prefix.' }),
  ]);
  return { mount, init: render };
});

/* =====================================================================
 *  DEMO 16 - Qwen tokenizer: text -> byte/subword pieces -> integer IDs.
 *  Presets are precomputed; custom text downloads only the tokenizer.
 * ===================================================================== */
register('tokenizer', (api) => {
  let samples = null;
  const input = el('input', { class: 'demo-input', type: 'text', value: 'unbelievable', 'aria-label': 'Text to tokenize' });
  const presetRow = el('div', { class: 'demo-controls' });
  const chips = el('div', { class: 'tokchips' });
  const info = el('div', { class: 'demo-readout tokenizer-readout' });
  input.addEventListener('keydown', (e) => e.stopPropagation());

  const byteCount = (text) => new TextEncoder().encode(text).length;
  const presetLabel = (text) => {
    if (text === "CS486 tokenization isn't trivial") return 'CS486';
    if (text === 'hello') return 'hello';
    if (text === ' hello') return '\u00b7hello';
    if (text.includes('range')) return 'code';
    return text;
  };

  function renderPieces(record) {
    chips.innerHTML = '';
    record.pieces.forEach((piece, index) => chips.appendChild(el('div', {
      class: 'tokchip c' + (index % 5),
      title: `token id ${piece.id}`,
    }, [
      el('span', { class: 'tp', text: piece.piece }),
      el('span', { class: 'ti', text: piece.id }),
    ])));
    info.innerHTML = '';
    info.appendChild(el('span', { html: `<b>${record.characters ?? [...record.text].length}</b> characters` }));
    info.appendChild(el('span', { html: `<b>${record.bytes ?? byteCount(record.text)}</b> UTF-8 bytes` }));
    info.appendChild(el('span', { html: `<b>${record.token_count ?? record.pieces.length}</b> tokens` }));
  }

  async function tokenizeLive() {
    try {
      const tokenizer = await api.getTokenizer('onnx-community/Qwen3-0.6B-ONNX');
      const text = input.value;
      const ids = Array.from(tokenizer.encode(text), Number);
      const pieces = ids.map((id) => {
        let piece = tokenizer.decode([id]);
        if (piece.startsWith(' ')) piece = '\u00b7' + piece.slice(1);
        if (piece === '\n') piece = '\u21b5';
        else piece = piece.replace(/\n/g, '\u21b5');
        return { piece, id };
      });
      renderPieces({ text, characters: [...text].length, bytes: byteCount(text), token_count: pieces.length, pieces });
      api.setStatus('Tokenized with the Qwen3 tokenizer.', 'ok');
    } catch (e) {
      api.setStatus('Could not load the tokenizer; the preset examples still work.', 'err');
    }
  }

  const mount = el('div', {}, [
    presetRow,
    el('div', { class: 'demo-controls' }, [input, api.button('tokenize custom text', tokenizeLive)]),
    chips,
    info,
    el('div', { class: 'demo-hint', text: 'Separate chips are separate tokens. The \u00b7 symbol is not a separator; it represents one leading blank.' }),
  ]);

  async function load() {
    try {
      const response = await fetch('data/lm_samples.json');
      samples = await response.json();
    } catch (e) {
      samples = {
        tokenize: [{
          text: 'unbelievable', characters: 12, bytes: 12, token_count: 3,
          pieces: [{ piece: 'un', id: 359 }, { piece: 'belie', id: 31798 }, { piece: 'vable', id: 23760 }],
        }],
      };
    }
    samples.tokenize.forEach((sample, index) => presetRow.appendChild(api.button(presetLabel(sample.text), () => {
      input.value = sample.text;
      renderPieces(sample);
      markActive(index);
    }, index === 0 ? 'primary' : 'ghost')));
    input.value = samples.tokenize[0].text;
    renderPieces(samples.tokenize[0]);
  }
  const markActive = (index) => [...presetRow.children].forEach((button, i) => {
    button.classList.toggle('primary', i === index);
    button.classList.toggle('ghost', i !== index);
  });
  return { mount, init: load };
});

/* =====================================================================
 *  DEMO 17 - multi-step autoregressive traces from Qwen3-0.6B-Base.
 *  Repeated clicks reveal a new, correctly conditioned distribution.
 * ===================================================================== */
register('lm-step', (api) => {
  let samples = null;
  let current = null;
  let mode = 'greedy';
  let stepIndex = 0;
  let appended = [];
  const promptRow = el('div', { class: 'demo-controls' });
  const bars = el('div', { class: 'lm-step-bars' });
  const result = el('div', { class: 'lm-step-result' });
  const promptLabel = (prompt) => {
    if (prompt.startsWith('To be')) return 'Shakespeare';
    if (prompt.startsWith('The robot')) return 'robot';
    return 'story';
  };
  const formatProbability = (probability) => probability >= 0.001
    ? probability.toFixed(3)
    : probability.toExponential(1);
  const visiblePiece = (piece) => piece.replace(/^\u00b7/, ' ').replace(/\u21b5/g, '\u21b5');
  const highlightedPiece = (piece) => piece.replace(/^\u00b7/, '\u00a0').replace(/\u21b5/g, '\u21b5');
  const trace = () => current.traces[mode];
  const currentStep = () => trace().steps[stepIndex];
  const contextText = () => current.prompt + appended.map((choice) => visiblePiece(choice.piece)).join('');

  function renderDistribution() {
    bars.innerHTML = '';
    const step = currentStep();
    if (!step) {
      bars.appendChild(el('div', { class: 'lm-step-done', text: `${trace().steps.length} append steps complete. Reset or switch selection rule.` }));
      return;
    }
    const maximum = Math.max(...step.top.map((item) => item.p), 0.001);
    step.top.slice(0, 6).forEach((item, index) => bars.appendChild(el('div', {
      class: 'lm-step-row' + (index === 0 ? ' top' : ''),
    }, [
      el('span', { class: 'lm-step-token', text: item.piece }),
      el('div', { class: 'lm-step-track' }, [
        el('div', { class: 'lm-step-fill', style: `width:${(item.p / maximum * 100).toFixed(1)}%` }),
      ]),
      el('span', { class: 'lm-step-prob', text: formatProbability(item.p) }),
    ])));
    bars.appendChild(el('div', { class: 'lm-step-tail' }, [
      el('span', { text: 'all other vocabulary tokens' }),
      el('b', { text: step.tail_mass.toFixed(3) }),
    ]));
  }

  function renderResult(lastChoice = null) {
    result.innerHTML = '';
    if (lastChoice) {
      result.appendChild(el('div', {
        class: 'lm-step-method',
        html: `<b>step ${stepIndex}</b> selected <code>${lastChoice.piece}</code> with raw probability ${formatProbability(lastChoice.p)}.`,
      }));
    } else {
      result.appendChild(el('span', {
        class: 'lm-step-placeholder',
        text: 'Click “append next token” repeatedly. Each click uses the distribution conditioned on the enlarged context.',
      }));
    }
    const previousText = current.prompt + appended
      .slice(0, -1)
      .map((choice) => visiblePiece(choice.piece))
      .join('');
    const context = el('div', { class: 'lm-step-context' }, [el('span', { text: previousText })]);
    if (lastChoice) context.appendChild(el('mark', { text: highlightedPiece(lastChoice.piece) }));
    result.appendChild(context);
  }

  function render() {
    const prompt = mount.querySelector('#lm-step-prompt');
    prompt.innerHTML = '';
    prompt.appendChild(el('span', { text: currentStep() ? `step ${stepIndex + 1}: ` : 'completed context: ' }));
    prompt.appendChild(el('b', { text: contextText() }));
    if (currentStep()) prompt.appendChild(document.createTextNode(' \u2192 ?'));
    renderDistribution();
    renderResult(appended.at(-1) || null);
    appendButton.disabled = !currentStep();
    greedyButton.classList.toggle('primary', mode === 'greedy');
    greedyButton.classList.toggle('ghost', mode !== 'greedy');
    sampleButton.classList.toggle('primary', mode === 'sample');
    sampleButton.classList.toggle('ghost', mode !== 'sample');
  }

  function reset() {
    stepIndex = 0;
    appended = [];
    render();
  }

  function setMode(nextMode) {
    mode = nextMode;
    reset();
  }

  function appendNext() {
    const step = currentStep();
    if (!step) return;
    appended.push(step.choice);
    stepIndex += 1;
    render();
  }

  const greedyButton = api.button('highest each step', () => setMode('greedy'));
  const sampleButton = api.button('sample each step', () => setMode('sample'), 'ghost');
  const appendButton = api.button('append next token', appendNext);
  const resetButton = api.button('reset', reset, 'ghost');

  const mount = el('div', {}, [
    promptRow,
    el('div', { class: 'lm-step-layout' }, [
      el('div', { class: 'lm-step-left' }, [el('div', { class: 'lm-prompt', id: 'lm-step-prompt' }), bars]),
      el('div', { class: 'lm-step-right' }, [
        el('div', { class: 'demo-controls lm-step-modes' }, [greedyButton, sampleButton]),
        el('div', { class: 'demo-controls lm-step-actions' }, [appendButton, resetButton]),
        result,
      ]),
    ]),
    el('div', { class: 'demo-hint', text: 'In candidate labels, \u00b7 means a leading space; the appended context renders the real blank. Every click then updates to the next conditional distribution.' }),
  ]);

  function setPrompt(index) {
    current = samples.next[index];
    [...promptRow.children].forEach((button, i) => {
      button.classList.toggle('primary', i === index);
      button.classList.toggle('ghost', i !== index);
    });
    reset();
  };

  async function load() {
    try {
      const response = await fetch('data/lm_samples.json');
      samples = await response.json();
    } catch (e) {
      samples = {
        next: [{
          prompt: 'To be, or not to',
          traces: {
            greedy: { steps: [
              { top: [{ piece: '\u00b7be', p: 0.8 }, { piece: ',', p: 0.05 }], tail_mass: 0.15, choice: { piece: '\u00b7be', p: 0.8 } },
              { top: [{ piece: ',', p: 0.5 }, { piece: '\u00b7or', p: 0.2 }], tail_mass: 0.3, choice: { piece: ',', p: 0.5 } },
            ] },
            sample: { steps: [
              { top: [{ piece: '\u00b7be', p: 0.8 }, { piece: ',', p: 0.05 }], tail_mass: 0.15, choice: { piece: '\u00b7be', p: 0.8 } },
              { top: [{ piece: ',', p: 0.5 }, { piece: '\u00b7or', p: 0.2 }], tail_mass: 0.3, choice: { piece: '\u00b7or', p: 0.2 } },
            ] },
          },
        }],
      };
    }
    samples.next.forEach((item, index) => promptRow.appendChild(api.button(
      promptLabel(item.prompt),
      () => setPrompt(index),
      index === 0 ? 'primary' : 'ghost',
    )));
    setPrompt(0);
  }
  return { mount, init: load };
});

/* =====================================================================
 *  DEMO 18 - inspect exact teacher-forcing losses from Qwen3-0.6B-Base.
 * ===================================================================== */
register('lm-loss', (api) => {
  let samples = null;
  let current = null;
  let selected = 0;
  const exampleRow = el('div', { class: 'demo-controls' });
  const timeline = el('div', { class: 'loss-timeline' });
  const inspector = el('div', { class: 'loss-inspector' });
  const summary = el('div', { class: 'loss-summary' });

  const pieceText = (piece) => piece.replace(/^\u00b7/, ' ').replace(/\u21b5/g, '\n');
  const formatProbability = (probability) => probability >= 0.001
    ? probability.toFixed(3)
    : probability.toExponential(1);
  const lossClass = (loss) => loss < 2 ? 'low' : loss < 5 ? 'mid' : 'high';
  const visiblePrefix = (prediction) => current.tokens
    .slice(0, prediction.position + 1)
    .map((token) => pieceText(token.piece))
    .join('');

  function renderInspector(index) {
    selected = index;
    [...timeline.querySelectorAll('button')].forEach((button, i) => button.classList.toggle('selected', i === index));
    const prediction = current.predictions[index];
    inspector.innerHTML = '';
    inspector.appendChild(el('div', { class: 'loss-prefix' }, [
      el('span', { text: 'prefix' }),
      el('code', { text: visiblePrefix(prediction) }),
    ]));
    inspector.appendChild(el('div', { class: 'loss-detail' }, [
      el('span', { html: `target <code>${prediction.target.piece}</code>` }),
      el('span', { html: `p = <b>${formatProbability(prediction.p)}</b>` }),
      el('span', { html: `\u2212ln p = <b>${prediction.loss.toFixed(2)}</b>` }),
    ]));
    inspector.appendChild(el('div', {
      class: 'loss-verdict ' + lossClass(prediction.loss),
      text: prediction.loss < 2 ? 'predictable here \u2192 small gradient signal' : prediction.loss >= 5 ? 'surprising here \u2192 large gradient signal' : 'moderately surprising',
    }));
  }

  function renderExample(exampleIndex) {
    current = samples.loss[exampleIndex];
    [...exampleRow.children].forEach((button, index) => {
      button.classList.toggle('primary', index === exampleIndex);
      button.classList.toggle('ghost', index !== exampleIndex);
    });
    timeline.innerHTML = '';
    current.predictions.forEach((prediction, index) => {
      const button = el('button', {
        class: `loss-token ${lossClass(prediction.loss)}`,
        type: 'button',
        title: `loss ${prediction.loss.toFixed(2)}`,
        'aria-label': `Inspect target token ${prediction.target.piece}`,
      }, [
        el('span', { text: prediction.target.piece }),
        el('small', { text: prediction.loss.toFixed(1) }),
      ]);
      button.addEventListener('click', () => renderInspector(index));
      timeline.appendChild(button);
    });
    summary.innerHTML = '';
    summary.appendChild(el('span', { html: `average NLL <b>${current.average_loss.toFixed(2)}</b>` }));
    summary.appendChild(el('span', { html: `perplexity <b>${current.perplexity.toFixed(1)}</b>` }));
    summary.appendChild(el('span', { html: `<b>${current.predictions.length}</b> training signals` }));
    const easiest = current.predictions.reduce((best, item, index) => item.loss < current.predictions[best].loss ? index : best, 0);
    renderInspector(easiest);
  }

  const mount = el('div', {}, [
    el('div', { class: 'demo-note', html: '<b>Color encodes target loss:</b> green = lower, amber = medium, red = higher. Numbers are nats.' }),
    exampleRow,
    timeline,
    inspector,
    summary,
    el('div', { class: 'demo-hint', text: 'Click any target token. Its prefix is exactly what that position could use under the causal mask.' }),
  ]);

  async function load() {
    try {
      const response = await fetch('data/lm_samples.json');
      samples = await response.json();
    } catch (e) {
      samples = {
        loss: [{
          id: 'fallback',
          label: 'example',
          tokens: [{ piece: 'The' }, { piece: '\u00b7robot' }, { piece: '\u00b7picked' }, { piece: '\u00b7up' }],
          predictions: [
            { position: 0, target: { piece: '\u00b7robot' }, p: 0.02, loss: 3.91 },
            { position: 1, target: { piece: '\u00b7picked' }, p: 0.12, loss: 2.12 },
            { position: 2, target: { piece: '\u00b7up' }, p: 0.68, loss: 0.39 },
          ],
          average_loss: 2.14,
          perplexity: 8.5,
        }],
      };
    }
    samples.loss.forEach((example, index) => exampleRow.appendChild(api.button(
      example.label,
      () => renderExample(index),
      index === 0 ? 'primary' : 'ghost',
    )));
    renderExample(0);
  }
  return { mount, init: load };
});

/* =====================================================================
 *  DEMO 19 - exact Qwen message serialization and thinking protocol.
 * ===================================================================== */
register('chat-template', (api) => {
  let data = null;
  let promptIndex = 0;
  let thinking = false;
  const promptRow = el('div', { class: 'demo-controls' });
  const rawMessage = el('div', { class: 'template-message' });
  const serialized = el('pre', { class: 'chat-tmpl' });
  const metadata = el('div', { class: 'template-meta' });
  const promptLabel = (item) => ({ explain: 'single turn', reason: 'reasoning', future: 'future fact', multi: 'multi-turn' }[item.id] || item.id);
  const escapeHtml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function render() {
    const item = data.chat[promptIndex];
    const record = thinking ? item.thinking_on : item.thinking_off;
    rawMessage.innerHTML = '';
    item.messages.forEach((message) => {
      rawMessage.appendChild(el('div', { class: 'tm-role', text: message.role }));
      rawMessage.appendChild(el('div', { class: 'tm-content', text: message.content }));
    });
    serialized.innerHTML = escapeHtml(record.text)
      .replace(/&lt;\|[^|]*?\|&gt;/g, (match) => `<span class="sp">${match}</span>`)
      .replace(/&lt;\/?think&gt;/g, (match) => `<span class="sp think">${match}</span>`);
    metadata.innerHTML = '';
    metadata.appendChild(el('span', { html: `<b>${record.token_count}</b> tokens after serialization` }));
    metadata.appendChild(el('span', {
      class: thinking ? 'thinking-on' : 'thinking-off',
      text: thinking
        ? 'Template stops at assistant cue; Qwen generates <think>…</think>.'
        : 'Template pre-fills an empty <think></think>; Qwen starts the answer.',
    }));
    [...promptRow.children].forEach((button, index) => {
      button.classList.toggle('primary', index === promptIndex);
      button.classList.toggle('ghost', index !== promptIndex);
    });
    toggle.textContent = 'thinking: ' + (thinking ? 'ON' : 'OFF');
    toggle.classList.toggle('primary', thinking);
    toggle.classList.toggle('ghost', !thinking);
  }

  const toggle = api.button('thinking: OFF', () => { thinking = !thinking; render(); }, 'ghost');
  const mount = el('div', {}, [
    promptRow,
    el('div', { class: 'demo-controls template-toggle' }, [toggle]),
    el('div', { class: 'template-compare' }, [
      el('div', { class: 'template-side' }, [el('h4', { text: 'structured message' }), rawMessage]),
      el('div', { class: 'template-side serialized' }, [el('h4', { text: 'exact string sent to tokenizer' }), serialized]),
    ]),
    metadata,
    el('div', { class: 'demo-hint', text: 'Blue marks chat-control tokens. Green marks the thinking protocol. The user content is unchanged.' }),
  ]);
  async function load() {
    try {
      const response = await fetch('data/qwen_samples.json');
      data = await response.json();
    } catch (error) {
      const user = 'Explain gradient descent in one sentence.';
      data = { chat: [{
        id: 'explain',
        user,
        messages: [{ role: 'user', content: user }],
        thinking_off: {
          text: `<|im_start|>user\n${user}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n`,
          token_count: 20,
        },
        thinking_on: {
          text: `<|im_start|>user\n${user}<|im_end|>\n<|im_start|>assistant\n`,
          token_count: 16,
        },
      }] };
      api.setStatus('Using the embedded template fallback.', 'err');
    }
    data.chat.forEach((item, index) => promptRow.appendChild(api.button(
      promptLabel(item),
      () => { promptIndex = index; render(); },
      index === 0 ? 'primary' : 'ghost',
    )));
    render();
  }
  return { mount, init: load };
});

/* =====================================================================
 *  DEMO 20 - exact multi-step Qwen generation trace.
 * ===================================================================== */
register('qwen-trace', (api) => {
  let data = null;
  let trace = null;
  let stepIndex = 0;
  let appended = [];
  const bars = el('div', { class: 'qwen-trace-bars' });
  const context = el('div', { class: 'qwen-trace-context' });
  const status = el('div', { class: 'qwen-trace-status' });
  const pieceText = (piece) => piece.replace(/^\u00b7/, ' ').replace(/\u21b5/g, '\n');
  const highlightedPiece = (piece) => piece.replace(/^\u00b7/, '\u00a0').replace(/\u21b5/g, '\u21b5');
  const formatP = (probability) => probability >= 0.001 ? probability.toFixed(3) : probability.toExponential(1);

  function render() {
    const step = trace.steps[stepIndex];
    bars.innerHTML = '';
    if (step) {
      const maximum = Math.max(...step.top.map((item) => item.p), 0.001);
      step.top.slice(0, 6).forEach((item, index) => bars.appendChild(el('div', { class: 'qt-row' + (index === 0 ? ' top' : '') }, [
        el('span', { text: item.piece }),
        el('i', {}, [el('b', { style: `width:${(item.p / maximum * 100).toFixed(1)}%` })]),
        el('code', { text: formatP(item.p) }),
      ])));
      bars.appendChild(el('div', { class: 'qt-tail' }, [el('span', { text: 'all other tokens' }), el('code', { text: step.tail_mass.toFixed(3) })]));
      status.textContent = `next distribution: step ${stepIndex + 1} of ${trace.steps.length}`;
    } else {
      bars.appendChild(el('div', { class: 'qt-done', text: `${trace.steps.length} real generation steps complete.` }));
      status.textContent = 'trace complete';
    }
    context.innerHTML = '';
    const prior = `user: ${trace.prompt}\nassistant: ` + appended.slice(0, -1).map((item) => pieceText(item.piece)).join('');
    context.appendChild(el('span', { text: prior }));
    if (appended.length) context.appendChild(el('mark', { text: highlightedPiece(appended.at(-1).piece) }));
    nextButton.disabled = !step;
  }

  function next() {
    const step = trace.steps[stepIndex];
    if (!step) return;
    appended.push(step.choice);
    stepIndex += 1;
    render();
  }
  function reset() {
    stepIndex = 0;
    appended = [];
    render();
  }
  const nextButton = api.button('append next token', next);
  const mount = el('div', {}, [
    el('div', { class: 'demo-note', text: 'Qwen3-0.6B post-trained assistant \u00b7 non-thinking prompt \u00b7 greedy trace.' }),
    status,
    el('div', { class: 'qwen-trace-layout' }, [bars, context]),
    el('div', { class: 'demo-controls qwen-trace-controls' }, [nextButton, api.button('reset', reset, 'ghost')]),
    el('div', { class: 'demo-hint', text: 'Candidate labels use \u00b7 for a leading space. Every click reads a newly conditioned distribution.' }),
  ]);
  async function load() {
    try {
      const response = await fetch('data/qwen_samples.json');
      data = await response.json();
      trace = data.main_trace;
    } catch (error) {
      data = {};
      trace = {
        prompt: 'Explain gradient descent in one sentence.',
        steps: [
          { top: [{ piece: 'Gradient', p: 0.985 }, { piece: 'The', p: 0.004 }], tail_mass: 0.011, choice: { piece: 'Gradient', p: 0.985 } },
          { top: [{ piece: '\u00b7descent', p: 0.62 }, { piece: '\u00b7is', p: 0.11 }], tail_mass: 0.27, choice: { piece: '\u00b7descent', p: 0.62 } },
        ],
      };
      api.setStatus('Using the embedded generation fallback.', 'err');
    }
    render();
  }
  return { mount, init: load };
});

/* =====================================================================
 *  DEMO 20a - kv-reuse: animate decoding word by word, showing that earlier
 *  hidden states / K/V are reused from cache instead of recomputed. (L21)
 * ===================================================================== */
register('kv-reuse', (api) => {
  const prefill = ['\u2039prompt\u203a', 'Explain', '\u00b7gradient', '\u00b7descent', '\u2026'];
  const generated = ['Gradient', '\u00b7descent', '\u00b7is', '\u00b7a'];
  let step = 0; // 0 = prefill; k = after generating k words
  const track = el('div', { class: 'kvr-track' });
  const status = el('div', { class: 'kvr-status' });
  const disp = (t) => t.replace(/^\u00b7/, ' ');

  function render() {
    const positions = [...prefill, ...generated.slice(0, step)];
    const newIndex = step === 0 ? -1 : positions.length - 1; // only the last position is fresh after prefill
    track.innerHTML = '';
    positions.forEach((token, index) => {
      const fresh = step === 0 ? true : index === newIndex;
      track.appendChild(el('div', { class: 'kvr-col ' + (fresh ? 'fresh' : 'reused') }, [
        el('div', { class: 'kvr-chip', text: fresh ? 'compute' : 'reuse' }),
        el('div', { class: 'kvr-box' }),
        el('div', { class: 'kvr-tok', text: disp(token) }),
      ]));
    });
    if (step === 0) {
      status.innerHTML = `<b>prefill:</b> compute hidden states + K/V for all ${prefill.length} prompt positions in parallel.`;
    } else {
      status.innerHTML = `<b>decode step ${step}:</b> reuse ${positions.length - 1} cached states, compute only <b>1</b> new column.`;
    }
    nextButton.textContent = step === 0 ? 'generate first word' : step < generated.length ? 'generate next word' : 'done';
    nextButton.disabled = step >= generated.length;
  }
  function next() { if (step < generated.length) { step += 1; render(); } }
  function reset() { step = 0; render(); }
  const nextButton = api.button('generate first word', next);
  const mount = el('div', {}, [
    status,
    track,
    el('div', { class: 'demo-controls' }, [nextButton, api.button('reset', reset, 'ghost')]),
    el('div', { class: 'demo-hint', text: 'Green = computed this step, gray = reused from the KV cache. Because attention is causal, earlier states never change, so each decode step computes just one new column.' }),
  ]);
  return { mount, init: render };
});

/* =====================================================================
 *  DEMO 20b - kv-cache: one row per forward pass, showing that each decode
 *  step adds only one new column with the cache, versus recomputing all. (L21)
 * ===================================================================== */
register('kv-cache', (api) => {
  const P = 4;              // prompt length
  const maxSteps = 4;       // decode steps to reveal
  let shown = 1;            // rows revealed (1 = prefill only)
  const rows = el('div', { class: 'kvw-rows' });
  const totals = el('div', { class: 'kvw-totals' });

  function render() {
    rows.innerHTML = '';
    let withCache = 0, without = 0;
    for (let r = 0; r < shown; r++) {
      const cached = r === 0 ? 0 : P + (r - 1);   // gray, reused
      const fresh = r === 0 ? P : 1;              // colored, computed now
      withCache += fresh;
      without += P + r;                           // naive recompute of the whole context
      const cells = el('div', { class: 'kvw-cells' });
      for (let c = 0; c < cached; c++) cells.appendChild(el('i', { class: 'kvw-cell reused' }));
      for (let c = 0; c < fresh; c++) cells.appendChild(el('i', { class: 'kvw-cell fresh' }));
      rows.appendChild(el('div', { class: 'kvw-row' }, [
        el('span', { class: 'kvw-label', text: r === 0 ? 'prefill' : `decode ${r}` }),
        cells,
        el('b', { class: 'kvw-add', text: r === 0 ? `compute ${P}` : 'compute 1' }),
      ]));
    }
    totals.innerHTML = '';
    totals.appendChild(el('div', { class: 'with' }, [el('strong', { text: String(withCache) }), el('span', { text: 'columns computed with cache' })]));
    totals.appendChild(el('div', { class: 'without' }, [el('strong', { text: String(without) }), el('span', { text: 'columns if we recomputed everything' })]));
    nextButton.textContent = shown <= maxSteps ? 'add decode step' : 'done';
    nextButton.disabled = shown > maxSteps;
  }
  function next() { if (shown <= maxSteps) { shown += 1; render(); } }
  function reset() { shown = 1; render(); }
  const nextButton = api.button('add decode step', next);
  const mount = el('div', {}, [
    el('div', { class: 'kvw-legend' }, [
      el('span', { class: 'fresh', text: 'computed now' }),
      el('span', { class: 'reused', text: 'reused from cache' }),
    ]),
    rows,
    totals,
    el('div', { class: 'demo-controls' }, [nextButton, api.button('reset', reset, 'ghost')]),
    el('div', { class: 'demo-hint', text: 'Each decode row adds just one new column with the cache; without a cache every step would recompute the whole growing context.' }),
  ]);
  return { mount, init: render };
});

/* =====================================================================
 *  DEMO 20c - honest Qwen decoding presets + optional live inference.
 * ===================================================================== */
register('qwen-run', (api) => {
  let data = null;
  let presetId = 'greedy';
  let trace = null;
  let stepIndex = 0;
  let appended = [];
  const presetRow = el('div', { class: 'demo-controls' });
  const bars = el('div', { class: 'qrun-bars' });
  const context = el('div', { class: 'qrun-context' });
  const settings = el('div', { class: 'qrun-settings' });
  const liveOutput = el('div', { class: 'lm-gen qrun-live' });
  const pieceText = (piece) => piece.replace(/^\u00b7/, ' ').replace(/\u21b5/g, '\n');
  const highlightedPiece = (piece) => piece.replace(/^\u00b7/, '\u00a0').replace(/\u21b5/g, '\u21b5');
  const formatP = (probability) => probability >= 0.001 ? probability.toFixed(3) : probability.toExponential(1);

  function render() {
    const step = trace.steps[stepIndex];
    const preset = trace.settings;
    settings.innerHTML = '';
    settings.appendChild(el('span', { text: preset.do_sample ? `T=${preset.temperature}` : 'argmax' }));
    if (preset.do_sample) {
      settings.appendChild(el('span', { text: `top-k=${preset.top_k}` }));
      settings.appendChild(el('span', { text: `top-p=${preset.top_p}` }));
    }
    settings.appendChild(el('span', { text: preset.thinking ? 'thinking ON' : 'thinking OFF' }));
    bars.innerHTML = '';
    if (step) {
      const distribution = preset.do_sample ? step.sample_top : step.top;
      const maximum = Math.max(...distribution.map((item) => item.p), 0.001);
      distribution.slice(0, 6).forEach((item, index) => bars.appendChild(el('div', { class: 'qr-row' + (index === 0 ? ' top' : '') }, [
        el('span', { text: item.piece }),
        el('i', {}, [el('b', { style: `width:${(item.p / maximum * 100).toFixed(1)}%` })]),
        el('code', { text: formatP(item.p) }),
      ])));
      bars.appendChild(el('div', { class: 'qr-kept', text: preset.do_sample ? `${step.kept} tokens kept, then renormalized` : 'full distribution; choose argmax' }));
    } else {
      bars.appendChild(el('div', { class: 'qr-done', text: `${trace.steps.length} precomputed steps complete.` }));
    }
    context.innerHTML = '';
    const prior = `user: ${data.decode.prompt}\nassistant: ` + appended.slice(0, -1).map((item) => pieceText(item.piece)).join('');
    context.appendChild(el('span', { text: prior }));
    if (appended.length) context.appendChild(el('mark', { text: highlightedPiece(appended.at(-1).piece) }));
    nextButton.disabled = !step;
    [...presetRow.children].forEach((button) => {
      const active = button.dataset.preset === presetId;
      button.classList.toggle('primary', active);
      button.classList.toggle('ghost', !active);
    });
  }

  function setPreset(id) {
    presetId = id;
    trace = data.decode.traces[id];
    stepIndex = 0;
    appended = [];
    liveOutput.textContent = '';
    render();
  }
  function next() {
    const step = trace.steps[stepIndex];
    if (!step) return;
    appended.push(step.choice);
    stepIndex += 1;
    render();
  }
  function reset() { setPreset(presetId); }

  async function runLive() {
    liveOutput.textContent = '';
    api.setStatus('Loading optional Qwen model (several hundred MB)...');
    let lm;
    try {
      lm = await api.getChatLM();
    } catch (error) {
      api.setStatus('Live model unavailable; the audited trace above still works.', 'err');
      return;
    }
    const preset = trace.settings;
    const user = data.decode.prompt + (preset.thinking ? ' /think' : ' /no_think');
    let accumulated = '';
    try {
      await api.chatStream(
        lm,
        [{ role: 'user', content: user }],
        {
          doSample: preset.do_sample,
          T: preset.temperature,
          k: preset.top_k || 0,
          p: preset.top_p,
          max: 96,
        },
        (text) => { accumulated += text; liveOutput.textContent = accumulated; },
      );
      api.setStatus('Generated with the selected settings in your browser.', 'ok');
    } catch (error) {
      api.setStatus('Live generation failed; use the audited trace above.', 'err');
    }
  }

  const nextButton = api.button('append next token', next);
  const mount = el('div', {}, [
    presetRow,
    settings,
    el('div', { class: 'qrun-layout' }, [bars, context]),
    el('div', { class: 'demo-controls qrun-controls' }, [
      nextButton,
      api.button('reset', reset, 'ghost'),
      api.button('optional: run live', runLive, 'ghost'),
    ]),
    liveOutput,
    el('div', { class: 'demo-hint', text: 'Precomputed controls are exact. Candidate labels use \u00b7 for a leading space; thinking traces begin with <think>.' }),
  ]);

  async function load() {
    try {
      const response = await fetch('data/qwen_samples.json');
      data = await response.json();
    } catch (error) {
      const rawStep = {
        top: [{ piece: '**', p: 0.56 }, { piece: 'Sure', p: 0.21 }, { piece: 'Here', p: 0.06 }],
        sample_top: [{ piece: '**', p: 0.73 }, { piece: 'Sure', p: 0.27 }],
        tail_mass: 0.17,
        kept: 2,
        choice: { piece: '**', raw_p: 0.56, sample_p: 0.73 },
      };
      const traceFor = (settings, choice = rawStep.choice) => ({
        settings,
        steps: [{ ...rawStep, choice }],
      });
      data = { decode: {
        prompt: 'Write a creative name for a friendly blue robot.',
        traces: {
          greedy: traceFor({ label: 'greedy', thinking: false, do_sample: false, temperature: 1, top_k: 0, top_p: 1 }),
          nonthink: traceFor({ label: 'recommended non-thinking', thinking: false, do_sample: true, temperature: 0.7, top_k: 20, top_p: 0.8 }),
          thinking: traceFor(
            { label: 'recommended thinking', thinking: true, do_sample: true, temperature: 0.6, top_k: 20, top_p: 0.95 },
            { piece: '<think>', raw_p: 0.99, sample_p: 1 },
          ),
        },
      } };
      api.setStatus('Using the embedded decoding fallback.', 'err');
    }
    Object.entries(data.decode.traces).forEach(([id, item], index) => {
      const button = api.button(item.settings.label, () => setPreset(id), index === 0 ? 'primary' : 'ghost');
      button.dataset.preset = id;
      presetRow.appendChild(button);
    });
    setPreset('greedy');
  }
  return { mount, init: load };
});

/* =====================================================================
 *  Shared stepped-trace demo: append exact precomputed tokens one at a time,
 *  optionally reveal a full precomputed answer, optionally run live. (L21)
 * ===================================================================== */
function steppedTraceDemo(api, options) {
  let trace = options.fallback;
  let fullAnswer = '';
  let stepIndex = 0;
  let appended = [];
  const status = el('div', { class: 'qwen-trace-status' });
  const bars = el('div', { class: 'qwen-trace-bars' });
  const context = el('div', { class: 'qwen-trace-context' });
  const pieceText = (piece) => piece.replace(/^\u00b7/, ' ').replace(/\u21b5/g, '\n');
  const highlightedPiece = (piece) => piece.replace(/^\u00b7/, '\u00a0').replace(/\u21b5/g, '\u21b5');
  const formatP = (probability) => probability >= 0.001 ? probability.toFixed(3) : probability.toExponential(1);

  function render(showFull) {
    const step = trace.steps[stepIndex];
    bars.innerHTML = '';
    if (step) {
      const maximum = Math.max(...step.top.map((item) => item.p), 0.001);
      step.top.slice(0, 6).forEach((item, index) => bars.appendChild(el('div', { class: 'qt-row' + (index === 0 ? ' top' : '') }, [
        el('span', { text: item.piece }),
        el('i', {}, [el('b', { style: `width:${(item.p / maximum * 100).toFixed(1)}%` })]),
        el('code', { text: formatP(item.p) }),
      ])));
      bars.appendChild(el('div', { class: 'qt-tail' }, [el('span', { text: 'all other tokens' }), el('code', { text: step.tail_mass.toFixed(3) })]));
      status.textContent = `next distribution: step ${stepIndex + 1} of ${trace.steps.length}`;
    } else {
      bars.appendChild(el('div', { class: 'qt-done', text: `${trace.steps.length} real generation steps shown.` }));
      status.textContent = 'trace complete';
    }
    context.innerHTML = '';
    if (showFull && fullAnswer) {
      context.appendChild(el('span', { text: `user: ${trace.prompt}\nassistant: ${fullAnswer}` }));
    } else {
      const prior = `user: ${trace.prompt}\nassistant: ` + appended.slice(0, -1).map((item) => pieceText(item.piece)).join('');
      context.appendChild(el('span', { text: prior }));
      if (appended.length) context.appendChild(el('mark', { text: highlightedPiece(appended.at(-1).piece) }));
    }
    nextButton.disabled = !step;
  }
  function next() { const step = trace.steps[stepIndex]; if (!step) return; appended.push(step.choice); stepIndex += 1; render(false); }
  function reset() { stepIndex = 0; appended = []; render(false); }

  const nextButton = api.button(options.nextLabel || 'append next token', next);
  const controls = [nextButton, api.button('reset', reset, 'ghost')];
  if (options.fullFrom) controls.push(api.button('show full answer', () => render(true), 'ghost'));
  if (options.live) {
    controls.push(api.button('optional: run live', async () => {
      let lm;
      try { api.setStatus('Loading optional Qwen model (several hundred MB)...'); lm = await api.getChatLM(); }
      catch (err) { api.setStatus('Live model unavailable; the audited trace still works.', 'err'); return; }
      context.innerHTML = ''; const out = el('span', { text: `user: ${trace.prompt}\nassistant: ` }); context.appendChild(out);
      let acc = '';
      try {
        await api.chatStream(lm, [{ role: 'user', content: trace.prompt + (options.live.thinking ? ' /think' : ' /no_think') }],
          { doSample: true, T: options.live.T, k: options.live.k, p: options.live.p, max: options.live.max || 128 },
          (t) => { acc += t; out.textContent = `user: ${trace.prompt}\nassistant: ${acc}`; });
        api.setStatus('Generated live in your browser.', 'ok');
      } catch (err) { api.setStatus('Live generation failed; use the audited trace.', 'err'); }
    }, 'ghost'));
  }

  const mount = el('div', {}, [
    options.note ? el('div', { class: 'demo-note', text: options.note }) : el('div', {}),
    status,
    el('div', { class: 'qwen-trace-layout' }, [bars, context]),
    el('div', { class: 'demo-controls qwen-trace-controls' }, controls),
    el('div', { class: 'demo-hint', text: options.hint || 'Candidate labels use \u00b7 for a leading space. Every click reads a newly conditioned distribution.' }),
  ]);
  async function load() {
    try {
      const r = await fetch('data/qwen_samples.json');
      const data = await r.json();
      trace = options.select(data);
      if (options.fullFrom) fullAnswer = options.fullFrom(data);
    }
    catch (err) { api.setStatus('Using the embedded fallback trace.', 'err'); }
    render(false);
  }
  return { mount, init: load };
}

register('qwen-gsm8k', (api) => steppedTraceDemo(api, {
  note: 'Qwen3-0.6B \u00b7 non-thinking \u00b7 a grade-school math word problem.',
  select: (data) => data.gsm8k.trace,
  fullFrom: (data) => data.gsm8k.output.text,
  live: { thinking: false, T: 0.7, k: 20, p: 0.8, max: 384 },
  hint: 'Non-thinking mode still lays out the steps. Append tokens one at a time, or reveal the full generation ending in 72.',
  fallback: { prompt: 'Natalia sold clips\u2026', steps: [{ top: [{ piece: 'Natalia', p: 1 }], tail_mass: 0, choice: { piece: 'Natalia', p: 1 } }] },
}));

register('qwen-fail', (api) => steppedTraceDemo(api, {
  note: 'Qwen3-0.6B \u00b7 a question about the future.',
  select: (data) => data.future_trace,
  fullFrom: (data) => data.future_trace.completion,
  live: { thinking: false, T: 0.7, k: 20, p: 0.8, max: 96 },
  hint: 'The model has no post-2024 knowledge, yet it names a confident, fabricated winner. Reveal the full answer to see the invented name.',
  fallback: { prompt: 'Who won the 2031 Turing Award?', steps: [{ top: [{ piece: 'As', p: 0.5 }], tail_mass: 0.5, choice: { piece: 'As', p: 0.5 } }] },
}));

/* =====================================================================
 *  DEMO 21 - lm-attention: REAL Qwen3-0.6B attention. On an ambiguous sentence
 *  two heads send the query "it" to two different words (cup vs robot). Switch
 *  to an unambiguous control sentence to see what each head really tracks. (L21)
 * ===================================================================== */
register('lm-attention', (api) => {
  let data = null, si = 0, hi = 0, qi = null;
  const canvas = api.canvasEl(360, 284); canvas.classList.add('clickable');
  const panel = el('div', { class: 'attn-panel' });
  const sentenceRow = el('div', { class: 'demo-controls' });
  const headRow = el('div', { class: 'demo-controls' });
  const queryRow = el('div', { class: 'attention-query-row' });
  const provenance = el('div', { class: 'attention-provenance' });
  const sentences = () => data.attention.sentences;
  const sentence = () => sentences()[si];
  const toks = () => sentence().tokens;
  const head = () => sentence().heads[hi];
  const A = () => head().A;

  function layout() { const W = canvas.width, H = canvas.height, n = toks().length; const padL = 88, padT = 58; const cell = Math.min(25, (W - padL - 8) / n, (H - padT - 8) / n); return { W, H, n, padL, padT, cell }; }
  function draw() {
    const ctx = canvas.getContext('2d'); const { W, H, n, padL, padT, cell } = layout(); const M = A(), tk = toks();
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = '#374151'; ctx.textAlign = 'left';
    for (let j = 0; j < n; j++) { ctx.save(); ctx.translate(padL + j * cell + cell / 2 + 4, padT - 8); ctx.rotate(-Math.PI / 4); ctx.fillText(tk[j], 0, 0); ctx.restore(); }
    ctx.textAlign = 'right';
    for (let i = 0; i < n; i++) { ctx.fillStyle = i === qi ? '#b91c1c' : '#374151'; ctx.fillText(tk[i], padL - 6, padT + i * cell + cell / 2 + 4); }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      ctx.fillStyle = `rgba(29,78,216,${Math.pow(M[i][j], 0.7).toFixed(3)})`;
      ctx.fillRect(padL + j * cell, padT + i * cell, cell - 1, cell - 1);
    }
    if (qi != null) { ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2.5; ctx.strokeRect(padL - 1, padT + qi * cell - 1, n * cell + 1, cell + 1); }
    [...queryRow.children].forEach((button, index) => {
      button.classList.toggle('selected', index === qi);
      button.setAttribute('aria-pressed', String(index === qi));
    });
    provenance.innerHTML = `<b>layer ${head().layer}, head ${head().head}</b> \u00b7 ${head().criterion}`;
    drawPanel();
  }
  function drawPanel() {
    panel.innerHTML = ''; const tk = toks();
    if (qi == null) { panel.appendChild(el('p', { class: 'attn-hint', html: 'Click any <b>row</b> (query token) to see where it looks.' })); return; }
    panel.appendChild(el('p', { class: 'attn-q', html: `query: <b>${tk[qi]}</b> attends to&hellip;` }));
    const row = A();
    const order = tk.map((t, j) => [t, row[qi][j]]).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = order[0][1] || 1; const b = el('div', { class: 'attn-bars2' });
    order.forEach(([t, w]) => b.appendChild(el('div', { class: 'attn-row' }, [
      el('span', { class: 'attn-lab', text: t }), el('div', { class: 'attn-track' }, [el('div', { class: 'attn-fill', style: `width:${(w / max * 100).toFixed(1)}%` })]), el('span', { class: 'attn-num', text: w.toFixed(2) }),
    ])));
    panel.appendChild(b);
  }
  canvas.addEventListener('click', (e) => { const { padT, cell, n } = layout(); const r = canvas.getBoundingClientRect(); const my = (e.clientY - r.top) * canvas.height / r.height; const i = Math.floor((my - padT) / cell); if (i >= 0 && i < n) { qi = i; draw(); } });

  function buildQueryRow() {
    queryRow.innerHTML = '';
    toks().forEach((token, index) => {
      const button = el('button', { class: 'attention-query-token', type: 'button', text: token, 'aria-label': `Inspect attention for query token ${token}` });
      button.addEventListener('click', () => { qi = index; draw(); });
      queryRow.appendChild(button);
    });
  }
  function setSentence(k) {
    si = k; qi = sentence().query_default;
    [...sentenceRow.children].forEach((b, i) => { b.classList.toggle('primary', i === k); b.classList.toggle('ghost', i !== k); });
    buildQueryRow(); draw();
  }
  function setHead(k) {
    hi = k; qi = sentence().query_default;
    [...headRow.children].forEach((b, i) => { b.classList.toggle('primary', i === k); b.classList.toggle('ghost', i !== k); });
    draw();
  }
  const mount = el('div', {}, [
    sentenceRow,
    headRow,
    provenance,
    queryRow,
    el('div', { class: 'demo-stage' }, [canvas, panel]),
    el('div', { class: 'demo-hint', text: 'Two heads disagree about "it". On the control, head B still finds the object while head A drifts to the start token.' }),
  ]);
  async function load() {
    try { const r = await fetch('data/qwen_samples.json'); data = await r.json(); }
    catch (e) {
      data = { attention: { sentences: [{
        text: 'The robot picked up the cup because it was empty',
        tokens: ['The', '\u00b7robot', '\u00b7cup', '\u00b7it'],
        query_default: 3,
        heads: [
          { label: 'head A: it \u2192 cup', criterion: 'strongest it\u2192cup', layer: 12, head: 13, A: [[1, 0, 0, 0], [0.6, 0.4, 0, 0], [0.3, 0.3, 0.4, 0], [0.27, 0.1, 0.61, 0.02]] },
          { label: 'head B: it \u2192 robot', criterion: 'strongest it\u2192robot', layer: 11, head: 1, A: [[1, 0, 0, 0], [0.6, 0.4, 0, 0], [0.3, 0.3, 0.4, 0], [0.1, 0.75, 0.1, 0.05]] },
        ],
      }] } };
      api.setStatus('Using the embedded attention fallback.', 'err');
    }
    sentences().forEach((s, k) => sentenceRow.appendChild(api.button(`"${s.text.slice(0, 24)}\u2026"`, () => setSentence(k), k === 0 ? 'primary' : 'ghost')));
    sentence().heads.forEach((h, k) => headRow.appendChild(api.button(h.label, () => setHead(k), k === 0 ? 'primary' : 'ghost')));
    buildQueryRow();
    qi = sentence().query_default;
    draw();
  }
  return { mount, init: load };
});

/* =====================================================================
 *  DEMO 22 - RAG retrieval playground over REAL CS486 course facts. Preset
 *  questions use a precomputed ranking (offline); "retrieve" embeds a custom
 *  query live with MiniLM and re-ranks by cosine. (L22)
 * ===================================================================== */
register('rag', (api) => {
  let data = null;
  const qRow = el('div', { class: 'demo-controls' });
  const input = el('input', { class: 'demo-input', type: 'text', value: 'When is Assignment 3 due?' });
  const chunksBox = el('div', { class: 'rag-chunks' });
  const promptBox = el('div', { class: 'rag-prompt' });
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  input.addEventListener('keydown', (e) => e.stopPropagation());

  function embeddedFallback(question) {
    const examFirst = /\b(exam|room|where|PAC)\b/i.test(question);
    const assignment = data.chunks.find((c) => /Assignment 3 is .*due/i.test(c.text)) || data.chunks[0];
    const exam = data.chunks.find((c) => /final exam is on/i.test(c.text)) || data.chunks[1] || data.chunks[0];
    const first = examFirst ? exam : assignment;
    const second = examFirst ? assignment : exam;
    return [{ i: first.id, score: 1 }, { i: second.id, score: 0.35 }];
  }

  function show(question, ranking) {
    chunksBox.innerHTML = '';
    const max = ranking[0].score || 1;
    ranking.slice(0, 2).forEach((r, idx) => {
      const c = data.chunks[r.i];
      chunksBox.appendChild(el('div', { class: 'rag-row' + (idx === 0 ? ' top' : '') }, [
        el('span', { class: 'rag-src', text: c.source }),
        el('div', { class: 'rag-txt' }, [el('div', { class: 'rag-tt', text: c.text }), el('div', { class: 'rag-bar' }, [el('div', { class: 'rag-fill', style: `width:${(r.score / max * 100).toFixed(0)}%` })])]),
        el('span', { class: 'rag-score', text: r.score.toFixed(2) }),
      ]));
    });
    const top = data.chunks[ranking[0].i];
    promptBox.innerHTML = '';
    promptBox.appendChild(el('div', { class: 'rp-line sys', text: 'System: use only the context and cite the source.' }));
    promptBox.appendChild(el('div', { class: 'rp-line ctx', html: 'Context: ' + esc(top.text) }));
    promptBox.appendChild(el('div', { class: 'rp-line q', html: 'Question: ' + esc(question) }));
  }
  async function retrieve() {
    const q = input.value.trim(); if (!q) return;
    if (data.fallback) {
      show(q, embeddedFallback(q));
      api.setStatus('Using the embedded two-document fallback.', 'err');
      return;
    }
    api.setStatus('Embedding query with MiniLM...');
    let ex;
    try {
      ex = await Promise.race([
        api.getEmbedder(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('embedding model timeout')), 15000)),
      ]);
    } catch (e) {
      show(q, embeddedFallback(q));
      api.setStatus('MiniLM unavailable; used the embedded course-fact fallback.', 'err');
      return;
    }
    const [qv] = await api.embedTexts(ex, [q]);
    const ranking = data.chunks.map((c) => ({ i: c.id, score: api.cosine(qv, c.vec) })).sort((a, b) => b.score - a.score).slice(0, 2);
    [...qRow.children].forEach((b) => { b.classList.remove('primary'); b.classList.add('ghost'); });
    show(q, ranking); api.setStatus('Retrieved with live MiniLM embeddings.', 'ok');
  }
  const mount = el('div', {}, [
    qRow,
    el('div', { class: 'demo-controls' }, [input, api.button('retrieve', retrieve)]),
    el('div', { class: 'demo-stage' }, [el('div', { class: 'rag-left' }, [chunksBox]), el('div', { class: 'rag-right' }, [promptBox])]),
  ]);
  function setQ(k) { const q = data.questions[k]; input.value = q.q; [...qRow.children].forEach((b, i) => { b.classList.toggle('primary', i === k); b.classList.toggle('ghost', i !== k); }); show(q.q, q.ranking); }
  async function load() {
    try { const r = await fetch('data/rag_chunks.json?v=2'); data = await r.json(); }
    catch (e) {
      data = {
        fallback: true,
        chunks: [
          { id: 0, source: 'assignments', text: 'Assignment 3 is due Tuesday, August 4, 2026 at 11:59 PM.' },
          { id: 1, source: 'schedule', text: 'The final exam is Saturday, August 8, 2026, 7:30–10:00 PM in PAC 5.' },
        ],
        questions: [
          { q: 'When is Assignment 3 due?', ranking: [{ i: 0, score: 1 }, { i: 1, score: 0.35 }] },
          { q: 'When and where is the final exam?', ranking: [{ i: 1, score: 1 }, { i: 0, score: 0.35 }] },
        ],
      };
      api.setStatus('Using the embedded course-fact fallback.', 'err');
    }
    data.questions.forEach((q, k) => qRow.appendChild(api.button('"' + q.q + '"', () => setQ(k), k === 0 ? 'primary' : 'ghost')));
    setQ(0);
  }
  return { mount, init: load };
});

/* =====================================================================
 *  DEMO 23 - LoRA low-rank update: W' = W0 + BA. Rank slider shows the
 *  update matrix and the trainable-parameter savings. (L22, pure JS)
 * ===================================================================== */
register('lora-rank', (api) => {
  const D = 24;
  const rCtl = api.slider('rank r', { min: 1, max: 24, step: 1, value: 4, fmt: (v) => v });
  const c0 = api.canvasEl(150, 150), cd = api.canvasEl(150, 150), cw = api.canvasEl(150, 150);
  const readout = el('div', { class: 'demo-readout' });
  const rnd = api.rng32(7);
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const W0 = Array.from({ length: D }, () => Array.from({ length: D }, gauss));
  const Bfull = Array.from({ length: D }, () => Array.from({ length: 24 }, gauss));
  const Afull = Array.from({ length: 24 }, () => Array.from({ length: D }, gauss));

  function drawMat(canvas, M, scale) {
    const ctx = canvas.getContext('2d'), cell = canvas.width / D;
    for (let i = 0; i < D; i++) for (let j = 0; j < D; j++) {
      let t = Math.max(-1, Math.min(1, M[i][j] / (scale || 1)));
      const c = t >= 0 ? `rgb(255,${Math.round(255 - t * 160)},${Math.round(255 - t * 190)})` : `rgb(${Math.round(255 + t * 190)},${Math.round(255 + t * 160)},255)`;
      ctx.fillStyle = c; ctx.fillRect(j * cell, i * cell, cell + 0.5, cell + 0.5);
    }
  }
  const maxAbs = (M) => { let m = 0; for (const row of M) for (const x of row) m = Math.max(m, Math.abs(x)); return m || 1; };
  function draw() {
    const r = rCtl.get();
    const dW = Array.from({ length: D }, (_, i) => Array.from({ length: D }, (_, j) => {
      let s = 0; for (let k = 0; k < r; k++) s += Bfull[i][k] * Afull[k][j]; return s / Math.sqrt(r) * 0.6;
    }));
    const Wp = W0.map((row, i) => row.map((x, j) => x + dW[i][j]));
    drawMat(c0, W0, maxAbs(W0)); drawMat(cd, dW, maxAbs(dW)); drawMat(cw, Wp, maxAbs(Wp));
    const train = 2 * D * r, full = D * D;
    const ratio = train / full;
    readout.innerHTML = '';
    readout.appendChild(el('span', { html: `trainable: <b>${train}</b> vs full <b>${full}</b> (rank r=${r}, d=${D})` }));
    const comparison = ratio < 1
      ? `<b>${((1 - ratio) * 100).toFixed(0)}% fewer</b> trainable parameters`
      : ratio === 1
        ? '<b>no parameter saving</b> at this rank'
        : `<b>${ratio.toFixed(1)}\u00d7 as many</b> trainable parameters as the full matrix`;
    readout.appendChild(el('span', { html: comparison }));
  }
  rCtl.input.addEventListener('input', draw);
  const panel = (cap, cv) => el('div', { class: 'lora-panel' }, [el('div', { class: 'lora-cap', html: cap }), cv]);
  const mount = el('div', {}, [
    el('div', { class: 'demo-note', html: 'Freeze \\(W_0\\); train \\(\\Delta W=BA\\). For this square matrix, LoRA saves parameters only while \\(r&lt;d/2\\).' }),
    el('div', { class: 'demo-controls' }, [rCtl.field]),
    el('div', { class: 'demo-stage' }, [panel('W\u2080 (frozen)', c0), panel('\u0394W = BA', cd), panel("W' = W\u2080+\u0394W", cw)]),
    readout,
  ]);
  return { mount, init: draw };
});

/* =====================================================================
 *  DEMO 24 - tool-use loop: the model can't reliably do arithmetic, so it
 *  calls a calculator tool that really computes the answer. (L22, JS)
 * ===================================================================== */
register('tool-loop', (api) => {
  const expr = '0.20*82 + 0.30*74 + 0.50*91';
  const result = 0.20 * 82 + 0.30 * 74 + 0.50 * 91;  // computed live by the "tool"
  const steps = [
    { role: 'user', text: 'What is my weighted grade? Scores: 82 (20%), 74 (30%), 91 (50%).' },
    { role: 'model', text: 'This needs exact arithmetic, so I will call a tool instead of guessing.' },
    { role: 'call', text: 'calc("' + expr + '")' },
    { role: 'tool', text: '= ' + result.toFixed(1) },
    { role: 'model', text: 'Your weighted grade is ' + result.toFixed(1) + '%.' },
  ];
  const LABEL = { user: 'user', model: 'model', call: 'tool call', tool: 'tool', };
  let shown = 1;
  const box = el('div', { class: 'tool-loop' });
  function render() {
    box.innerHTML = '';
    for (let i = 0; i < shown; i++) {
      const s = steps[i];
      box.appendChild(el('div', { class: 'tl-row ' + s.role }, [el('span', { class: 'tl-role', text: LABEL[s.role] }), el('span', { class: 'tl-text', text: s.text })]));
    }
  }
  const step = api.button('step', () => { if (shown < steps.length) { shown++; render(); } });
  const reset = api.button('reset', () => { shown = 1; render(); }, 'ghost');
  const mount = el('div', {}, [
    el('div', { class: 'demo-note', html: 'The model proposes an action; the environment (a calculator) returns real evidence; the model uses it.' }),
    el('div', { class: 'demo-controls' }, [step, reset]),
    box,
  ]);
  return { mount, init: render };
});

/* =====================================================================
 *  DEMO 25 - VLM trace: real Qwen3-VL-2B answers on real images across
 *  caption / VQA / OCR / chart tasks (precomputed). (L23)
 * ===================================================================== */
register('vlm-trace', (api) => {
  let data = null;
  const taskRow = el('div', { class: 'demo-controls' });
  const img = el('img', { class: 'vlm-img', alt: '' });
  const promptEl = el('div', { class: 'vlm-prompt' });
  const answerEl = el('div', { class: 'vlm-answer' });
  const LBL = { caption: 'caption', vqa: 'visual Q&A', ocr: 'read text (OCR)', chart: 'chart' };
  function show(k) {
    const t = data.tasks[k];
    img.src = 'images/' + t.image;
    promptEl.textContent = 'Q: ' + t.prompt;
    answerEl.textContent = 'A: ' + t.answer;
    [...taskRow.children].forEach((b, i) => { b.classList.toggle('primary', i === k); b.classList.toggle('ghost', i !== k); });
  }
  const mount = el('div', {}, [
    el('div', { class: 'demo-note', html: 'Real answers from <b>Qwen3-VL-2B</b> on real images (precomputed).' }),
    taskRow,
    el('div', { class: 'demo-stage' }, [el('div', { class: 'vlm-left' }, [img]), el('div', { class: 'vlm-right' }, [promptEl, answerEl])]),
  ]);
  async function load() {
    try { const r = await fetch('data/vlm_samples.json'); data = await r.json(); }
    catch (e) { api.setStatus('Could not load VLM traces.', 'err'); return; }
    data.tasks.forEach((t, k) => taskRow.appendChild(api.button(LBL[t.task] || t.task, () => show(k), k === 0 ? 'primary' : 'ghost')));
    show(0);
  }
  return { mount, init: load };
});

/* =====================================================================
 *  DEMO 26 - CLIP zero-shot image-text alignment. Preset label scores are
 *  precomputed; "score my label" runs real CLIP live on the image. (L23)
 * ===================================================================== */
register('clip-match', (api) => {
  let data = null, ii = 0;
  const imgRow = el('div', { class: 'demo-controls' });
  const img = el('img', { class: 'vlm-img', alt: '' });
  const bars = el('div', { class: 'attn-bars2' });
  const custom = el('input', { class: 'demo-input', type: 'text', value: 'a photo of Alan Turing' });
  custom.addEventListener('keydown', (e) => e.stopPropagation());
  function renderBars(labels, probs) {
    bars.innerHTML = '';
    const order = labels.map((l, j) => [l, probs[j]]).sort((a, b) => b[1] - a[1]);
    const max = order[0][1] || 1;
    order.forEach(([l, p], idx) => bars.appendChild(el('div', { class: 'attn-row' + (idx === 0 ? ' top' : '') }, [
      el('span', { class: 'clip-lab', text: l }),
      el('div', { class: 'attn-track' }, [el('div', { class: 'attn-fill', style: `width:${(p / max * 100).toFixed(0)}%` })]),
      el('span', { class: 'attn-num', text: p.toFixed(2) }),
    ])));
  }
  function show(k) {
    ii = k; img.src = 'images/' + data.images[k].file;
    renderBars(data.clip.labels, data.clip.scores[k].probs);
    [...imgRow.children].forEach((b, i) => { b.classList.toggle('primary', i === k); b.classList.toggle('ghost', i !== k); });
  }
  async function runCustom() {
    const lab = custom.value.trim(); if (!lab) return;
    let clf; try { clf = await api.getClip(); } catch (e) { api.setStatus('CLIP unavailable; showing preset labels.', 'err'); return; }
    api.setStatus('Scoring with CLIP...');
    const labels = data.clip.labels.concat([lab]);
    try {
      const out = await clf('images/' + data.images[ii].file, labels);
      const probs = labels.map((l) => { const o = out.find((x) => x.label === l); return o ? o.score : 0; });
      renderBars(labels, probs); api.setStatus('Zero-shot scored live with CLIP.', 'ok');
    } catch (e) { api.setStatus('CLIP scoring failed; showing presets.', 'err'); }
  }
  const mount = el('div', {}, [
    el('div', { class: 'demo-note', html: 'CLIP scores how well each caption matches the image, with no task-specific training (zero-shot).' }),
    imgRow,
    el('div', { class: 'demo-stage' }, [el('div', { class: 'vlm-left' }, [img]), el('div', { class: 'vlm-right' }, [bars, el('div', { class: 'demo-controls' }, [custom, api.button('score my label', runCustom)])])]),
  ]);
  async function load() {
    try { const r = await fetch('data/vlm_samples.json'); data = await r.json(); }
    catch (e) { api.setStatus('Could not load CLIP data.', 'err'); return; }
    data.images.forEach((im, k) => imgRow.appendChild(api.button(im.file.split('.')[0], () => show(k), k === 0 ? 'primary' : 'ghost')));
    show(0);
  }
  return { mount, init: load };
});

/* =====================================================================
 *  DEMO 27 - patchify: split a real image into a grid of patches; each
 *  patch is one visual token. (L23, pure JS)
 * ===================================================================== */
register('patchify', (api) => {
  const canvas = api.canvasEl(340, 340);
  const gCtl = api.slider('grid', { min: 2, max: 16, step: 1, value: 8, fmt: (v) => v + '\u00d7' + v });
  const readout = el('div', { class: 'demo-readout' });
  let loaded = false; const im = new Image();
  im.onload = () => { loaded = true; draw(); };
  im.src = 'images/portrait.jpg';
  function draw() {
    const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height, n = gCtl.get();
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#f1f5f9'; ctx.fillRect(0, 0, W, H);
    if (loaded) { const s = Math.max(W / im.width, H / im.height), dw = im.width * s, dh = im.height * s; ctx.drawImage(im, (W - dw) / 2, (H - dh) / 2, dw, dh); }
    ctx.strokeStyle = 'rgba(29,78,216,0.85)'; ctx.lineWidth = 1; const cell = W / n;
    for (let i = 1; i < n; i++) { ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, H); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(W, i * cell); ctx.stroke(); }
    ctx.strokeStyle = '#1d4ed8'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, W - 2, H - 2);
    readout.innerHTML = '';
    readout.appendChild(el('span', { html: `${n} \u00d7 ${n} = <b>${n * n}</b> patches` }));
    readout.appendChild(el('span', { html: 'each patch \u2192 one <b>visual token</b>' }));
  }
  gCtl.input.addEventListener('input', draw);
  const mount = el('div', {}, [
    el('div', { class: 'demo-note', html: 'A vision transformer splits the image into patches; each patch becomes a visual token fed to the model.' }),
    el('div', { class: 'demo-controls' }, [gCtl.field]),
    el('div', { class: 'demo-stage' }, [canvas, readout]),
  ]);
  return { mount, init: draw };
});

/* =====================================================================
 *  DEMO 28 - forward noising: drag the noise level and watch a real image
 *  turn into noise, x_t = sqrt(a_bar) x0 + sqrt(1-a_bar) eps. (L24, JS)
 * ===================================================================== */
register('noise-forward', (api) => {
  const canvas = api.canvasEl(300, 300);
  const tCtl = api.slider('noise level t', { min: 0, max: 1, step: 0.05, value: 0.3, fmt: (v) => v.toFixed(2) });
  const readout = el('div', { class: 'demo-readout' });
  let base = null; const im = new Image();
  im.onload = () => {
    const off = document.createElement('canvas'); off.width = canvas.width; off.height = canvas.height;
    const s = Math.max(canvas.width / im.width, canvas.height / im.height), dw = im.width * s, dh = im.height * s;
    const octx = off.getContext('2d'); octx.drawImage(im, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
    base = octx.getImageData(0, 0, canvas.width, canvas.height); draw();
  };
  im.src = 'images/traj_24.png';
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  function draw() {
    const ctx = canvas.getContext('2d');
    if (!base) { ctx.fillStyle = '#f1f5f9'; ctx.fillRect(0, 0, canvas.width, canvas.height); return; }
    const t = tCtl.get(), ab = 1 - t, a = Math.sqrt(ab), b = Math.sqrt(1 - ab);
    const out = ctx.createImageData(base.width, base.height), d = base.data, o = out.data;
    for (let i = 0; i < d.length; i += 4) { for (let c = 0; c < 3; c++) { const n = gauss() * 60 + 128; o[i + c] = Math.max(0, Math.min(255, a * d[i + c] + b * n)); } o[i + 3] = 255; }
    ctx.putImageData(out, 0, 0);
    readout.innerHTML = '';
    readout.appendChild(el('span', { html: 'x\u209c = \u221a\u0101\u00b7x\u2080 + \u221a(1\u2212\u0101)\u00b7\u03b5' }));
    readout.appendChild(el('span', { text: t < 0.1 ? 'almost the clean image' : t > 0.9 ? 'almost pure noise' : 'partially noised' }));
  }
  tCtl.input.addEventListener('input', draw);
  const mount = el('div', {}, [
    el('div', { class: 'demo-note', html: 'The forward process mixes a clean image with Gaussian noise; at \\(t\\!\\to\\!1\\) only noise remains.' }),
    el('div', { class: 'demo-controls' }, [tCtl.field]),
    el('div', { class: 'demo-stage' }, [canvas, readout]),
  ]);
  return { mount, init: draw };
});

/* ---- shared helper: an image-sequence player (used by denoise/neuralos). */
function makePlayer(api, { note, caption, srcFor, count, labelFor, playMs = 700 }) {
  const img = el('img', { class: 'vlm-img', alt: '' });
  const cap = el('div', { class: 'demo-readout' });
  const ctl = api.slider('step', { min: 0, max: count - 1, step: 1, value: 0, fmt: (v) => v });
  let timer = null;
  function show(k) { img.src = srcFor(k); cap.innerHTML = ''; cap.appendChild(el('span', { html: labelFor(k) })); }
  ctl.input.addEventListener('input', () => show(ctl.get()));
  function play() {
    if (timer) { clearInterval(timer); timer = null; playBtn.textContent = 'play'; return; }
    playBtn.textContent = 'stop';
    timer = setInterval(() => {
      let k = ctl.get() + 1; if (k >= count) k = 0;
      ctl.input.value = k; ctl.setText(String(k)); show(k);
    }, playMs);
  }
  const playBtn = api.button('play', play);
  const mount = el('div', {}, [
    note ? el('div', { class: 'demo-note', html: note }) : null,
    el('div', { class: 'demo-controls' }, [playBtn, ctl.field]),
    el('div', { class: 'demo-stage' }, [el('div', {}, [img]), cap]),
  ]);
  return { mount, init: () => show(0), onLeave: () => { if (timer) { clearInterval(timer); timer = null; playBtn.textContent = 'play'; } } };
}

/* =====================================================================
 *  DEMO 29 - reverse denoising trajectory (real, precomputed). (L24)
 * ===================================================================== */
register('denoise', (api) => {
  let data = null, inst = null;
  const holder = el('div', {});
  async function load() {
    try { const r = await fetch('data/diffusion_samples.json'); data = await r.json(); }
    catch (e) { api.setStatus('Could not load the trajectory.', 'err'); return; }
    const frames = data.trajectory.frames, total = data.trajectory.steps;
    inst = makePlayer(api, {
      note: 'A real Stable Diffusion run: from pure noise, the denoiser cleans the latent step by step (then it is decoded to pixels).',
      srcFor: (k) => 'images/' + frames[k].file,
      count: frames.length,
      labelFor: (k) => `denoising step <b>${frames[k].step + 1}</b> of ${total}`,
    });
    holder.appendChild(inst.mount); inst.init();
  }
  return { mount: holder, init: load, onLeave: () => inst && inst.onLeave && inst.onLeave() };
});

/* =====================================================================
 *  DEMO 30 - guidance sweep (real, precomputed CFG scales). (L24)
 * ===================================================================== */
register('guidance', (api) => {
  let data = null;
  const img = el('img', { class: 'vlm-img', alt: '' });
  const cap = el('div', { class: 'demo-readout' });
  const ctl = api.slider('guidance scale', { min: 0, max: 3, step: 1, value: 2, fmt: (v) => v });
  function show(k) { const g = data.guidance[k]; img.src = 'images/' + g.file; cap.innerHTML = ''; cap.appendChild(el('span', { html: `guidance scale = <b>${g.scale}</b>` })); cap.appendChild(el('span', { text: g.scale <= 1.5 ? 'weak: diverse, may ignore the prompt' : g.scale >= 12 ? 'strong: faithful, can look over-saturated' : 'balanced' })); }
  ctl.input.addEventListener('input', () => show(ctl.get()));
  const mount = el('div', {}, [
    el('div', { class: 'demo-note', html: 'Same prompt and seed, different classifier-free guidance scale.' }),
    el('div', { class: 'demo-controls' }, [ctl.field]),
    el('div', { class: 'demo-stage' }, [el('div', {}, [img]), cap]),
  ]);
  async function load() { try { const r = await fetch('data/diffusion_samples.json'); data = await r.json(); ctl.input.max = data.guidance.length - 1; show(2); } catch (e) { api.setStatus('Could not load guidance images.', 'err'); } }
  return { mount, init: load };
});

/* =====================================================================
 *  DEMO 31 - NeuralOS next-frame world model (real frames, precomputed). (L24)
 * ===================================================================== */
register('neuralos', (api) => {
  let data = null, inst = null;
  const holder = el('div', {});
  const link = el('a', { class: 'wv-link', href: 'https://neural-os.com', target: '_blank', rel: 'noopener' }, 'Try it live at neural-os.com \u2197');
  async function load() {
    try { const r = await fetch('data/diffusion_samples.json'); data = await r.json(); }
    catch (e) { api.setStatus('Could not load NeuralOS frames.', 'err'); return; }
    const frames = data.neuralos;
    inst = makePlayer(api, {
      note: 'A real <b>NeuralOS</b> rollout: each screen is generated from the previous frames and the user\u2019s input &mdash; a UI as a learned world model.',
      srcFor: (k) => 'images/' + frames[k],
      count: frames.length,
      labelFor: (k) => `predicted frame <b>${k + 1}</b> of ${frames.length}`,
    });
    holder.appendChild(inst.mount);
    holder.appendChild(el('div', { class: 'demo-controls' }, [link]));
    inst.init();
  }
  return { mount: holder, init: load, onLeave: () => inst && inst.onLeave && inst.onLeave() };
});

/* =====================================================================
 *  DEMO 32 - compile + run an independent PAW fuzzy function. (L22)
 *  Uses the documented hosted API directly: default compiler, remote infer.
 * ===================================================================== */
register('paw-compile', (api) => {
  const API = 'https://programasweights.com/api/v1';
  const DEFAULT_SPEC = `Classify whether a message needs immediate attention or can wait. Return ONLY one of: immediate, wait.

Input: Thesis defense moved to 3pm; I need your signature today.
Output: immediate

Input: Newsletter with events for next month.
Output: wait

Input: Production is down for every customer.
Output: immediate`;

  let programId = null;
  let compiledSpec = '';
  let compiling = false;
  let inferring = false;

  const stageDescribe = el('span', { class: 'paw-stage active', text: '1 describe' });
  const stageCompile = el('span', { class: 'paw-stage', text: '2 compile' });
  const stageRun = el('span', { class: 'paw-stage', text: '3 run' });
  const stages = el('div', { class: 'paw-stages', role: 'list', 'aria-label': 'PAW demo stages' }, [
    stageDescribe, el('span', { class: 'paw-stage-arrow', text: '\u2192' }),
    stageCompile, el('span', { class: 'paw-stage-arrow', text: '\u2192' }), stageRun,
  ]);

  const spec = el('textarea', {
    class: 'demo-editor demo-textbox paw-spec',
    rows: '10',
    maxlength: '8000',
    'aria-label': 'Natural-language fuzzy function specification',
    spellcheck: 'false',
  });
  spec.value = DEFAULT_SPEC;

  const input = el('textarea', {
    class: 'demo-editor demo-textbox paw-input',
    rows: '3',
    maxlength: '8000',
    'aria-label': 'Input to run through the compiled function',
    placeholder: 'Type a message...',
  });
  input.value = 'Please review this whenever you have time next week.';

  const idValue = el('code', { class: 'paw-program-id', text: 'not compiled yet' });
  const meta = el('div', { class: 'paw-program-meta' }, [
    el('span', { text: 'program ID ' }), idValue,
  ]);
  const output = el('div', {
    class: 'paw-run-history',
    role: 'log',
    'aria-live': 'polite',
    'aria-label': 'PAW inference results',
  }, [el('div', { class: 'paw-empty', text: 'Compile the spec, then run more than one input.' })]);

  function setStage(which) {
    stageDescribe.classList.toggle('active', which === 'describe');
    stageCompile.classList.toggle('active', which === 'compile');
    stageRun.classList.toggle('active', which === 'run');
    stageDescribe.classList.toggle('done', which !== 'describe');
    stageCompile.classList.toggle('done', which === 'run');
  }

  function errorMessage(data, fallback) {
    if (!data) return fallback;
    if (typeof data.message === 'string') return data.message;
    if (typeof data.detail === 'string') return data.detail;
    if (data.detail && typeof data.detail.message === 'string') return data.detail.message;
    return fallback;
  }

  async function post(path, body) {
    const response = await fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const retry = response.headers.get('Retry-After');
      const suffix = retry ? ` Retry after ${retry}s.` : '';
      const err = new Error(errorMessage(data, `Request failed (${response.status}).`) + suffix);
      err.status = response.status;
      throw err;
    }
    return data || {};
  }

  function setCompileBusy(on) {
    compiling = on;
    compileBtn.disabled = on || inferring;
    newBtn.disabled = on || inferring;
    compileBtn.setAttribute('aria-busy', on ? 'true' : 'false');
  }

  function setInferBusy(on) {
    inferring = on;
    runBtn.disabled = on || compiling || !programId;
    compileBtn.disabled = on || compiling;
    newBtn.disabled = on || compiling;
    runBtn.setAttribute('aria-busy', on ? 'true' : 'false');
  }

  function invalidateProgram(showStatus = true) {
    programId = null;
    compiledSpec = '';
    idValue.textContent = 'not compiled yet';
    runBtn.disabled = true;
    setStage('describe');
    if (showStatus) api.setStatus('Specification changed. Compile it to create a new program.');
  }

  async function compile() {
    const source = spec.value.trim();
    if (source.length < 10) {
      api.setStatus('Write at least 10 characters before compiling.', 'err');
      spec.focus();
      return;
    }
    setCompileBusy(true);
    setStage('compile');
    api.setStatus('Compiling with the hosted default Standard compiler...');
    const t0 = performance.now();
    try {
      // Intentionally only {spec}: no explicit compiler, key, credentials,
      // shared slug, or undocumented request field.
      const data = await post('/compile', { spec: source });
      if (!data.program_id) throw new Error('Compile finished without a program ID. Please retry.');
      programId = data.program_id;
      compiledSpec = source;
      idValue.textContent = programId;
      const ms = data.timings && Number.isFinite(data.timings.total_ms)
        ? data.timings.total_ms : performance.now() - t0;
      setStage('run');
      runBtn.disabled = false;
      api.setStatus(`Compiled your program in ${(ms / 1000).toFixed(1)}s. Try two different inputs.`, 'ok');
      input.focus();
    } catch (e) {
      invalidateProgram(false);
      api.setStatus('Compile error: ' + (e && e.message ? e.message : String(e)), 'err');
    } finally {
      setCompileBusy(false);
      runBtn.disabled = inferring || !programId;
    }
  }

  function addResult(text, answer, latency) {
    const empty = output.querySelector('.paw-empty');
    if (empty) empty.remove();
    const row = el('div', { class: 'paw-result-row' }, [
      el('div', { class: 'paw-result-input', text }),
      el('div', { class: 'paw-result-arrow', text: '\u2192' }),
      el('div', { class: 'paw-result-output', text: answer }),
      el('div', { class: 'paw-result-latency', text: `${Math.round(latency)} ms` }),
    ]);
    output.prepend(row);
    while (output.children.length > 4) output.lastElementChild.remove();
  }

  async function run() {
    const text = input.value.trim();
    if (!programId || compiledSpec !== spec.value.trim()) {
      invalidateProgram(false);
      api.setStatus('Compile this specification before running it.', 'err');
      return;
    }
    if (!text) {
      api.setStatus('Enter an input for the compiled function.', 'err');
      input.focus();
      return;
    }
    setInferBusy(true);
    api.setStatus('Running hosted inference with your program ID...');
    const t0 = performance.now();
    try {
      const data = await post('/infer', {
        program_id: programId,
        input: text,
        max_tokens: 64,
        temperature: 0,
      });
      const latency = Number.isFinite(data.latency_ms) ? data.latency_ms : performance.now() - t0;
      addResult(text, String(data.output ?? ''), latency);
      api.setStatus('Done. Change only the input and run the same program again.', 'ok');
      input.select();
    } catch (e) {
      api.setStatus('Inference error: ' + (e && e.message ? e.message : String(e)), 'err');
    } finally {
      setInferBusy(false);
    }
  }

  function newFunction() {
    invalidateProgram(false);
    output.innerHTML = '';
    output.appendChild(el('div', { class: 'paw-empty', text: 'Edit the spec, compile it, then test multiple inputs.' }));
    api.setStatus('Ready for a new task.');
    spec.focus();
  }

  const compileBtn = api.button('Compile adapter', compile);
  compileBtn.setAttribute('aria-label', 'Compile this task specification into an adapter');
  const newBtn = api.button('New task', newFunction, 'ghost');
  const runBtn = api.button('Run this input', run);
  runBtn.disabled = true;
  runBtn.setAttribute('aria-label', 'Run hosted inference with this input');

  const presets = [
    'Thesis defense moved to 3pm; I need your signature today.',
    'Newsletter with events for next month.',
    'The checkout page is down for every customer.',
  ].map((text, i) => api.button(`Example ${i + 1}`, () => {
    input.value = text;
    input.focus();
  }, 'ghost'));

  spec.addEventListener('input', () => {
    if (programId && spec.value.trim() !== compiledSpec) invalidateProgram();
  });

  const specPanel = el('div', { class: 'paw-demo-panel' }, [
    el('label', { class: 'paw-demo-label', text: 'Describe the function' }),
    spec,
    el('div', { class: 'demo-controls' }, [compileBtn, newBtn]),
    meta,
  ]);
  const runPanel = el('div', { class: 'paw-demo-panel' }, [
    el('label', { class: 'paw-demo-label', text: 'Run your compiled function' }),
    el('div', { class: 'paw-presets' }, presets),
    input,
    el('div', { class: 'demo-controls' }, [runBtn]),
    output,
  ]);
  const note = el('div', {
    class: 'paw-privacy-note',
    text: 'Class demo: hosted compile + hosted inference for zero setup. Do not submit private or sensitive text. The resulting program can also be downloaded and run locally.',
  });
  const mount = el('div', { class: 'paw-compile-demo' }, [
    stages,
    el('div', { class: 'demo-split paw-demo-split' }, [specPanel, runPanel]),
    note,
  ]);

  function init() {
    api.status.setAttribute('aria-live', 'polite');
    api.status.setAttribute('role', 'status');
    setStage('describe');
    api.setStatus('Edit the task or examples, then compile an adapter.');
  }

  return { mount, init };
});

/* --------------------------------------------------------------- boot ----- */
wireReveal();
