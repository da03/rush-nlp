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
  let useAct = true, frames = [], timer = null;

  const canvas = api.canvasEl(460, 250);
  const readout = el('div', { class: 'demo-readout' });

  function train() {
    const r = api.rng32(7);
    let W1 = new Array(H).fill(0).map(() => (r() * 2 - 1) * 1.6);
    let b1 = new Array(H).fill(0).map(() => (r() * 2 - 1) * 1.6);
    let W2 = new Array(H).fill(0).map(() => (r() * 2 - 1) * 0.6);
    let b2 = 0;
    const vW1 = new Array(H).fill(0), vb1 = new Array(H).fill(0), vW2 = new Array(H).fill(0);
    let vb2 = 0;
    const g = (z) => useAct ? Math.tanh(z) : z;
    const dg = (a) => useAct ? (1 - a * a) : 1;
    const grid = []; for (let t = -3; t <= 3.0001; t += 0.08) grid.push(t);
    const curveAt = () => grid.map((x) => {
      let o = b2; for (let j = 0; j < H; j++) o += W2[j] * g(W1[j] * x + b1[j]); return o;
    });
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
  const toggle = api.button('activation: ON', () => {
    useAct = !useAct; toggle.textContent = 'activation: ' + (useAct ? 'ON' : 'OFF'); run();
  }, 'ghost');

  const mount = el('div', {}, [
    el('div', { class: 'demo-controls' }, [toggle, api.button('Train', run)]),
    el('div', { class: 'demo-stage' }, [canvas, readout]),
    el('div', { class: 'demo-hint', text: 'Same net, same data. Activation OFF: stacked linear layers stay a line. ON: the layer bends to fit the wave. That bend is what nonlinearity buys.' }),
  ]);
  const preview = () => { const p = api.makePlot(canvas, { xMin: -3.2, xMax: 3.2, yMin: -1.5, yMax: 1.5 }); p.clear(); p.axes('x', 'y'); p.points(xs, ys, { color: '#1f2937', r: 3 }); };
  return { mount, init: preview, onLeave: () => { if (timer) { clearInterval(timer); timer = null; } } };
});

/* =====================================================================
 *  DEMO 7 - XOR neural-net playground (JS): 2-2-1 MLP trained live
 *  Forward + backprop in JS on the XOR cloud; animate the decision
 *  boundary forming. Fixed seed converges; reseed as an escape hatch.
 * ===================================================================== */
register('xor-net', (api) => {
  const HID = 2;
  // Curated inits that reliably drive the 2-2-1 net to a crisp XOR solution
  // (verified offline); reseed cycles through them so a live run never stalls.
  const GOOD_SEEDS = [1, 2, 6, 7, 10, 13, 16, 19, 24, 30];
  let seedIdx = 0, seed = GOOD_SEEDS[0];
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
    const fwd = (x1, x2) => {
      const a = new Array(HID); let o = b2;
      for (let j = 0; j < HID; j++) { a[j] = Math.tanh(W1[j][0] * x1 + W1[j][1] * x2 + b1[j]); o += W2[j] * a[j]; }
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
          const dz = dO * W2[j] * (1 - a[j] * a[j]);
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
    for (const [x1, x2, y] of pts) { ctx.beginPath(); ctx.arc(sx(x1), sy(x2), 4, 0, 7); ctx.fillStyle = y ? '#065f46' : '#7f1d1d'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function drawLoss(cap) {
    const p = api.makePlot(lossCanvas, { xMin: 0, xMax: Math.max(1, (frames.length - 1) * 28), yMin: 0, yMax: Math.max(0.2, frames[0].loss * 1.05) });
    p.clear(); p.axes('step', 'loss');
    const xs = cap.lossHist.map((_, i) => i), ys = cap.lossHist;
    p.line(xs, ys, { color: '#dc2626', width: 2.5 });
    readout.innerHTML = '';
    readout.appendChild(el('span', { html: `loss = <b>${cap.loss.toFixed(3)}</b>` }));
    readout.appendChild(el('span', { html: `seed <b>${seed}</b>` }));
    readout.appendChild(el('span', { html: (cap.loss < 0.15 ? '<b style="color:#166534">XOR solved</b>' : (cap.loss < 0.4 ? 'learning...' : '<b style="color:#b45309">still mixing</b>')) }));
  }
  function run() {
    if (timer) clearInterval(timer);
    pts = makeData(seed);
    frames = train(); let f = 0;
    timer = setInterval(() => { drawBoundary(frames[f]); drawLoss(frames[f]); f++; if (f >= frames.length) { clearInterval(timer); timer = null; } }, 45);
  }
  const mount = el('div', {}, [
    el('div', { class: 'demo-controls' }, [api.button('Train', run), api.button('Reseed', () => { seedIdx = (seedIdx + 1) % GOOD_SEEDS.length; seed = GOOD_SEEDS[seedIdx]; run(); }, 'ghost')]),
    el('div', { class: 'demo-stage' }, [boundary, lossCanvas, readout]),
    el('div', { class: 'demo-hint', text: 'Left: green/red = the net\u2019s decision surface (dots are labels). Right: BCE loss. Two hidden units learn features that bend the space until XOR becomes separable.' }),
  ]);
  const preview = () => {
    pts = makeData(seed);
    const ctx = boundary.getContext('2d'); ctx.clearRect(0, 0, boundary.width, boundary.height); ctx.fillStyle = '#f1f5f9'; ctx.fillRect(0, 0, boundary.width, boundary.height);
    const sx = (x) => (x + 2) / 4 * boundary.width, sy = (y) => (2 - y) / 4 * boundary.height;
    for (const [x1, x2, y] of pts) { ctx.beginPath(); ctx.arc(sx(x1), sy(x2), 4, 0, 7); ctx.fillStyle = y ? '#065f46' : '#7f1d1d'; ctx.fill(); }
    const q = api.makePlot(lossCanvas, { xMin: 0, xMax: 1, yMin: 0, yMax: 1 }); q.clear(); q.axes('step', 'loss');
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

/* --------------------------------------------------------------- boot ----- */
wireReveal();
