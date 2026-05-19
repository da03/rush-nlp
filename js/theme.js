/**
 * Theme toggle for yuntiandeng.com.
 *
 * Three states: 'light' / 'dark' / null (system default).
 * Stored under localStorage['theme']. The pre-paint inline snippet in
 * _includes/head.html applies the stored choice before first paint to
 * avoid a flash of wrong theme; this file wires up the button.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'theme';
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function stored() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function persist(value) {
    try {
      if (value) localStorage.setItem(STORAGE_KEY, value);
      else       localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* private mode, ignore */ }
  }

  function effectiveTheme() {
    var s = stored();
    if (s === 'light' || s === 'dark') return s;
    return (media && media.matches) ? 'dark' : 'light';
  }

  function apply(theme) {
    if (theme === 'dark' || theme === 'light') {
      root.setAttribute('data-theme', theme);
    } else {
      root.removeAttribute('data-theme');
    }
    updateButtons(effectiveTheme());
  }

  function updateButtons(active) {
    var buttons = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      var isDark = active === 'dark';
      b.setAttribute('aria-pressed', isDark ? 'true' : 'false');
      b.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
      b.setAttribute('title', isDark ? 'Switch to light theme' : 'Switch to dark theme');
    }
  }

  function onToggleClick() {
    var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    persist(next);
    apply(next);
  }

  // Re-sync if the user has not chosen explicitly and the OS preference changes.
  function onSystemChange() {
    if (!stored()) apply(null);
  }

  document.addEventListener('DOMContentLoaded', function () {
    apply(stored()); // ensure button state matches whatever the pre-paint snippet set
    var buttons = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', onToggleClick);
    }
    if (media && typeof media.addEventListener === 'function') {
      media.addEventListener('change', onSystemChange);
    } else if (media && typeof media.addListener === 'function') {
      media.addListener(onSystemChange); // Safari < 14
    }
  });
})();
