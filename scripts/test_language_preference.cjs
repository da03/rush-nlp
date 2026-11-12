#!/usr/bin/env node
'use strict';

// Run with: node --test scripts/test_language_preference.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'js/language-preference.js');
const { chooseLanguage } = require(sourcePath);
const languages = JSON.parse(fs.readFileSync(path.join(root, '_data/homepage_languages.json'), 'utf8'));
const language = id => languages.find(entry => entry.id === id);

test('an explicit saved choice takes priority over browser preferences', () => {
  assert.equal(chooseLanguage(languages, ['fr-CA', 'en'], 'de'), language('de'));
  assert.equal(chooseLanguage(languages, ['fr-CA'], 'en'), language('en'));
});

test('language matching follows browser order, including English', () => {
  assert.equal(chooseLanguage(languages, ['en-US', 'zh-CN']), language('en'));
  assert.equal(chooseLanguage(languages, ['nl-NL', 'fr-CA', 'de']), language('fr'));
  assert.equal(chooseLanguage(languages, ['ko-KR', 'ja-JP']), language('ko'));
});

test('regional tags, script tags and legacy Indonesian select available editions', () => {
  for (const [preference, expected] of [
    ['FR-ca', 'fr'], ['pt-PT', 'pt-BR'], ['pt-BR', 'pt-BR'],
    ['zh-CN', 'zh'], ['zh-Hans-CN', 'zh'], ['fa-IR', 'fa'],
    ['in-ID', 'id'], ['ar-EG', 'ar']
  ]) {
    assert.equal(chooseLanguage(languages, [preference]), language(expected), preference);
  }
  const hebrew = [{ id: 'he', lang: 'he', path: '/he/' }];
  assert.equal(chooseLanguage(hebrew, ['iw-IL']), hebrew[0]);
});

test('an exact supported language variant wins over a base-language fallback', () => {
  const variants = [
    { id: 'pt-BR', lang: 'pt-BR', path: '/pt-br/' },
    { id: 'pt-PT', lang: 'pt-PT', path: '/pt-pt/' }
  ];
  assert.equal(chooseLanguage(variants, ['pt-PT']), variants[1]);
});

test('unsupported preferences and stale saved choices never invent a destination', () => {
  assert.equal(chooseLanguage(languages, ['nl-NL', 'sv-SE']), null);
  assert.equal(chooseLanguage(languages, []), null);
  assert.equal(chooseLanguage(languages, ['ja-JP'], 'removed-language'), language('ja'));
  assert.equal(chooseLanguage(languages, [], 'https://example.com/'), null);
});

class Element {
  constructor(attributes = {}) {
    this.attributes = { ...attributes };
    this.listeners = new Map();
    this.hidden = false;
    this.textContent = '';
    this.dataset = {};
    for (const [name, value] of Object.entries(attributes)) this.setAttribute(name, value);
  }
  addEventListener(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(callback);
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name.startsWith('data-')) {
      this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
    }
  }
  removeAttribute(name) { delete this.attributes[name]; }
  get href() { return this.getAttribute('href'); }
  set href(value) { this.setAttribute('href', value); }
  click() {
    const event = {
      target: this, currentTarget: this, button: 0, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }
    };
    for (const callback of this.listeners.get('click') || []) callback(event);
    return event;
  }
}

