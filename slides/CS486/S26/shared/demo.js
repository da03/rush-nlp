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
 *  DEMO 12 - real Qwen3-0.6B causal attention. Pick a sentence + measured
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
  const vocab = ['dog', 'bites', 'man', '[query]'];
  const r = api.rng32(11);
  const content = {}; vocab.forEach((w) => { content[w] = Array.from({ length: dim }, () => r() * 2 - 1); });
  const u = Array.from({ length: dim }, () => r() * 2 - 1);  // a shared "position" direction
  const prefixes = [['dog', 'bites', 'man'], ['man', 'bites', 'dog']];
  const queryWord = '[query]';
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
    prefixes.forEach((order, si) => {
      const w = rows[si].w;
      const grp = el('div', { class: 'permute-grp' });
      grp.appendChild(el('p', { class: 'attn-q', html: `&ldquo;${order.join(' ')} <b>[query]</b>&rdquo;<br>fixed final query attends to:` }));
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
    const byWord = (o, w) => Object.fromEntries(o.map((t, j) => [t, w[j]]));
    const a = byWord(prefixes[0], rows[0].w), b = byWord(prefixes[1], rows[1].w);
    const same = prefixes[0].every((t) => Math.abs(a[t] - b[t]) < 1e-3);
    box.appendChild(el('p', { class: 'permute-verdict ' + (same ? 'same' : 'diff') , html: same
      ? 'Same by word &mdash; in layer 1, content-only matching ignores how the same previous vectors were ordered.'
      : 'Different &mdash; position information changes the source keys, so the same words receive different weights.' }));
  }
  const toggle = api.button('add positions: OFF', () => { usePos = !usePos; toggle.textContent = 'add positions: ' + (usePos ? 'ON' : 'OFF'); toggle.classList.toggle('primary', usePos); toggle.classList.toggle('ghost', !usePos); render(); }, 'ghost');
  const mount = el('div', {}, [
    el('div', { class: 'demo-note', html: 'Same previous words, same final query, same causal source set. Only the order changes.' }),
    el('div', { class: 'demo-controls' }, [toggle]),
    box,
    el('div', { class: 'demo-hint', html: '<b>Deeper-layer caveat:</b> previous hidden states were built from different causal prefixes, so later keys/values may already differ even without an explicit position embedding.' }),
  ]);
  return { mount, init: render };
});

/* =====================================================================
 *  DEMO 16 - tokenizer playground: text -> subword tokens + IDs. Presets
 *  render instantly from precomputed data; "tokenize" runs the real
 *  tokenizer (tiny download) on your own text. (L20)
 * ===================================================================== */
