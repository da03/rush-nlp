#!/usr/bin/env python3
"""Validate built homepage editions: python3 scripts/test_homepage_locales.py --site _site."""
import argparse
import json
from pathlib import Path
import re
import unittest
from html import unescape
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit, unquote
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DOMAIN = 'https://yuntiandeng.com'
LANGUAGES = json.loads((ROOT / '_data/homepage_languages.json').read_text())

class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.raw = path.read_text()
        self.tags = []
        self.feed(self.raw)

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))

    def matches(self, tag, **attrs):
        return [a for t, a in self.tags if t == tag and all(a.get(k) == v for k, v in attrs.items())]

def main_html(path):
    return re.search(r'<main\b.*?</main>', path.read_text(), re.S).group(0)

class Homepages(unittest.TestCase):
    def pages(self):
        for language in LANGUAGES:
            yield language, Page(SITE / language['path'].strip('/') / 'index.html')

    def test_language_canonical_and_alternates(self):
        expected = {l['lang']: DOMAIN + l['path'] for l in LANGUAGES}
        expected['x-default'] = DOMAIN + '/'
        for language, page in self.pages():
            with self.subTest(language=language['id']):
                html = page.matches('html')[0]
                self.assertEqual(html['lang'], language['lang'])
                self.assertEqual(html.get('dir', 'ltr'), language['dir'])
                self.assertEqual(page.matches('link', rel='canonical')[0]['href'], DOMAIN + language['path'])
                self.assertEqual({a['hreflang']: a['href'] for a in page.matches('link', rel='alternate') if 'hreflang' in a}, expected)
                self.assertEqual(len(page.matches('h1')), 1)
                self.assertNotIn('{{', page.raw)
                self.assertNotIn('{%', page.raw)
                self.assertEqual(page.matches('a', **{'aria-current': 'page', 'hreflang': language['lang']})[0]['href'], language['path'])
                self.assertEqual([a['hreflang'] for a in page.matches('a') if 'hreflang' in a],
                                 [l['lang'] for l in LANGUAGES])

    def test_shared_person_and_localized_metadata(self):
        for language, page in self.pages():
            with self.subTest(language=language['id']):
                scripts = re.findall(r'<script type="application/ld\+json">(.*?)</script>', page.raw, re.S)
                graph = json.loads(scripts[0])['@graph']
                person = next(n for n in graph if n['@type'] == 'Person')
                profile = next(n for n in graph if n['@type'] == 'ProfilePage')
                self.assertEqual(person['name'], 'Yuntian Deng')
                self.assertEqual(person['@id'], DOMAIN + '/#person')
                self.assertEqual(profile['mainEntity'], {'@id': DOMAIN + '/#person'})
                self.assertEqual(profile['inLanguage'], language['lang'])
                if language['id'] not in ('en', 'zh'):
                    data = json.loads((ROOT / '_data/homepages' / (language['id'] + '.json')).read_text())
                    self.assertEqual(page.matches('meta', name='description')[0]['content'], data['description'])
                    self.assertIn('<title>' + data['seo_title'] + '</title>', unescape(page.raw))
                    self.assertEqual(len(re.findall(r'class="paper-citation" lang="en" dir="ltr"', page.raw)), 5)
                    for paper in data['papers']:
                        self.assertIn(paper['title'], unescape(page.raw))
                    for key in ('theme_dark', 'menu', 'skip'):
                        self.assertIn(data['labels'][key], unescape(page.raw))
                    for term in ('2311.01460', '2405.14838', '2023', 'Implicit CoT', 'latent reasoning', 'Internalized reasoning'):
                        self.assertIn(term, page.raw)

    def test_unique_ids_and_working_internal_links(self):
        for language, page in self.pages():
            ids = [a['id'] for _, a in page.tags if 'id' in a]
            self.assertEqual(len(ids), len(set(ids)), language['id'])
            for tag, attrs in page.tags:
                if tag not in ('a', 'img', 'script', 'link'):
                    continue
                href = attrs.get('href', attrs.get('src'))
                if href is None:
                    continue
                self.assertTrue(href, (language['id'], tag))
                u = urlsplit(urljoin(DOMAIN + language['path'], href))
                if u.netloc != 'yuntiandeng.com' or u.scheme not in ('http', 'https'):
                    continue
                path = unquote(u.path).lstrip('/')
                target = SITE / path
                if not path or path.endswith('/'):
                    target /= 'index.html'
                self.assertTrue(target.is_file(), (language['id'], href))
                if href == '#ask' and language['id'] == 'en':
                    continue  # The existing helper widget creates this target at runtime.
                if u.fragment and target.suffix == '.html':
                    self.assertTrue(Page(target).matches('a', name=u.fragment) or any(a.get('id') == u.fragment for _, a in Page(target).tags), (language['id'], href))

    def test_sitemap_and_agent_navigation(self):
        root = ET.parse(SITE / 'sitemap.xml')
        urls = [n.text for n in root.findall('.//{*}loc')]
        self.assertEqual(len(urls), len(set(urls)))
        guide = (SITE / 'llms.txt').read_text()
        for language in LANGUAGES:
            self.assertIn(DOMAIN + language['path'], urls)
            self.assertIn(f"[{language['label']}]({DOMAIN + language['path']})", guide)

    def test_existing_homepage_content_unchanged(self):
        if BASELINE is None:
            self.skipTest('Pass --baseline to compare existing content')
        for language in LANGUAGES:
            path = Path(language['path'].strip('/')) / 'index.html'
            if (BASELINE / path).is_file():
                self.assertEqual(main_html(BASELINE / path), main_html(SITE / path), path)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site', type=Path, required=True)
    parser.add_argument('--baseline', type=Path)
    args = parser.parse_args()
    SITE, BASELINE = args.site, args.baseline
    unittest.main(argv=[__file__], verbosity=2)
