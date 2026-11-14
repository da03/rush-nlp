"""Render the Chinese edition using the shared research layout and bibliography."""
import copy
import html
from html.parser import HTMLParser
import json
import re
from xml.etree import ElementTree as ET


def build(m):
    directory = m.ROOT / '_data/methods/zh'
    guides = json.loads((directory / 'guides.json').read_text())
    overlays = json.loads((directory / 'papers.json').read_text())
    meta = json.loads((directory / 'meta.json').read_text())
    ui = json.loads((directory / 'ui.json').read_text())
    ui.update({'Read ' + g['title']: '阅读' + g['title'] for g in guides})
    english_guides, english_papers = m.GUIDES, m.PAPERS
    assert [g['id'] for g in guides] == [g['id'] for g in english_guides]
    assert set(overlays) == {p['id'] for p in english_papers}
    allowed = {'summary', 'connection', 'abstract_zh'}
    assert all(set(p) <= allowed for p in overlays.values())
    for en, zh in zip(english_guides, guides):
        for key in ('id', 'original_papers', 'demo', 'related_guides', 'reading_order'):
            assert en.get(key) == zh.get(key), (en['id'], key)
        assert [s['id'] for s in en['sections']] == [s['id'] for s in zh['sections']]
        for a, b in zip(en['sections'], zh['sections']):
            assert a.get('citations') == b.get('citations')
            assert a.get('equation') == b.get('equation')
            assert a.get('code') == b.get('code')

    def local_url(value):
        for prefix in ('/research/', m.BASE + '/research/'):
            if value.startswith(prefix) and not value.startswith(prefix + ('zh/')):
                suffix = value[len(prefix):]
                if not suffix.startswith(('assets/', 'examples/')):
                    return prefix + 'zh/' + suffix
        return value

    def translate(value):
        core = value.strip()
        if core.endswith(' · Research notes'):
            title=core.removesuffix(' · Research notes')
            return ui.get(title,title)+' · 研究导读'
        translated = ui.get(core)
        if translated is None and core.endswith((' ↗',' →')):
            translated=ui.get(core[:-2])
            if translated is not None: translated += core[-2:]
        if translated is None:
            translated = core
            translated = re.sub(r'^First posted on arXiv: (.+)\. Citation year: (\d+)\.$', r'arXiv 首次公开：\1。引用年份：\2。', translated)
            translated = re.sub(r'^First public version: (.+)\. Citation year: (\d+)\.$', r'首次公开版本：\1。引用年份：\2。', translated)
            translated = re.sub(r' contributed equally\.$', ' 为共同第一作者。', translated)
            translated = re.sub(r'^(\d+) papers$', r'\1 篇论文', translated)
            translated = translated.replace(' · Research notes', ' · 研究导读')
        return value[:len(value)-len(value.lstrip())] + translated + value[len(value.rstrip()):]

    class ChineseHTML(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.out = []
            self.stack = []
            self.script_type = None

        def handle_decl(self, decl): self.out.append('<!' + decl + '>')
        def handle_comment(self, data): self.out.append('<!--' + data + '-->')
        def handle_entityref(self, name): self.out.append('&' + name + ';')
        def handle_charref(self, name): self.out.append('&#' + name + ';')

        def handle_starttag(self, tag, attrs):
            original = dict(attrs)
            result = []
            for key, value in attrs:
                if value is not None:
                    if key == 'href' and tag == 'a' and not original.get('hreflang'):
                        value = local_url(value)
                    if key == 'src' and value == '/research/assets/research.js':
                        value = '/research/assets/research.zh.js'
                    if key in ('title', 'alt', 'aria-label', 'placeholder') or (tag == 'meta' and key == 'content'):
                        value = translate(value)
                result.append(key if value is None else key + '="' + html.escape(value, quote=True) + '"')
            self.out.append('<' + tag + (' ' if result else '') + ' '.join(result) + '>')
            if tag not in {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}:
                self.stack.append(tag)
            if tag == 'script': self.script_type = original.get('type')

        def handle_startendtag(self, tag, attrs):
            self.handle_starttag(tag, attrs)
            self.out[-1] = self.out[-1][:-1] + '/>'
            if self.stack and self.stack[-1] == tag: self.stack.pop()

        def handle_endtag(self, tag):
            self.out.append('</' + tag + '>')
            if self.stack and self.stack[-1] == tag: self.stack.pop()
            if tag == 'script': self.script_type = None

        def handle_data(self, data):
            if self.stack and self.stack[-1] == 'script':
                if self.script_type == 'application/ld+json':
                    schema = json.loads(data)
                    if schema.get('@type') == 'ScholarlyArticle':
                        paper = copy.deepcopy(schema)
                        paper.pop('dateModified', None)
                        paper['@id'] = paper['@id'].replace('/research/zh/', '/research/')
                        paper['url'] = paper['@id']
                        paper['inLanguage'] = 'en'
                        schema = {'@context': 'https://schema.org', '@type': 'WebPage', 'url': schema['url'], 'name': schema['name'], 'description': schema['description'], 'inLanguage': 'zh-Hans', 'dateModified': schema['dateModified'], 'about': paper}
                    else:
                        schema['inLanguage'] = 'zh-Hans'
                        for field in ('headline', 'description'):
                            if field in schema: schema[field] = translate(schema[field])
                    data = json.dumps(schema, ensure_ascii=False).replace('</', '<\\/')
                self.out.append(data)
            elif any(tag in self.stack for tag in ('pre', 'code', 'style')):
                self.out.append(html.escape(data, quote=False))
            else:
                self.out.append(html.escape(translate(data), quote=False))

    original_emit = m.emit
    m.LANG = 'zh-Hans'
    m.PREFIX = '/research/zh/'
    m.GUIDES = guides
    page_dates = {p['path']: p['updated_at'] for p in meta['pages']}
    m.PAPERS = [{**p, **overlays[p['id']], 'updated_at': page_dates['papers/'+p['id']+'/'], 'description_language': 'zh-Hans', 'abstract_language': 'en'} for p in english_papers]
    m.GP = {g['id']: g for g in m.GUIDES}
    m.PP = {p['id']: p for p in m.PAPERS}
    m.PAGE_DATES = {p['path']: p['updated_at'] for p in meta['pages']}
    chinese_paths = []

    def emit(path, content):
        if path.endswith('.html'):
            parser = ChineseHTML()
            parser.feed(content)
            parser.close()
            content = ''.join(parser.out)
        elif path.endswith('.md') or path == 'llms.txt':
            for source, target in sorted(ui.items(), key=lambda item: -len(item[0])):
                content = content.replace('# ' + source + '\n', '# ' + target + '\n')
                content = content.replace('[' + source + ']', '[' + target + ']')
            content = content.replace('## References', '## 参考文献').replace('## Papers', '## 论文').replace('## Abstract', '## 原文摘要（英文）').replace('[Original paper]', '[论文原文]').replace('[Record and citation]', '[论文记录与引用]').replace('[Paper]', '[论文原文]').replace('[Code]', '[代码]')
            content = content.replace('# Research notes: language models and structured learning', '# 语言模型与结构化学习：中文研究导读').replace('> Methods, original papers, current connections, and citations.', '> 研究方法、原始论文、当前研究联系与引用。')
            content = content.replace(m.BASE + '/research/data/', m.BASE + '/research/zh/data/').replace('/research/zh/zh/', '/research/zh/')
        original_emit('zh/' + path, content)
        chinese_paths.append(path)

    m.emit = emit
    m.validate_inputs()
    m.build_index()
    for g in m.GUIDES: m.build_guide(g)
    for p in m.PAPERS: m.build_paper(p)
    m.build_bibliography()
    m.build_exports()

    # Both languages use exactly the original citation records; prose is localized.
    for p in english_papers:
        for suffix in ('.bib', '.csl.json'):
            assert (m.ROOT / ('research/data/papers/' + p['id'] + suffix)).read_bytes() == (m.ROOT / ('research/zh/data/papers/' + p['id'] + suffix)).read_bytes()

    # Expose Chinese descriptions from the existing English agent-facing entry points.
    def guide_translation(g):
        return {'url': m.BASE + m.PREFIX + g['id'] + '/', 'title': g['title'], 'description': g['description'], 'markdown_url': m.BASE + m.PREFIX + 'data/guides/' + g['id'] + '.md'}
    def paper_translation(p):
        return {'url': m.BASE + m.PREFIX + 'papers/' + p['id'] + '/', **overlays[p['id']]}
    for filename in ['papers.json', *['papers/' + p['id'] + '.json' for p in english_papers], 'guides.json', *['guides/' + g['id'] + '.json' for g in english_guides]]:
        target = m.ROOT / 'research/data' / filename
        data = json.loads(target.read_text())
        records = data if isinstance(data, list) else [data]
        for record in records:
            if 'original_papers' in record:
                record['translations'] = {'zh-Hans': guide_translation(m.GP[record['id']])}
                for paper in record.get('papers', []): paper['translations'] = {'zh-Hans': paper_translation(paper)}
            else:
                record['translations'] = {'zh-Hans': paper_translation(record)}
        target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    nav_path = m.ROOT / 'research/data/navigation.json'
    nav = json.loads(nav_path.read_text())
    nav['languages'] = {'en': m.BASE + '/research/', 'zh-Hans': m.BASE + '/research/zh/'}
    for g in nav['guides']: g['translations'] = {'zh-Hans': m.BASE + '/research/zh/' + g['url'].rstrip('/').split('/')[-1] + '/'}
    for p in nav['papers']: p['translations'] = {'zh-Hans': m.BASE + '/research/zh/papers/' + p['id'] + '/'}
    nav_path.write_text(json.dumps(nav, ensure_ascii=False, indent=2) + '\n')
    llms = m.ROOT / 'research/llms.txt'
    llms.write_text(llms.read_text() + '\n## 中文导读\n\n- [中文研究导读](' + m.BASE + '/research/zh/): 七个主题的研究导读，附交互示例、原始论文与引用下载。\n- [中文纯文本导读](' + m.BASE + '/research/zh/data/reading-list.md)\n- [中文论文描述 JSON](' + m.BASE + '/research/zh/data/papers.json)\n')

    namespace = 'http://www.sitemaps.org/schemas/sitemap/0.9'
    sitemap = ET.fromstring((m.ROOT / 'research/sitemap.xml').read_text())
    zh_sitemap = ET.Element('{' + namespace + '}urlset')
    for page in meta['pages']:
        entry = ET.SubElement(zh_sitemap, '{' + namespace + '}url')
        ET.SubElement(entry, '{' + namespace + '}loc').text = m.BASE + m.PREFIX + page['path']
        ET.SubElement(entry, '{' + namespace + '}lastmod').text = page['updated_at']
        sitemap.append(copy.deepcopy(entry))
    for filename, tree in [('research/sitemap.xml', sitemap), ('research/zh/sitemap.xml', zh_sitemap)]:
        (m.ROOT / filename).write_text('<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(tree, encoding='unicode') + '\n')
    javascript = (m.ROOT / 'research/assets/research.js').read_text()
    strings = json.loads((directory / 'javascript.json').read_text())
    for source, target in strings.items():
        literal = "'" + source + "'"
        assert literal in javascript, source
        javascript = javascript.replace(literal, json.dumps(target, ensure_ascii=False))
    (m.ROOT / 'research/assets/research.zh.js').write_text(javascript)
    m.emit = original_emit
