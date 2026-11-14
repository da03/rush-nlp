#!/usr/bin/env python3
"""Check bilingual routing, shared citations and local download destinations."""
from pathlib import Path
import json
import html
import re
import unittest
from html.parser import HTMLParser
from urllib.parse import urlparse, unquote
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://yuntiandeng.com'

class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.tags = []
        self.feed(text)
    def handle_starttag(self, tag, attrs): self.tags.append((tag, dict(attrs)))
    def matches(self, tag, **attrs):
        return [a for t,a in self.tags if t == tag and all(a.get(k)==v for k,v in attrs.items())]

class Locales(unittest.TestCase):
    def test_original_attribution_survives_each_reading_format(self):
        papers = {p['id']:p for p in json.loads((ROOT/'_data/methods/papers.json').read_text())}
        for locale in ('', 'zh/'):
            for guide in json.loads((ROOT/('_data/methods/'+locale+'guides.json')).read_text()):
                base = ROOT/('research/'+locale)
                page = (base/guide['id']/'index.html').read_text()
                opening = html.unescape(page.split('<div class="originals">', 1)[1].split('</div>', 1)[0])
                markdown = (base/'data/guides'/f"{guide['id']}.md").read_text()
                opening_md = markdown.split('## '+guide['sections'][0]['title'], 1)[0]
                data = json.loads((base/'data/guides'/f"{guide['id']}.json").read_text())
                schema = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>',page).group(1))
                self.assertEqual(data['original_references'], schema['citation'])
                self.assertEqual(len(schema['citation']),len(guide['original_papers']))
                for pid, citation in zip(guide['original_papers'],schema['citation']):
                    paper = papers[pid]
                    self.assertEqual(citation['url'],paper['paper_url'])
                    self.assertEqual(citation['datePublished'],str(paper['year']))
                    for value in (paper['title'],paper['paper_url'],str(paper['year'])):
                        self.assertIn(value,opening)
                        self.assertIn(value,opening_md)
                    names = [' '.join((a['given'],a['family'])).strip() for a in paper['authors']]
                    self.assertEqual([a['name'] for a in citation['author']],names)
                    for name in names:
                        self.assertIn(name,opening)
                        self.assertIn(name,opening_md)

    def test_reciprocal_routes(self):
        paths = json.loads((ROOT/'_data/methods/zh/meta.json').read_text())['pages']
        self.assertEqual(len(paths), 42)
        for entry in paths:
            for locale, language in [('', 'en'), ('zh/', 'zh-Hans')]:
                path = 'research/' + locale + entry['path']
                page = Page((ROOT/path/'index.html').read_text())
                self.assertEqual(page.matches('html')[0]['lang'], language)
                self.assertEqual(page.matches('link',rel='canonical')[0]['href'], BASE+'/'+path)
                alternate = {a['hreflang']:a['href'] for a in page.matches('link',rel='alternate') if 'hreflang' in a}
                self.assertEqual(alternate, {'en':BASE+'/research/'+entry['path'],'zh-Hans':BASE+'/research/zh/'+entry['path'],'x-default':BASE+'/research/'+entry['path']})
    def test_shared_paper_identity_and_citations(self):
        en = json.loads((ROOT/'research/data/papers.json').read_text())
        zh = json.loads((ROOT/'research/zh/data/papers.json').read_text())
        self.assertEqual([p['id'] for p in en],[p['id'] for p in zh])
        for a,b in zip(en,zh):
            for key in ('title','authors','year','venue','citation_key','doi','arxiv_id','arxiv_first_posted','abstract','paper_url'):
                self.assertEqual(a.get(key),b.get(key),(a['id'],key))
            self.assertTrue(any('\u4e00' <= c <= '\u9fff' for c in b['summary']))
            for suffix in ('.bib','.csl.json'):
                self.assertEqual((ROOT/('research/data/papers/'+a['id']+suffix)).read_bytes(),(ROOT/('research/zh/data/papers/'+a['id']+suffix)).read_bytes())
        for name in ('citations.bib','citations.csl.json'):
            self.assertEqual((ROOT/'research/data'/name).read_bytes(),(ROOT/'research/zh/data'/name).read_bytes())
    def test_internal_targets(self):
        for file in (ROOT/'research/zh').rglob('*.html'):
            for tag,a in Page(file.read_text()).tags:
                u=a.get('href',a.get('src',''))
                if not u.startswith(('/research/',BASE+'/research/')): continue
                path=unquote(urlparse(u).path)
                target=ROOT/path.lstrip('/')
                if path.endswith('/'):target=target/'index.html'
                self.assertTrue(target.is_file(),(file,u))
    def test_sitemap_matches_pages(self):
        ns={'s':'http://www.sitemaps.org/schemas/sitemap/0.9'}
        paths=json.loads((ROOT/'_data/methods/zh/meta.json').read_text())['pages']
        expected={BASE+'/research/zh/'+p['path']:p['updated_at'] for p in paths}
        actual={x.find('s:loc',ns).text:x.find('s:lastmod',ns).text for x in ET.parse(ROOT/'research/zh/sitemap.xml').getroot()}
        self.assertEqual(actual,expected)
        for url, modified in actual.items():
            page = (ROOT/(url.removeprefix(BASE+'/'))/'index.html').read_text()
            schema = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>',page).group(1))
            self.assertEqual(schema['dateModified'], modified, url)
        combined=[x.text for x in ET.parse(ROOT/'research/sitemap.xml').findall('.//s:loc',ns)]
        self.assertEqual(len(combined),len(set(combined)))
        self.assertTrue(expected.keys()<=set(combined))

if __name__ == '__main__': unittest.main()