register('tokenizer', (api) => {
  let samples = null;
  const input = el('input', { class: 'demo-input', type: 'text', value: 'The robot picked up the cup.' });
  const presetRow = el('div', { class: 'demo-controls' });
  const chips = el('div', { class: 'tokchips' });
  const info = el('div', { class: 'demo-readout' });
  input.addEventListener('keydown', (e) => e.stopPropagation());

  function renderPieces(text, pieces) {
    chips.innerHTML = '';
    pieces.forEach((p, i) => chips.appendChild(el('div', { class: 'tokchip c' + (i % 5) }, [
      el('span', { class: 'tp', text: p.piece }), el('span', { class: 'ti', text: p.id }),
    ])));
    info.innerHTML = '';
    info.appendChild(el('span', { html: `<b>${text.length}</b> characters` }));
    info.appendChild(el('span', { html: `<b>${pieces.length}</b> tokens` }));
  }

  async function tokenizeLive() {
    try {
      const tok = await api.getTokenizer();
      const text = input.value;
      const ids = tok.encode(text);
      const pieces = ids.map((id) => { let s = tok.decode([id]); return { piece: s.startsWith(' ') ? '\u00b7' + s.slice(1) : s, id }; });
      renderPieces(text, pieces);
      api.setStatus('Tokenized with the real model tokenizer.', 'ok');
    } catch (e) { api.setStatus('Could not load the tokenizer; showing preset examples.', 'err'); }
  }

  const mount = el('div', {}, [
    el('div', { class: 'demo-note', html: 'A tokenizer splits text into <b>subword</b> pieces, each with an integer id. The dot (\u00b7) marks a leading space.' }),
    presetRow,
    el('div', { class: 'demo-controls' }, [input, api.button('tokenize', tokenizeLive)]),
    chips, info,
    el('div', { class: 'demo-hint', text: 'Common words stay whole; rare words split into reusable pieces (un\u00b7bel\u00b7iev\u00b7able).' }),
  ]);

  async function load() {
    try { const res = await fetch('data/lm_samples.json'); samples = await res.json(); }
    catch (e) { samples = { tokenize: [{ text: 'unbelievable', pieces: [{ piece: 'un', id: 403 }, { piece: 'bel', id: 6667 }, { piece: 'iev', id: 11203 }, { piece: 'able', id: 540 }] }] }; }
    samples.tokenize.forEach((s, k) => presetRow.appendChild(api.button('"' + s.text + '"', () => { input.value = s.text; renderPieces(s.text, s.pieces); markActive(k); }, k === 0 ? 'primary' : 'ghost')));
    input.value = samples.tokenize[0].text;
    renderPieces(samples.tokenize[0].text, samples.tokenize[0].pieces);
  }
  const markActive = (k) => [...presetRow.children].forEach((b, i) => { b.classList.toggle('primary', i === k); b.classList.toggle('ghost', i !== k); });
  return { mount, init: load };
});

/* =====================================================================
 *  DEMO 17 - next-token distribution + decoding knobs. Presets show a REAL
 *  distribution (precomputed); temperature / top-k / top-p reshape it live;
 *  "generate" streams a continuation from the real model. (L20)
 * ===================================================================== */
