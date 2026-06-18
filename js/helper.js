/* "Ask about Yuntian" helper widget.
 *
 * Sends the visitor's query to the PAW inference service (data-endpoint) at
 * POST /ask and renders the structured result: a link, a freeform answer, the
 * feedback form, or a graceful fallback. Feedback posts to POST /feedback.
 * Vanilla JS, no dependencies; themed via _sass/_helper.scss.
 */
(function () {
  'use strict';

  var root = document.getElementById('paw-helper');
  if (!root) return;

  var ENDPOINT = (root.dataset.endpoint || '').replace(/\/$/, '');
  // Page key sent with each query so the router can apply a page prior.
  var PAGE = root.dataset.page || 'site';
  var IS_COURSE = /^course/.test(PAGE);
  var launch = root.querySelector('.paw-helper__launch');
  var overlay = root.querySelector('.paw-helper__overlay');
  var dialog = root.querySelector('.paw-helper__dialog');
  var form = root.querySelector('.paw-helper__bar');
  var input = root.querySelector('.paw-helper__input');
  var spinner = root.querySelector('.paw-helper__spinner');
  var closeBtn = root.querySelector('.paw-helper__close');
  var results = root.querySelector('.paw-helper__results');

  var debounceTimer = null;
  var reqSeq = 0; // guards against out-of-order async responses

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function setLoading(on) {
    if (spinner) spinner.hidden = !on;
  }

  function openDialog() {
    overlay.hidden = false;
    dialog.hidden = false;
    launch.setAttribute('aria-expanded', 'true');
    renderQuickLinks();
    setTimeout(function () { input.focus(); }, 30);
  }

  function closeDialog() {
    overlay.hidden = true;
    dialog.hidden = true;
    launch.setAttribute('aria-expanded', 'false');
    input.value = '';
    results.innerHTML = '';
    if (debounceTimer) clearTimeout(debounceTimer);
    clearAskFromUrl();
    launch.focus();
  }

  // Strip the ?ask / #ask deep-link markers from the URL via replaceState (no
  // reload, no scroll, no history entry), so closing the helper - or a later
  // refresh - does not keep re-opening it.
  function clearAskFromUrl() {
    var isAskHash = location.hash.replace(/^#/, '').toLowerCase() === 'ask';
    var params = new URLSearchParams(location.search);
    var hasAskParam = params.has('ask');
    if (!isAskHash && !hasAskParam) return;
    if (hasAskParam) params.delete('ask');
    var search = params.toString();
    history.replaceState(null, '',
      location.pathname + (search ? '?' + search : '') + (isAskHash ? '' : location.hash));
  }

  function renderQuickLinks() {
    results.innerHTML = '';
    var hint = el('p', 'paw-helper__placeholder', IS_COURSE
      ? 'Try: “when is the next assignment due”, “how is the course graded”, or “where do I post questions?”'
      : 'Try: “where is your CV”, “what are you working on”, or “are you taking students?”');
    results.appendChild(hint);
  }

  function clearResults() { results.innerHTML = ''; }

  function renderLink(r) {
    clearResults();
    var a = el('a', 'paw-helper__result paw-helper__result--link');
    a.href = r.url;
    if (r.url.indexOf('mailto:') !== 0) { a.target = '_blank'; a.rel = 'noopener'; }
    a.appendChild(el('span', 'paw-helper__result-title', r.label));
    if (r.description) a.appendChild(el('span', 'paw-helper__result-desc', r.description));
    results.appendChild(a);
  }

  // Render text that may contain markdown links [label](url). Builds DOM nodes
  // directly (no innerHTML) so there is no XSS surface; only http(s)/mailto URLs
  // become links, and anything that doesn't match is shown as plain text.
  function appendMarkdown(parent, text) {
    var re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g;
    var last = 0;
    var m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      var a = document.createElement('a');
      a.href = m[2];
      a.textContent = m[1];
      if (m[2].indexOf('mailto:') !== 0) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      parent.appendChild(a);
      last = re.lastIndex;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }

  function renderAnswer(r) {
    clearResults();
    var d = el('div', 'paw-helper__result paw-helper__result--answer');
    var p = el('p', 'paw-helper__answer-text');
    appendMarkdown(p, r.text || '');
    d.appendChild(p);
    results.appendChild(d);
  }

  function renderNone() {
    clearResults();
    var d = el('div', 'paw-helper__result paw-helper__result--none');
    d.appendChild(el('span', null, "I'm not sure about that. You can "));
    var mail = el('a', null, 'email Yuntian');
    mail.href = 'mailto:yuntian@uwaterloo.ca';
    d.appendChild(mail);
    d.appendChild(el('span', null, ' or '));
    var fb = el('button', 'paw-helper__inline-btn', 'leave feedback');
    fb.type = 'button';
    fb.addEventListener('click', renderFeedbackForm);
    d.appendChild(fb);
    d.appendChild(el('span', null, '.'));
    results.appendChild(d);
  }

  function renderFeedbackForm() {
    clearResults();
    var wrap = el('div', 'paw-helper__feedback');
    var ta = el('textarea', 'paw-helper__textarea');
    ta.placeholder = 'Your message (anonymous). Bug reports, suggestions, and praise all welcome.';
    ta.maxLength = 2000;
    var email = el('input', 'paw-helper__email');
    email.type = 'email';
    email.placeholder = 'Email (optional, for a reply)';
    var send = el('button', 'paw-helper__send', 'Send feedback');
    send.type = 'button';
    var status = el('p', 'paw-helper__fb-status');
    send.addEventListener('click', function () {
      var text = ta.value.trim();
      if (!text) { ta.focus(); return; }
      send.disabled = true;
      status.textContent = 'Sending…';
      fetch(ENDPOINT + '/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text, email: email.value.trim() || undefined, page_url: location.href })
      }).then(function (resp) {
        if (!resp.ok) throw new Error();
        status.textContent = 'Thank you for your feedback!';
        ta.value = ''; email.value = '';
      }).catch(function () {
        status.textContent = 'Could not send. Please try again later.';
        send.disabled = false;
      });
    });
    wrap.appendChild(ta);
    wrap.appendChild(email);
    wrap.appendChild(send);
    wrap.appendChild(status);
    results.appendChild(wrap);
    setTimeout(function () { ta.focus(); }, 30);
  }

  function render(r) {
    if (!r || r.type === 'none') return renderNone();
    if (r.type === 'link') return renderLink(r);
    if (r.type === 'answer') return renderAnswer(r);
    if (r.type === 'feedback') return renderFeedbackForm();
    return renderNone();
  }

  function runQuery(q) {
    q = q.trim();
    if (q.length < 3) { renderQuickLinks(); return; }
    var seq = ++reqSeq;
    setLoading(true);
    fetch(ENDPOINT + '/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, page: PAGE })
    }).then(function (resp) {
      return resp.ok ? resp.json() : null;
    }).then(function (data) {
      if (seq !== reqSeq) return; // a newer query superseded this one
      setLoading(false);
      render(data);
    }).catch(function () {
      if (seq !== reqSeq) return;
      setLoading(false);
      renderNone();
    });
  }

  // On the course page, frame the prompt around the course.
  if (IS_COURSE) {
    input.placeholder = 'Ask about CS 486/686 (deadlines, grading, slides)…';
    launch.setAttribute('aria-label', 'Ask about CS 486/686');
  }

  // --- Events ---
  launch.addEventListener('click', openDialog);
  closeBtn.addEventListener('click', closeDialog);
  overlay.addEventListener('click', closeDialog);

  input.addEventListener('input', function () {
    if (debounceTimer) clearTimeout(debounceTimer);
    var v = input.value;
    debounceTimer = setTimeout(function () { runQuery(v); }, 400);
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (debounceTimer) clearTimeout(debounceTimer);
    runQuery(input.value);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !dialog.hidden) closeDialog();
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (dialog.hidden) openDialog(); else closeDialog();
    }
  });

  // Deep link: open the helper when the URL carries an "ask" marker:
  //   ?ask=1            -> just open the helper
  //   ?ask=<question>   -> open, prefill the question, and run it
  //   #ask              -> same as ?ask=1
  // Lets a shared/tweeted link land visitors straight in the helper.
  function openFromUrl() {
    var raw = null;
    try { raw = new URLSearchParams(location.search).get('ask'); } catch (e) {}
    var hashAsk = location.hash.replace(/^#/, '').toLowerCase() === 'ask';
    if (raw === null && !hashAsk) return;
    if (dialog.hidden) openDialog();
    var q = (raw && raw !== '1' && raw.toLowerCase() !== 'true') ? raw : '';
    if (q) {
      input.value = q;
      runQuery(q);
    }
  }

  // Run once on load, and again on every hashchange - so clicking an in-page
  // "#ask" link (which updates the hash without reloading the page) also opens
  // the helper, not just a fresh load with that URL.
  openFromUrl();
  window.addEventListener('hashchange', openFromUrl);
})();
