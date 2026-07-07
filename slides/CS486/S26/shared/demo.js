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
 *  DEMO 4 - loss playground: sigmoid + cross-entropy, softmax + temp (JS)
 * ===================================================================== */
register('loss-playground', (api) => {
  // (a) sigmoid + cross-entropy
  const sig = (z) => 1 / (1 + Math.exp(-z));
  const zCanvas = api.canvasEl(300, 200);
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

  // (b) softmax + temperature
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
    el('div', { class: 'demo-split' }, [
      el('div', {}, [
        el('div', { class: 'demo-controls' }, [zCtl.field, flipBtn]),
        zCanvas,
        ceOut,
        el('div', { class: 'demo-hint', text: 'Cross-entropy = \u2212log(prob of the true class). Confident and wrong is punished hard.' }),
      ]),
      el('div', {}, [
        el('div', { class: 'demo-controls' }, [tempCtl.field]),
        el('div', { class: 'demo-controls' }, logitCtls.map((c) => c.field)),
        barsWrap,
        el('div', { class: 'demo-hint', text: 'Softmax turns scores into probabilities. Low temperature sharpens; high temperature flattens (this is the decoding knob in L20/L21).' }),
      ]),
    ]),
  ]);
  return { mount, init: () => { drawCE(); drawSM(); } };
});

/* =====================================================================
 *  DEMO 5 - overfitting playground   (Pyodide numpy fit, JS draws)
 * ===================================================================== */
register('overfitting', (api) => {
  const degCtl = api.slider('polynomial degree', { min: 1, max: 9, step: 1, value: 1, fmt: (v) => String(v) });
  const lamCtl = api.slider('ridge \u03bb', { min: 0, max: 2, step: 0.05, value: 0, fmt: (v) => v.toFixed(2) });
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

def fit(deg, lam):
    X = np.vander(xt, deg + 1)
    A = X.T @ X + lam * np.eye(deg + 1)
    return np.linalg.solve(A, X.T @ yt)

def mse(c, xx, yy):
    return float(np.mean((np.polyval(c, xx) - yy) ** 2))

degs = list(range(1, 10))
xt_l = xt.tolist(); yt_l = yt.tolist(); xv_l = xv.tolist(); yv_l = yv.tolist()`;
  }
  function pyForDegree(deg, lam) {
    return `train = [mse(fit(d, ${lam}), xt, yt) for d in degs]
val = [mse(fit(d, ${lam}), xv, yv) for d in degs]
c = fit(${deg}, ${lam})
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
      await api.runPython(py, pyForDegree(degCtl.get(), lamCtl.get()), () => {});
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
      readout.appendChild(el('span', { html: deg >= 7 ? '<b style="color:#b91c1c">overfitting</b>' : (deg <= 1 ? 'underfitting' : 'good fit') }));
      api.setStatus('Done.', 'ok');
    } catch (e) {
      api.setStatus('Error: ' + String(e), 'err');
    }
  }

  degCtl.input.addEventListener('change', () => { if (ready) refresh(); });
  lamCtl.input.addEventListener('change', () => { if (ready) refresh(); });
  const runBtn = api.button('Fit in Python', refresh);

  const mount = el('div', {}, [
    el('div', { class: 'demo-controls' }, [degCtl.field, lamCtl.field, runBtn]),
    el('div', { class: 'demo-stage' }, [fitCanvas, curveCanvas, readout]),
    el('div', { class: 'demo-hint', text: 'Blue = training points, red = validation points. Raise the degree: training loss keeps dropping but validation loss turns up - overfitting. Ridge \u03bb pulls it back.' }),
  ]);
  const preview = () => {
    const p = api.makePlot(fitCanvas, { xMin: -3.4, xMax: 3.4, yMin: -4, yMax: 4 }); p.clear(); p.axes('x', 'y');
    const q = api.makePlot(curveCanvas, { xMin: 1, xMax: 9, yMin: 0, yMax: 1 }); q.clear(); q.axes('degree', 'loss');
  };
  return { mount, init: preview };
});

/* --------------------------------------------------------------- boot ----- */
wireReveal();