register('lm-next', (api) => {
  let samples = null, cur = null;
  const promptRow = el('div', { class: 'demo-controls' });
  const bars = el('div', { class: 'attn-bars2' });
  const genOut = el('div', { class: 'lm-gen' });
  const tCtl = api.slider('temperature', { min: 0.2, max: 2, step: 0.1, value: 1, fmt: (v) => v.toFixed(1) });
  const kCtl = api.slider('top-k', { min: 1, max: 10, step: 1, value: 5, fmt: (v) => v });
  const pCtl = api.slider('top-p', { min: 0.1, max: 1, step: 0.05, value: 1, fmt: (v) => v.toFixed(2) });

  function reshaped() {
    const base = cur.top;
    const T = tCtl.get();
    let items = base.map((t) => ({ piece: t.piece, w: Math.pow(t.p, 1 / T) }));
    let z = items.reduce((a, b) => a + b.w, 0); items.forEach((it) => (it.w /= z));
    items.sort((a, b) => b.w - a.w);
    items = items.slice(0, kCtl.get());               // top-k
    const P = pCtl.get(); let c = 0; const kept = [];  // top-p
    for (const it of items) { kept.push(it); c += it.w; if (c >= P) break; }
    z = kept.reduce((a, b) => a + b.w, 0) || 1; kept.forEach((it) => (it.w /= z));
    return kept;
  }
  function draw() {
    bars.innerHTML = '';
    const items = reshaped(); const max = Math.max(...items.map((i) => i.w), 0.01);
    items.forEach((it, j) => bars.appendChild(el('div', { class: 'attn-row' + (j === 0 ? ' top' : '') }, [
      el('span', { class: 'attn-lab', text: it.piece }),
      el('div', { class: 'attn-track' }, [el('div', { class: 'attn-fill', style: `width:${(it.w / max * 100).toFixed(1)}%` })]),
      el('span', { class: 'attn-num', text: it.w.toFixed(2) }),
    ])));
  }
  [tCtl, kCtl, pCtl].forEach((c) => c.input.addEventListener('input', draw));

  function pickFromLogits(logits) {
    const cand = api.topkIdx(logits, 50);
    let probs = api.softmaxT(cand.map((i) => logits[i]), tCtl.get());
    let items = cand.map((i, j) => ({ i, p: probs[j] }));
    items = items.slice(0, kCtl.get());
    const P = pCtl.get(); let c = 0; const kept = []; for (const it of items) { kept.push(it); c += it.p; if (c >= P) break; }
    const z = kept.reduce((a, b) => a + b.p, 0) || 1; kept.forEach((it) => (it.p /= z));
    let r = Math.random(), acc = 0; for (const it of kept) { acc += it.p; if (r <= acc) return it.i; } return kept[kept.length - 1].i;
  }
  async function generate() {
    genOut.textContent = ''; api.setStatus('Loading model...');
    let lm; try { lm = await api.getCausalLM(); } catch (e) { api.setStatus('Model unavailable; the distribution above still works offline.', 'err'); return; }
    let text = cur.prompt; genOut.textContent = text;
    api.setStatus('Generating...');
    for (let step = 0; step < 24; step++) {
      const { data, seq, vocab } = await api.lmForward(lm, text);
      const last = data.subarray((seq - 1) * vocab, seq * vocab);
      const id = pickFromLogits(last);
      const piece = lm.tokenizer.decode([id]);
      text += piece; genOut.textContent = text;
      if (piece.includes('\n')) break;
    }
    api.setStatus('Generated with a real model in your browser.', 'ok');
  }

  const mount = el('div', {}, [
    promptRow,
    el('div', { class: 'demo-controls' }, [tCtl.field, kCtl.field, pCtl.field]),
    el('div', { class: 'demo-stage' }, [el('div', { class: 'lm-next-left' }, [el('div', { class: 'lm-prompt', id: 'lmp' }), bars]), el('div', { class: 'lm-next-right' }, [api.button('generate (real model)', generate), genOut])]),
  ]);

  function setPrompt(k) {
    cur = samples.next[k];
    [...promptRow.children].forEach((b, i) => { b.classList.toggle('primary', i === k); b.classList.toggle('ghost', i !== k); });
    mount.querySelector('#lmp').innerHTML = 'prompt: <b>' + cur.prompt + '</b> &rarr; ?';
    genOut.textContent = ''; draw();
  }
  async function load() {
    try { const res = await fetch('data/lm_samples.json'); samples = await res.json(); }
    catch (e) { samples = { next: [{ prompt: 'To be, or not to', top: [{ piece: '\u00b7be', id: 307, p: 0.8 }, { piece: ',', id: 11, p: 0.01 }] }] }; }
    samples.next.forEach((s, k) => promptRow.appendChild(api.button('"' + s.prompt + '"', () => setPrompt(k), k === 0 ? 'primary' : 'ghost')));
    setPrompt(0);
  }
  return { mount, init: load };
});

/* =====================================================================
 *  DEMO 18 - teacher forcing: per-token cross-entropy loss. Precomputed
 *  losses render instantly; "score my own text" runs the real model. (L20)
 * ===================================================================== */