function loadPage({ preferences = ['fr-CA', 'en'], saved, storage, localized = false,
                    storageUnavailable = false, writeUnavailable = false } = {}) {
  const values = storage || new Map(saved ? [['homepage-language', saved]] : []);
  const writes = [];
  const config = new Element();
  config.textContent = JSON.stringify(languages);
  const links = languages.map(entry => new Element({ 'data-language-id': entry.id, href: entry.path }));
  const menu = new Element();
  const summary = new Element();
  summary.focus = () => { summary.focused = true; };
  menu.querySelector = selector => {
    assert.equal(selector, 'summary');
    return summary;
  };
  menu.querySelectorAll = selector => {
    assert.equal(selector, '[data-language-id]');
    return links;
  };
  const region = new Element();
  region.hidden = true;
  const suggestionLink = new Element({ href: '/' });
  const stay = new Element();
  const nodes = {
    '#homepage-languages': config,
    '.language-menu': menu,
    '#language-suggestion': localized ? null : region,
    '#language-suggestion-link': suggestionLink,
    '#language-suggestion-stay': stay
  };
  const document = new Element();
  document.readyState = 'loading';
  document.querySelector = selector => nodes[selector] || null;
  document.getElementById = id => nodes['#' + id] || null;
  document.documentElement = { lang: localized ? 'de' : 'en' };
  const navigation = [];
  const location = { pathname: localized ? '/de/' : '/', search: '', hash: '' };
  for (const name of ['assign', 'replace', 'reload']) {
    location[name] = value => { navigation.push([name, value]); };
  }
  Object.defineProperty(location, 'href', {
    get: () => 'https://yuntiandeng.com' + location.pathname,
    set: value => { navigation.push(['href', value]); }
  });
  const browserStorage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) {
      if (writeUnavailable) throw new Error('Storage is unavailable');
      values.set(key, value);
      writes.push([key, value]);
    }
  };
  const window = { document, navigator: { languages: preferences, language: preferences[0] } };
  Object.defineProperty(window, 'location', {
    get: () => location,
    set: value => { navigation.push(['window.location', value]); }
  });
  Object.defineProperty(window, 'localStorage', {
    get() {
      if (storageUnavailable) throw new Error('Storage is unavailable');
      return browserStorage;
    }
  });
  const context = { window, document, navigator: window.navigator, console };
  Object.defineProperty(context, 'location', {
    get: () => location,
    set: value => { navigation.push(['location', value]); }
  });
  Object.defineProperty(context, 'localStorage', { get: () => window.localStorage });
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), context, { filename: sourcePath });
  for (const callback of document.listeners.get('DOMContentLoaded') || []) callback();
  return { region, suggestionLink, stay, summary, links, values, writes, navigation };
}

test('the English homepage offers a native-language link without changing the URL', () => {
  const page = loadPage();
  assert.equal(page.region.hidden, false);
  assert.equal(page.suggestionLink.href, '/fr/');
  assert.equal(page.suggestionLink.textContent, language('fr').suggestion);
  assert.equal(page.suggestionLink.getAttribute('lang'), 'fr');
  assert.equal(page.suggestionLink.getAttribute('dir'), 'ltr');
  assert.equal(page.summary.focused, undefined);
  assert.deepEqual(page.navigation, []);
  assert.deepEqual(page.writes, []);
});

test('English-first and unsupported browser preferences show no suggestion', () => {
  for (const preferences of [['en-US', 'fr'], ['nl-NL'], []]) {
    const page = loadPage({ preferences });
    assert.equal(page.region.hidden, true);
    assert.deepEqual(page.navigation, []);
    assert.deepEqual(page.writes, []);
  }
});

test('accepting a suggestion saves the choice and leaves native link navigation intact', () => {
  const page = loadPage({ preferences: ['ar-EG'] });
  assert.equal(page.suggestionLink.getAttribute('dir'), 'rtl');
  const click = page.suggestionLink.click();
  assert.equal(page.values.get('homepage-language'), 'ar');
  assert.equal(page.suggestionLink.href, '/ar/');
  assert.equal(click.defaultPrevented, false);
  assert.deepEqual(page.navigation, []);
  const revisit = loadPage({ preferences: ['de'], storage: page.values });
  assert.equal(revisit.suggestionLink.href, '/ar/');
});

test('continuing in English dismisses the suggestion and remembers that choice', () => {
  const page = loadPage();
  page.stay.click();
  assert.equal(page.region.hidden, true);
  assert.equal(page.summary.focused, true);
  assert.equal(page.values.get('homepage-language'), 'en');
  const revisit = loadPage({ preferences: ['fr'], storage: page.values });
  assert.equal(revisit.region.hidden, true);
  assert.deepEqual(revisit.navigation, []);
});

test('direct language links are honored without overwriting the saved choice', () => {
  const page = loadPage({ localized: true, saved: 'fr', preferences: ['ar'] });
  assert.deepEqual(page.navigation, []);
  assert.deepEqual(page.writes, []);
  assert.equal(page.values.get('homepage-language'), 'fr');
  const japanese = page.links.find(link => link.getAttribute('data-language-id') === 'ja');
  const click = japanese.click();
  assert.equal(page.values.get('homepage-language'), 'ja');
  assert.equal(japanese.href, '/ja/');
  assert.equal(click.defaultPrevented, false);
});

test('blocked storage does not break suggestions or the language links', () => {
  for (const options of [{ storageUnavailable: true }, { writeUnavailable: true }]) {
    const page = loadPage(options);
    assert.equal(page.region.hidden, false);
    assert.doesNotThrow(() => page.suggestionLink.click());
    assert.doesNotThrow(() => page.links[1].click());
    assert.doesNotThrow(() => page.stay.click());
    assert.equal(page.region.hidden, true);
    assert.deepEqual(page.navigation, []);
  }
});
