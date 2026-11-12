/**
 * Mobile nav toggle.
 *
 * Replaces the broken `:hover` opener with a real click handler so the
 * menu works on touch devices. Also flips `aria-expanded` for screen readers
 * and closes the menu when a link inside it is activated or when the user
 * clicks outside / presses Escape.
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var nav = document.querySelector('.site-nav');
    if (!nav) return;
    var button = nav.querySelector('.menu-icon');
    var panel = nav.querySelector('.trigger');
    var languageMenu = document.querySelector('.language-menu');
    if (!button || !panel) return;

    function setOpen(open) {
      panel.classList.toggle('is-open', open);
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function close() { setOpen(false); }

    button.addEventListener('click', function (e) {
      e.stopPropagation();
      if (languageMenu) languageMenu.open = false;
      setOpen(!panel.classList.contains('is-open'));
    });

    panel.addEventListener('click', function (e) {
      var link = e.target && e.target.closest && e.target.closest('a');
      if (link) close();
    });

    document.addEventListener('click', function (e) {
      if (languageMenu && languageMenu.open && !languageMenu.contains(e.target)) {
        languageMenu.open = false;
      }
      if (panel.classList.contains('is-open') && !nav.contains(e.target)) {
        close();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && languageMenu && languageMenu.open) {
        languageMenu.open = false;
        languageMenu.querySelector('summary').focus();
      }
      if (e.key === 'Escape' && panel.classList.contains('is-open')) {
        close();
        button.focus();
      }
    });

    if (languageMenu) {
      languageMenu.addEventListener('toggle', function () {
        if (languageMenu.open) close();
      });
    }
  });
})();