register('lm-loss', (api) => {
  let samples = null;
  const input = el('input', { class: 'demo-input', type: 'text', value: 'The robot picked up the cup because it was empty' });
  const rows = el('div', { class: 'attn-bars2' });
  const summary = el('div', { class: 'demo-readout' });
  input.addEventListener('keydown', (e) => e.stopPropagation());

  function render(tokens, losses) {
    rows.innerHTML = '';
    const max = Math.max(...losses, 0.01);
    // losses[t] is the loss predicting tokens[t+1] from tokens[<=t]
    for (let t = 0; t < losses.length; t++) {
      const L = losses[t];
      rows.appendChild(el('div', { class: 'attn-row' }, [
        el('span', { class: 'attn-lab', text: tokens[t + 1].piece }),
        el('div', { class: 'attn-track' }, [el('div', { class: 'attn-fill ' + (L < 1 ? 'lo' : L > 5 ? 'hi' : 'mid'), style: `width:${(L / max * 100).toFixed(1)}%` })]),
        el('span', { class: 'attn-num', text: L.toFixed(1) }),
      ]));
    }
    const avg = losses.reduce((a, b) => a + b, 0) / losses.length;
    summary.innerHTML = '';
    summary.appendChild(el('span', { html: `average loss = <b>${avg.toFixed(2)}</b> nats/token` }));
    summary.appendChild(el('span', { html: `low = predictable (\u201cup\u201d after \u201cpicked\u201d); high = surprising` }));
  }

  async function scoreLive() {
    let lm; try { lm = await api.getCausalLM(); } catch (e) { api.setStatus('Model unavailable; showing the precomputed sentence.', 'err'); return; }
    api.setStatus('Scoring...');
    const { ids, data, seq, vocab } = await api.lmForward(lm, input.value);
    const tokens = ids.map((id) => { let s = lm.tokenizer.decode([id]); return { piece: s.startsWith(' ') ? '\u00b7' + s.slice(1) : s, id }; });
    const losses = [];
    for (let t = 0; t < seq - 1; t++) {
      const row = data.subarray(t * vocab, (t + 1) * vocab);
      const probs = api.softmaxT(row, 1);
      losses.push(-Math.log(probs[ids[t + 1]] + 1e-12));
    }
    render(tokens, losses); api.setStatus('Scored with a real model.', 'ok');
  }

  const mount = el('div', {}, [
    el('div', { class: 'demo-controls' }, [input, api.button('score my own text (real model)', scoreLive)]),
    el('div', { class: 'demo-stage' }, [rows, summary]),
  ]);

  async function load() {
    try { const res = await fetch('data/lm_samples.json'); samples = await res.json(); render(samples.loss.tokens, samples.loss.losses); }
    catch (e) { api.setStatus('Could not load sample losses.', 'err'); }
  }
  return { mount, init: load };
});

/* =====================================================================
 *  DEMO 19 - chat-template inspector: user text vs the templated input the
 *  model actually receives; thinking on/off changes it. (L21, precomputed)
 * ===================================================================== */
register('chat-template', (api) => {
  let data = null, ui = 0, thinking = false;
  const userRow = el('div', { class: 'demo-controls' });
  const pre = el('pre', { class: 'chat-tmpl' });
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function render() {
    const c = data.chat[ui];
    const raw = thinking ? c.think_on : c.think_off;
    pre.innerHTML = esc(raw)
      .replace(/&lt;\|[^|]*?\|&gt;/g, (m) => '<span class="sp">' + m + '</span>')
      .replace(/&lt;\/?think&gt;/g, (m) => '<span class="sp think">' + m + '</span>');
  }
  const mark = (row, k) => [...row.children].forEach((b, i) => { b.classList.toggle('primary', i === k); b.classList.toggle('ghost', i !== k); });
  const toggle = api.button('thinking: OFF', () => { thinking = !thinking; toggle.textContent = 'thinking: ' + (thinking ? 'ON' : 'OFF'); toggle.classList.toggle('primary', thinking); toggle.classList.toggle('ghost', !thinking); render(); }, 'ghost');
  const mount = el('div', {}, [
    el('div', { class: 'demo-note', html: 'What the user types vs. what the model actually receives: roles and special tokens added by the chat template.' }),
    userRow,
    el('div', { class: 'demo-controls' }, [toggle]),
    pre,
    el('div', { class: 'demo-hint', text: 'Thinking mode adds a reasoning section the model fills in before its answer.' }),
  ]);
  async function load() {
    try { const r = await fetch('data/qwen_samples.json'); data = await r.json(); }
    catch (e) { api.setStatus('Could not load samples.', 'err'); return; }
    data.chat.forEach((c, k) => userRow.appendChild(api.button('"' + c.user + '"', () => { ui = k; mark(userRow, k); render(); }, k === 0 ? 'primary' : 'ghost')));
    render();
  }
  return { mount, init: load };
});

