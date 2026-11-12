(function () {
  'use strict';

  function normalizeLanguage(value) {
    if (typeof value !== 'string') return '';
    var parts = value.trim().toLowerCase().replace(/_/g, '-').split('-');
    if (parts[0] === 'in') parts[0] = 'id';
    if (parts[0] === 'iw') parts[0] = 'he';
    return parts.join('-');
  }

  function chooseLanguage(languages, preferences, savedId) {
    var saved = languages.find(function (language) { return language.id === savedId; });
    if (saved) return saved;

    for (var i = 0; i < preferences.length; i++) {
      var preferred = normalizeLanguage(preferences[i]);
      if (!preferred) continue;
      var match = languages.find(function (language) {
        return normalizeLanguage(language.lang) === preferred;
      });
      if (!match) {
        var base = preferred.split('-')[0];
        match = languages.find(function (language) {
          return normalizeLanguage(language.lang).split('-')[0] === base;
        });
      }
      if (match) return match;
    }
    return null;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { chooseLanguage: chooseLanguage };
  }
  if (typeof document === 'undefined') return;

  document.addEventListener('DOMContentLoaded', function () {
    var config = document.getElementById('homepage-languages');
    var menu = document.querySelector('.language-menu');
    if (!config || !menu) return;

    var languages;
    try { languages = JSON.parse(config.textContent); } catch (error) { return; }
    if (!Array.isArray(languages)) return;

    var storageKey = 'homepage-language';
    function remember(id) {
      try { localStorage.setItem(storageKey, id); } catch (error) { /* Navigation works without storage. */ }
    }
    menu.querySelectorAll('[data-language-id]').forEach(function (link) {
      link.addEventListener('click', function () { remember(link.getAttribute('data-language-id')); });
    });

    // Suggest a language on the English homepage; explicit URLs keep their language.
    var suggestion = document.getElementById('language-suggestion');
    if (!suggestion) return;
    var savedId;
    try { savedId = localStorage.getItem(storageKey); } catch (error) { /* Use browser preferences. */ }
    var preferences = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    var chosen = chooseLanguage(languages, preferences, savedId);
    if (!chosen || chosen.id === 'en') return;

    var link = document.getElementById('language-suggestion-link');
    var stay = document.getElementById('language-suggestion-stay');
    if (!link || !stay) return;
    link.setAttribute('href', chosen.path);
    link.setAttribute('lang', chosen.lang);
    link.setAttribute('dir', chosen.dir);
    link.textContent = chosen.suggestion;
    link.addEventListener('click', function () { remember(chosen.id); });
    stay.addEventListener('click', function () {
      remember('en');
      suggestion.hidden = true;
      menu.querySelector('summary').focus();
    });
    suggestion.hidden = false;
  });
})();