/* =====================================================================
 *  DEMO 20 - lm-chat: a real Qwen3-0.6B assistant. Precomputed sample answer
 *  + next-token trace by default; "run" streams live in the browser. (L21)
 * ===================================================================== */
register('lm-chat', (api) => {
  let data = null, pi = 0, thinking = false;
  const promptRow = el('div', { class: 'demo-controls' });
  const bars = el('div', { class: 'attn-bars2' });
  const answer = el('div', { class: 'lm-gen' });
  const tCtl = api.slider('temperature', { min: 0.1, max: 1.5, step: 0.1, value: 0.7, fmt: (v) => v.toFixed(1) });
  function drawTrace() {
    bars.innerHTML = '';
    if (pi !== 0 || !data.next) return;
    const top = data.next.top.slice(0, 6); const max = Math.max(...top.map((t) => t.p));
    top.forEach((t, j) => bars.appendChild(el('div', { class: 'attn-row' + (j === 0 ? ' top' : '') }, [
      el('span', { class: 'attn-lab', text: t.piece }),
      el('div', { class: 'attn-track' }, [el('div', { class: 'attn-fill', style: `width:${(t.p / max * 100).toFixed(1)}%` })]),
      el('span', { class: 'attn-num', text: t.p.toFixed(2) }),
    ])));
  }
  function showPrecomputed() { const g = data.generations[pi]; answer.textContent = g ? g.text : ''; drawTrace(); }
  async function run() {
    answer.textContent = ''; api.setStatus('Loading model (~0.5 GB, one time)...');
    let lm; try { lm = await api.getChatLM(); } catch (e) { api.setStatus('Model unavailable; showing the precomputed answer.', 'err'); showPrecomputed(); return; }
    const user = data.generations[pi].prompt + (thinking ? ' /think' : ' /no_think');
    api.setStatus('Generating...'); let acc = '';
    try { await api.chatStream(lm, [{ role: 'user', content: user }], { doSample: true, T: tCtl.get(), k: 20, p: 0.95, max: 160 }, (t) => { acc += t; answer.textContent = acc; }); api.setStatus('Generated by Qwen3-0.6B in your browser.', 'ok'); }
    catch (e) { api.setStatus('Generation failed; showing precomputed.', 'err'); showPrecomputed(); }
  }
  const toggle = api.button('thinking: OFF', () => { thinking = !thinking; toggle.textContent = 'thinking: ' + (thinking ? 'ON' : 'OFF'); toggle.classList.toggle('primary', thinking); toggle.classList.toggle('ghost', !thinking); }, 'ghost');
  const mount = el('div', {}, [
    promptRow,
    el('div', { class: 'demo-controls' }, [tCtl.field, toggle, api.button('run (real model)', run)]),
    el('div', { class: 'demo-stage' }, [el('div', { class: 'lm-next-left' }, [el('div', { class: 'lm-prompt', id: 'lcp' }), bars]), el('div', { class: 'lm-next-right' }, [answer])]),
  ]);
  function setP(k) { pi = k; [...promptRow.children].forEach((b, i) => { b.classList.toggle('primary', i === k); b.classList.toggle('ghost', i !== k); }); mount.querySelector('#lcp').innerHTML = 'prompt: <b>' + data.generations[k].prompt + '</b>'; showPrecomputed(); }
  async function load() {
    try { const r = await fetch('data/qwen_samples.json'); data = await r.json(); }
    catch (e) { api.setStatus('Could not load samples.', 'err'); return; }
    data.generations.forEach((g, k) => promptRow.appendChild(api.button('"' + g.prompt + '"', () => setP(k), k === 0 ? 'primary' : 'ghost')));
    setP(0);
  }
  return { mount, init: load };
});

/* =====================================================================
 *  DEMO 21 - lm-attention: REAL Qwen3-0.6B attention. Pick a head, click a
 *  query token, read where it looks in the actual dissected model. (L21)
 * ===================================================================== */
register('lm-attention', (api) => {
  let data = null, hi = 0, qi = null;
  const canvas = api.canvasEl(380, 360); canvas.classList.add('clickable');
  const panel = el('div', { class: 'attn-panel' });
  const headRow = el('div', { class: 'demo-controls' });
  const toks = () => data.attention.tokens;
  const A = () => data.attention.heads[hi].A;
  function layout() { const W = canvas.width, H = canvas.height, n = toks().length; const padL = 96, padT = 66; const cell = Math.min(30, (W - padL - 8) / n, (H - padT - 8) / n); return { W, H, n, padL, padT, cell }; }
  function draw() {
    const ctx = canvas.getContext('2d'); const { W, H, n, padL, padT, cell } = layout(); const M = A(), tk = toks();
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = '#374151'; ctx.textAlign = 'left';
    for (let j = 0; j < n; j++) { ctx.save(); ctx.translate(padL + j * cell + cell / 2 + 4, padT - 8); ctx.rotate(-Math.PI / 4); ctx.fillText(tk[j], 0, 0); ctx.restore(); }
    ctx.textAlign = 'right';
    for (let i = 0; i < n; i++) { ctx.fillStyle = i === qi ? '#b91c1c' : '#374151'; ctx.fillText(tk[i], padL - 6, padT + i * cell + cell / 2 + 4); }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { ctx.fillStyle = `rgba(29,78,216,${Math.pow(M[i][j], 0.7).toFixed(3)})`; ctx.fillRect(padL + j * cell, padT + i * cell, cell - 1, cell - 1); }
    if (qi != null) { ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2.5; ctx.strokeRect(padL - 1, padT + qi * cell - 1, n * cell + 1, cell + 1); }
    drawPanel();
  }
  function drawPanel() {
    panel.innerHTML = ''; const tk = toks();
    if (qi == null) { panel.appendChild(el('p', { class: 'attn-hint', html: 'Click any <b>row</b> (query token) to see where it looks.' })); return; }
    const row = A()[qi];
    panel.appendChild(el('p', { class: 'attn-q', html: `query: <b>${tk[qi]}</b> attends to&hellip;` }));
    const order = tk.map((t, j) => [t, row[j]]).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = order[0][1] || 1; const b = el('div', { class: 'attn-bars2' });
    order.forEach(([t, w]) => b.appendChild(el('div', { class: 'attn-row' }, [
      el('span', { class: 'attn-lab', text: t }), el('div', { class: 'attn-track' }, [el('div', { class: 'attn-fill', style: `width:${(w / max * 100).toFixed(1)}%` })]), el('span', { class: 'attn-num', text: w.toFixed(2) }),
    ])));
    panel.appendChild(b);
  }
  canvas.addEventListener('click', (e) => { const { padT, cell, n } = layout(); const r = canvas.getBoundingClientRect(); const my = (e.clientY - r.top) * canvas.height / r.height; const i = Math.floor((my - padT) / cell); if (i >= 0 && i < n) { qi = i; draw(); } });
  function setHead(k) { hi = k; [...headRow.children].forEach((b, i) => { b.classList.toggle('primary', i === k); b.classList.toggle('ghost', i !== k); }); draw(); }
  const mount = el('div', {}, [
    el('div', { class: 'demo-note', html: 'Real attention from inside <b>Qwen3-0.6B</b> (28 layers, 16 heads). Different layer/head pairs specialize.' }),
    headRow,
    el('div', { class: 'demo-stage' }, [canvas, panel]),
  ]);
  async function load() {
    try { const r = await fetch('data/qwen_samples.json'); data = await r.json(); }
    catch (e) { api.setStatus('Could not load attention data.', 'err'); return; }
    data.attention.heads.forEach((h, k) => headRow.appendChild(api.button(h.label, () => setHead(k), k === 0 ? 'primary' : 'ghost')));
    qi = toks().findIndex((t) => t.replace(/\u00b7/g, '').toLowerCase() === 'it'); if (qi < 0) qi = null;
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
  const input = el('input', { class: 'demo-input', type: 'text', value: 'When is Assignment 2 due?' });
  const chunksBox = el('div', { class: 'rag-chunks' });
  const promptBox = el('div', { class: 'rag-prompt' });
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  input.addEventListener('keydown', (e) => e.stopPropagation());

  function show(question, ranking) {
    chunksBox.innerHTML = '';
    const max = ranking[0].score || 1;
    ranking.slice(0, 3).forEach((r, idx) => {
      const c = data.chunks[r.i];
      chunksBox.appendChild(el('div', { class: 'rag-row' + (idx === 0 ? ' top' : '') }, [
        el('span', { class: 'rag-src', text: c.source }),
        el('div', { class: 'rag-txt' }, [el('div', { class: 'rag-tt', text: c.text }), el('div', { class: 'rag-bar' }, [el('div', { class: 'rag-fill', style: `width:${(r.score / max * 100).toFixed(0)}%` })])]),
        el('span', { class: 'rag-score', text: r.score.toFixed(2) }),
      ]));
    });
    const top = data.chunks[ranking[0].i];
    promptBox.innerHTML = '';
    promptBox.appendChild(el('div', { class: 'rp-line sys', text: 'System: answer using only the context; cite the source.' }));
    promptBox.appendChild(el('div', { class: 'rp-line ctx', html: 'Context [' + esc(top.source) + ']: ' + esc(top.text) }));
    promptBox.appendChild(el('div', { class: 'rp-line q', html: 'Question: ' + esc(question) }));
  }
  async function retrieve() {
    const q = input.value.trim(); if (!q) return;
    api.setStatus('Embedding query with MiniLM...');
    let ex; try { ex = await api.getEmbedder(); } catch (e) { api.setStatus('Embedder unavailable; use a preset question.', 'err'); return; }
    const [qv] = await api.embedTexts(ex, [q]);
    const ranking = data.chunks.map((c) => ({ i: c.id, score: api.cosine(qv, c.vec) })).sort((a, b) => b.score - a.score).slice(0, 5);
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
    try { const r = await fetch('data/rag_chunks.json'); data = await r.json(); }
    catch (e) { api.setStatus('Could not load the course index.', 'err'); return; }
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
  const rCtl = api.slider('rank r', { min: 1, max: 16, step: 1, value: 4, fmt: (v) => v });
  const c0 = api.canvasEl(150, 150), cd = api.canvasEl(150, 150), cw = api.canvasEl(150, 150);
  const readout = el('div', { class: 'demo-readout' });
  const rnd = api.rng32(7);
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const W0 = Array.from({ length: D }, () => Array.from({ length: D }, gauss));
  const Bfull = Array.from({ length: D }, () => Array.from({ length: 16 }, gauss));
  const Afull = Array.from({ length: 16 }, () => Array.from({ length: D }, gauss));

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
    readout.innerHTML = '';
    readout.appendChild(el('span', { html: `trainable: <b>${train}</b> vs full <b>${full}</b> (rank r=${r}, d=${D})` }));
    readout.appendChild(el('span', { html: `only <b>${(train / full * 100).toFixed(0)}%</b> of the weights are trained` }));
  }
  rCtl.input.addEventListener('input', draw);
  const panel = (cap, cv) => el('div', { class: 'lora-panel' }, [el('div', { class: 'lora-cap', html: cap }), cv]);
  const mount = el('div', {}, [
    el('div', { class: 'demo-note', html: 'Freeze the big weight \\(W_0\\); train only a low-rank update \\(\\Delta W = BA\\). Higher rank = more expressive but more parameters.' }),
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
  const expr = '0.30*85 + 0.20*92 + 0.50*78';
  const result = 0.30 * 85 + 0.20 * 92 + 0.50 * 78;  // computed live by the "tool"
  const steps = [
    { role: 'user', text: 'What is my weighted grade? Assignments 85 (30%), chats 92 (20%), final 78 (50%).' },
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

/* --------------------------------------------------------------- boot ----- */
wireReveal();
