#!/usr/bin/env python3
"""Build readable research guides and citation exports from one bibliography."""
from pathlib import Path
from datetime import date
import html
import json
import re
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://yuntiandeng.com'
PREFIX = '/research/'
LANG = 'en'
e = html.escape
META = json.loads((ROOT/'_data/methods/meta.json').read_text())
GUIDES = json.loads((ROOT/'_data/methods/guides.json').read_text())
PAPERS = json.loads((ROOT/'_data/methods/papers.json').read_text())
GP = {g['id']: g for g in GUIDES}
PP = {p['id']: p for p in PAPERS}
assert len(GP) == len(GUIDES) and len(PP) == len(PAPERS)
PAGE_DATES = {p['path']: p['updated_at'] for p in META['static_pages']}
PAGE_DATES.update({g['id']+'/': g['updated_at'] for g in GUIDES})
PAGE_DATES.update({'papers/'+p['id']+'/': p['updated_at'] for p in PAPERS})
GENERATED = []

def plain(s):
    return html.unescape(re.sub('<[^>]+>', '', s))

def markdown_text(s):
    """Keep inline link destinations available in the plain-text guide export."""
    def replace_link(match):
        href = html.unescape(match.group(1))
        if href.startswith('/'):
            href = BASE + href
        label = plain(match.group(2)).replace('[', r'\[').replace(']', r'\]')
        return '[' + label + '](' + href.replace(' ', '%20') + ')'
    return plain(re.sub(r'<a\b[^>]*href="([^"]+)"[^>]*>(.*?)</a>', replace_link, s, flags=re.S))

def url(path): return BASE + PREFIX + path
def guide_url(g): return PREFIX + g['id'] + '/'
def paper_url(p): return PREFIX + 'papers/' + p['id'] + '/'
def authors(p): return ', '.join((a['given']+' '+a['family']).strip() for a in p['authors'])
def publication(p):
    return p['venue'] if str(p['year']) in p['venue'] else p['venue']+' · '+str(p['year'])
def original_references(g):
    return [{'@type':'ScholarlyArticle','name':PP[i]['title'],
             'author':[{'@type':'Person','name':a['given']+' '+a['family']} for a in PP[i]['authors']],
             'datePublished':str(PP[i]['year']),'url':PP[i]['paper_url'],
             'isPartOf':{'@type':'CreativeWork','name':PP[i]['venue']}}
            for i in g['original_papers']]
def paragraph(s): return '<p>'+s+'</p>'
def name(p): return e(p['title'])

def emit(path, content):
    target = ROOT/'research'/path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content.rstrip()+'\n', encoding='utf-8')
    GENERATED.append(str(target.relative_to(ROOT)))

def json_emit(path, data): emit(path, json.dumps(data, ensure_ascii=False, indent=2)+'\n')

def bibtex(p):
    key = p.get('citation_key',p['id'])
    typ = p.get('bibtex_type','inproceedings')
    if p.get('publication_type')=='preprint':typ='misc'
    fields = [('title','{'+p['title']+'}'),('author',' and '.join(a['family']+', '+a['given'] for a in p['authors'])),('year',str(p['year'])),('journal' if typ=='article' else 'booktitle',p.get('container_title',p['venue'])),('url',p['paper_url'])]
    if typ=='misc':fields=[(k,v) for k,v in fields if k!='booktitle']
    for source_key,field in [('volume','volume'),('issue','number'),('pages','pages'),('article_number','pages')]:
        if p.get(source_key):fields.append((field,str(p[source_key]).replace('–','--')))
    if p.get('arxiv_id'):fields.extend([('eprint',p['arxiv_id']),('archivePrefix','arXiv')])
    if p.get('doi'): fields.append(('doi',p['doi']))
    return '@'+typ+'{'+key+',\n'+',\n'.join('  '+k+' = {'+v+'}' for k,v in fields)+'\n}\n'

def csl(p):
    out={'id':p.get('citation_key',p['id']),'type':'article-journal' if p.get('bibtex_type')=='article' else 'paper-conference','title':p['title'],'author':p['authors'],'issued':{'date-parts':[[p['year']]]},'container-title':p.get('container_title',p['venue']),'URL':p['paper_url']}
    if p.get('publication_type')=='preprint':out['type']='article';out['genre']='preprint';out['publisher']='arXiv'
    for key,field in [('volume','volume'),('issue','issue'),('pages','page'),('article_number','number')]:
        if p.get(key):out[field]=str(p[key])
    if p.get('doi'): out['DOI']=p['doi']
    return out

def paper_schema(p):
    out={'@context':'https://schema.org','@type':'ScholarlyArticle','@id':BASE+paper_url(p),'name':p['title'],'headline':p['title'],'author':[{'@type':'Person','name':a['given']+' '+a['family']} for a in p['authors']],'datePublished':str(p['year']),'description':plain(p['summary']),'url':BASE+paper_url(p),'sameAs':p['paper_url'],'isPartOf':{'@type':'CreativeWork','name':p['venue']}}
    identifiers=[]
    if p.get('doi'):identifiers.append({'@type':'PropertyValue','propertyID':'DOI','value':p['doi']})
    if p.get('arxiv_id'):identifiers.append({'@type':'PropertyValue','propertyID':'arXiv','value':p['arxiv_id']})
    if identifiers:out['identifier']=identifiers
    if p.get('abstract'):out['abstract']=p['abstract']
    return out

def layout(title, desc, path, body, active='guides', paper=None):
    canonical=url(path)
    english_url=BASE+'/research/'+path
    chinese_url=BASE+'/research/zh/'+path
    translations_ready=(ROOT/'_data/methods/zh/guides.json').exists()
    alternates=(f'<link rel="alternate" hreflang="en" href="{english_url}"><link rel="alternate" hreflang="zh-Hans" href="{chinese_url}"><link rel="alternate" hreflang="x-default" href="{english_url}">' if translations_ready else '')
    language_nav=(f'<a href="{chinese_url}" hreflang="zh-Hans" lang="zh-Hans">简体中文</a>' if LANG=='en' else f'<a href="{english_url}" hreflang="en" lang="en">English</a>') if translations_ready else ''
    updated_at=PAGE_DATES[path]
    guide=GP.get(path.rstrip('/'))
    json_path='data/papers/'+paper['id']+'.json' if paper else 'data/guides/'+guide['id']+'.json' if guide else 'data/papers.json'
    markdown_path='data/papers/'+paper['id']+'.md' if paper else 'data/guides/'+guide['id']+'.md' if guide else 'data/reading-list.md'
    extra=''
    if paper:
        extra='<meta name="citation_title" content="'+e(paper['title'],quote=True)+'">\n'
        extra+=''.join('<meta name="citation_author" content="'+e(a['given']+' '+a['family'],quote=True)+'">\n' for a in paper['authors'])
        extra+='<meta name="citation_publication_date" content="'+str(paper['year'])+'">\n'
        field='citation_journal_title' if paper.get('bibtex_type')=='article' else 'citation_conference_title'
        extra+='<meta name="'+field+'" content="'+e(paper.get('container_title',paper['venue']),quote=True)+'">\n'
        if paper.get('pdf_url','').startswith(canonical):extra+='<meta name="citation_pdf_url" content="'+e(paper['pdf_url'],quote=True)+'">\n'
        if paper.get('arxiv_id'):extra+='<meta name="citation_arxiv_id" content="'+paper['arxiv_id']+'">\n'
        if paper.get('doi'):extra+='<meta name="citation_doi" content="'+e(paper['doi'],quote=True)+'">\n'
        schema=paper_schema(paper)
    else:
        schema={'@context':'https://schema.org','@type':'CollectionPage' if active in ['papers','data'] else 'Article','headline':title,'description':desc,'url':canonical,'author':{'@type':'Person','name':'Yuntian Deng','url':BASE}}
        if guide: schema['citation']=original_references(guide)
    schema['dateModified']=updated_at
    nav=''.join('<a href="'+PREFIX+dest+'"'+(' aria-current="page"' if key==active else '')+'>'+label+'</a>' for key,label,dest in [('guides','Guides',''),('papers','Papers','papers/'),('data','Citations & data','data/')])
    return f'''<!doctype html>
<html lang="{LANG}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)} · Research notes</title><meta name="description" content="{e(desc,quote=True)}">
<link rel="canonical" href="{canonical}">{alternates}<meta property="og:title" content="{e(title,quote=True)}"><meta property="og:description" content="{e(desc,quote=True)}"><meta property="og:type" content="article"><meta property="og:url" content="{canonical}"><meta name="twitter:card" content="summary">
<link rel="icon" href="/images/favicon.ico"><link rel="stylesheet" href="/research/assets/research.css">
<link rel="alternate" type="application/json" href="{PREFIX+json_path}" title="Machine-readable content"><link rel="alternate" type="text/markdown" href="{PREFIX+markdown_path}" title="Plain-text reading"><link rel="describedby" type="application/json" href="/research/data/navigation.json">
{extra}<script type="application/ld+json">{json.dumps(schema,ensure_ascii=False).replace('</','<\\/')}</script>
<script src="/research/assets/research.js" defer></script></head><body>
<a class="skip" href="#main">Skip to main content</a><header class="shell topbar"><a class="wordmark" href="/research/">Research notes<span>Language models & structured learning</span></a><nav class="nav" aria-label="Main navigation">{nav}{language_nav}<a href="/">Yuntian Deng ↗</a></nav></header>
<main id="main" class="shell">{body}</main><footer class="shell footer"><div><p>Research notes by <a href="/">Yuntian Deng</a>.</p></div><div><p><a href="/research/about/">About this collection</a> · <a href="/research/data/navigation.json">URL directory</a> · <a href="/research/data/reading-list.md">Markdown</a></p></div></footer></body></html>'''

def ref_links(ids):
    return '<p class="sources">Sources: '+''.join('<a href="'+paper_url(PP[i])+'">'+e(PP[i].get('short_title',PP[i]['title']))+'</a>' for i in ids)+'</p>' if ids else ''

def table(cols, rows, tid=''):
    return '<div class="table-wrap"><table'+(' id="'+tid+'"' if tid else '')+'><thead><tr>'+''.join('<th scope="col">'+x+'</th>' for x in cols)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+x+'</td>' for x in row)+'</tr>' for row in rows)+'</tbody></table></div>'

def bar(id,label,value,alt=False):
    return '<div class="bar-row'+(' alt' if alt else '')+'" id="'+id+'"><span>'+label+'</span><div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:'+str(value*100)+'%"></div></div><span class="number">'+f'{value*100:.1f}'+'%</span></div>'

def demo(kind):
    demos={
    'tree':'''<label for="tree-example">Choose a message</label><select id="tree-example"><option value="how">A how-to question</option><option value="bug">A bug report</option><option value="praise">Positive feedback</option></select><blockquote id="tree-input">How do I export my notes?</blockquote><div class="node active"><span class="node-label">Prompt at the first node</span><strong>Does the message ask for help?</strong></div><p class="branch-label">Response: <b id="tree-answer-1">Yes</b></p><div class="node"><span class="node-label">Prompt selected by that response</span><strong id="tree-question-2">Does the message describe a failure?</strong></div><p class="branch-label">Response: <b id="tree-answer-2">No</b></p><p class="result" id="tree-leaf">How-to question</p><p class="trace" id="tree-trace" role="status" aria-live="polite">A prompt response selects the next branch and ultimately a class.</p>''',
    'energy':'''<div class="math">p(x) ∝ p<sub>base</sub>(x) exp(−β E(x))</div><div class="demo-controls"><label for="energy-strength">Energy strength β: <output id="energy-strength-value">1.0</output><input id="energy-strength" type="range" min="0" max="3" step="0.1" value="1"></label></div><div class="demo-grid"><div><h3>Base candidates</h3>'''+bar('energy-base-0','Candidate A',.6)+bar('energy-base-1','Candidate B',.3)+bar('energy-base-2','Candidate C',.1)+'''<p class="note">E(A) = 2.0 · E(B) = 0.4 · E(C) = 0.0</p></div><div><h3>After energy correction</h3>'''+bar('energy-output-0','Candidate A',.212,True)+bar('energy-output-1','Candidate B',.526,True)+bar('energy-output-2','Candidate C',.262,True)+'''</div></div><p id="energy-caption" role="status" aria-live="polite" class="trace">The sequence score changes the relative probability of complete candidates.</p>''',
    'lattice':'''<p>Independent predictions: <strong>cats 0.55 / cat 0.45</strong>, then <strong>sleeps 0.60 / sleep 0.40</strong>.</p><label for="lattice-mode">Path scoring</label><select id="lattice-mode"><option value="independent">Independent token probabilities</option><option value="joint">Add adjacent-pair compatibility</option></select>'''+table(['Candidate path','Score','Selection'],[['the cats sleeps','0.330','Highest score'],['the cats sleep','0.220',''],['the cat sleeps','0.270',''],['the cat sleep','0.180','']],'lattice-table')+'''<p class="result" id="lattice-output" role="status" aria-live="polite">the cats sleeps</p><p id="lattice-explanation" class="trace">Independent choices select a mismatched subject and verb.</p><p class="note">Compatibility is 0.9 for matching number and 0.1 otherwise. Scores are unnormalized path products.</p>''',
    'attention':'''<p>Two possible latent values: <strong>z = 0</strong> and <strong>z = 4</strong>. The nonlinear prediction is f(z) = sigmoid(z).</p><label for="attention-probability">Probability of z = 4: <output id="attention-probability-value">50.0%</output><input id="attention-probability" type="range" min="0" max="1" step="0.01" value="0.5"></label>'''+bar('attention-state-0','P(z = 0)',.5)+bar('attention-state-1','P(z = 4)',.5)+'''<div class="demo-grid"><div class="node"><span class="node-label">Average, then predict</span><strong>f(E[z]) = <output id="attention-deterministic">0.881</output></strong></div><div class="node"><span class="node-label">Predict, then marginalize</span><strong>E[f(z)] = <output id="attention-marginal">0.741</output></strong></div></div><p id="attention-gap" role="status" aria-live="polite" class="trace">Difference: 0.140</p>''',
    'structure':'''<label for="structure-order">Choose a document structure</label><select id="structure-order"><option value="ordered">Progressing sections</option><option value="loop">Repeating sections</option></select><div class="math" id="structure-sequence">Introduction → method → results → conclusion</div><p class="result" id="structure-result" role="status" aria-live="polite">The section order progresses through the document.</p><p class="note">A critic maps text to a structural representation. The paper compares distributions of these representations over real and generated corpora.</p>''',
    'markup':'''<div class="domain-grid"><div class="domain"><h3>Mathematical formulas</h3><code>\\frac{a}{b} + c^2</code><p>LaTeX → formula image</p></div><div class="domain"><h3>Molecular drawings</h3><code>CC(=O)O</code><p>SMILES → molecule image</p></div><div class="domain"><h3>Table layouts</h3><code>&lt;table&gt;…&lt;/table&gt;</code><p>HTML → table image</p></div><div class="domain"><h3>Sheet music</h3><code>{ c'4 d' e' f' }</code><p>LilyPond → score image</p></div></div><p><a class="button" href="https://huggingface.co/spaces/yuntian-deng/latex2im">Open the LaTeX rendering demo ↗</a></p><p class="note">The four input examples illustrate the task formats. Generated outputs and experiments are in the original paper and repository.</p>''',
    'training':'''<div class="demo-grid"><div class="node"><span class="node-label">Current step</span><strong id="training-step">10</strong></div><div class="node"><span class="node-label">Applied learning rate</span><strong id="training-rate">0.0010</strong></div></div><div class="demo-controls"><div><label for="training-new-rate">Request a learning rate</label><select id="training-new-rate"><option value="0.0001">0.0001</option><option value="0.0005">0.0005</option><option value="0.001">0.0010</option></select></div><button id="training-request" type="button">Request change</button><button id="training-next" type="button">Next control point</button><button id="training-reset" type="button" class="secondary">Reset</button></div><p class="trace" id="training-pending">No pending action</p><pre class="training-log" id="training-log" aria-live="polite">Step 10 · learning rate 0.001 · no pending action</pre><p><a href="https://interactivetraining.ai/">Open the real Interactive Training demo ↗</a></p>'''
    }
    titles={'tree':'Follow the prompted decisions','energy':'Reweight complete candidates','lattice':'Independent choices, joint paths','attention':'An average is not a marginal','structure':'Fluency leaves structure unresolved','markup':'Four structured inputs, four image domains','training':'Request, apply, observe'}
    captions={'tree':'Route a message using fixed questions and recorded answers. The paper learns the tree and prompts from labeled examples.','energy':'Adjust β to reweight three candidates with fixed base probabilities and energies.','lattice':'Compare independent token scoring with adjacent-pair compatibility in a four-path lattice with hand-chosen probabilities.','attention':'Change the probability of the latent state to compare f(E[z]) with E[f(z)] for a sigmoid predictor.','structure':'Switch between two example section sequences to compare progression and repetition.','markup':'The original task learns the direction from markup to rendered image.','training':'Simulate a request to change the learning rate and advance to the control point where it takes effect.'}
    return '<section class="demo" id="'+kind+'-demo" aria-labelledby="demo-title"><p class="kicker">Work through an example</p><h2 id="demo-title">'+titles[kind]+'</h2><p class="caption">'+captions[kind]+'</p>'+demos[kind]+'<noscript><p class="note">The example above shows its initial state. Enable JavaScript to change its inputs.</p></noscript></section>'

def render_section(s):
    out='<section id="'+e(s['id'])+'"><h2>'+e(s['title'])+'</h2>'
    out+=''.join(paragraph(x) for x in s.get('paragraphs',[]))
    if s.get('figures'):
        out+='<div class="rendering-gallery">'+''.join('<figure><img src="'+e(f['src'],quote=True)+'" alt="'+e(f['alt'],quote=True)+'" width="'+str(f['width'])+'" height="'+str(f['height'])+'" loading="lazy"><figcaption>'+e(f['caption'])+'</figcaption></figure>' for f in s['figures'])+'</div>'
    if s.get('equation'):out+='<div class="math">'+s['equation']+'</div>'
    if s.get('items'):out+='<ul>'+''.join('<li>'+x+'</li>' for x in s['items'])+'</ul>'
    if s.get('table'):out+=table(s['table']['columns'],s['table']['rows'])
    if s.get('code'):out+='<pre><code>'+e(s['code'])+'</code></pre>'
    out+=ref_links(s.get('citations',[]))+'</section>'
    return out

def markdown_guide(g):
    text='# '+g['title']+'\n\n'+markdown_text(g['lead'])+'\n\n'
    text+='## Original research\n\n'
    for pid in g['original_papers']:
        p=PP[pid]
        text+='- '+authors(p)+'. ['+p['title']+']('+p['paper_url']+'). '+publication(p)+'. [Record and citation]('+BASE+paper_url(p)+'#citation).\n'
    text+='\n'
    for s in g['sections']:
        text+='## '+s['title']+'\n\n'+'\n\n'.join(markdown_text(x) for x in s.get('paragraphs',[]))+'\n\n'
        if s.get('items'):text+='\n'.join('- '+markdown_text(x) for x in s['items'])+'\n\n'
        for f in s.get('figures',[]):
            text+='!['+f['alt']+']('+BASE+f['src']+')\n\n'+f['caption']+'\n\n'
        if s.get('table'):
            cols=s['table']['columns'];text+='| '+' | '.join(plain(x).replace('|','\\|') for x in cols)+' |\n| '+' | '.join('---' for _ in cols)+' |\n'
            text+='\n'.join('| '+' | '.join(plain(x).replace('|','\\|') for x in row)+' |' for row in s['table']['rows'])+'\n\n'
        for pid in s.get('citations',[]):text+='- ['+PP[pid]['title']+']('+PP[pid]['paper_url']+')\n'
        text+='\n'
    text+='## References\n\n'
    for pid in g['reading_order']:
        p=PP[pid];text+='- '+authors(p)+'. '+p['title']+'. '+p['venue']+'. '+p['paper_url']+'\n'
    return text

def build_guide(g):
    originals='<div class="originals"><p class="kicker">Original research</p>'+''.join('<p><a href="'+e(PP[i]['paper_url'],quote=True)+'">'+name(PP[i])+'</a><br>'+e(authors(PP[i]))+' · '+e(publication(PP[i]))+'<br><a class="citation-link" href="'+paper_url(PP[i])+'#citation">Record and citation</a></p>' for i in g['original_papers'])+'</div>'
    hero='<div class="back"><a href="/research/">← All guides</a></div><header class="hero"><p class="kicker">'+e(g['eyebrow'])+'</p><h1>'+e(g['title'])+'</h1><p class="lead">'+g['lead']+'</p>'+originals+'</header>'
    toc='<aside class="toc"><h2>In this guide</h2><nav aria-label="On this page">'+''.join('<a href="#'+s['id']+'">'+e(s['title'])+'</a>' for s in g['sections'])+'<a href="#reading-list">Papers & implementations</a></nav><div class="terms">'+''.join('<span class="tag">'+e(t)+'</span>' for t in g['terms'])+'</div><p><a href="/research/data/guides/'+g['id']+'.md">Read as Markdown ↗</a></p></aside>'
    content=demo(g['demo'])+''.join(render_section(s) for s in g['sections'])
    content+='<section id="reading-list"><h2>Papers & implementations</h2>'
    for pid in g['reading_order']:
        p=PP[pid]
        content+='<article class="reading"><p class="kicker">'+e(p['venue'])+'</p><h3><a href="'+paper_url(p)+'">'+name(p)+'</a></h3><p class="authors">'+e(authors(p))+'</p><p>'+p['summary']+'</p><p>'+p.get('connection','')+'</p><div class="paper-links"><a href="'+e(p['paper_url'],quote=True)+'">Paper ↗</a><a href="'+paper_url(p)+'#citation">Citation</a>'+('<a href="'+e(p['code_url'],quote=True)+'">Code ↗</a>' if p.get('code_url') else '')+'</div></article>'
    content+='</section><div class="related">'+''.join('<a href="'+guide_url(GP[i])+'">'+e(GP[i]['title'])+' →</a>' for i in g.get('related_guides',[]) if i in GP)+'</div>'
    emit(g['id']+'/index.html',layout(g['title'],g['description'],g['id']+'/',hero+'<div class="article-grid"><div class="prose">'+content+'</div>'+toc+'</div>'))
    emit('data/guides/'+g['id']+'.md',markdown_guide(g))
    json_emit('data/guides/'+g['id']+'.json',{**g,'url':BASE+guide_url(g),'original_references':original_references(g),'papers':[PP[i] for i in g['reading_order']]})

def build_paper(p):
    body='<div class="back"><a href="/research/papers/">← Bibliography</a></div><header class="hero"><p class="kicker">'+e(p['venue'])+'</p><h1>'+name(p)+'</h1><p class="lead">'+e(authors(p))+'</p>'
    if p.get('equal_contribution'):body+='<p class="meta">'+e(' and '.join(p['equal_contribution']))+' contributed equally.</p>'
    if p.get('arxiv_first_posted'):body+='<p class="meta">First posted on arXiv: '+e(p['arxiv_first_posted'])+'. Citation year: '+str(p['year'])+'.</p>'
    elif p.get('first_public'):body+='<p class="meta">First public version: '+e(p['first_public'])+'. Citation year: '+str(p['year'])+'.</p>'
    body+='<div class="actions"><a class="button" href="'+e(p['paper_url'],quote=True)+'">Read the paper ↗</a>'+('<a class="button secondary" href="'+e(p['code_url'],quote=True)+'">Code ↗</a>' if p.get('code_url') else '')+'</div></header><div class="prose"><section><h2>Method and contribution</h2><p>'+p['summary']+'</p><p>'+p.get('connection','')+'</p></section>'
    if p.get('abstract'):body+='<section id="abstract"><h2>Abstract</h2><p>'+e(p['abstract'])+'</p></section>'
    if p.get('pdf_url'):body+='<p><a href="'+e(p['pdf_url'],quote=True)+'">Read the full paper PDF ↗</a></p>'
    related=[g for g in GUIDES if p['id'] in g['reading_order']]
    body+='<section><h2>Read in context</h2>'+''.join('<p><a href="'+guide_url(g)+'">'+e(g['title'])+' →</a></p>' for g in related)+'</section><section id="citation"><h2>Citation</h2><p>'+e(authors(p))+'. '+name(p)+'. '+e(p['venue'])+'.</p><div class="code-actions"><button type="button" data-copy="#bibtex" data-status="#copy-status">Copy BibTeX</button><a class="button secondary" href="/research/data/papers/'+p['id']+'.bib" download>Download BibTeX</a><a class="button secondary" href="/research/data/papers/'+p['id']+'.csl.json" download>CSL JSON</a></div><p id="copy-status" class="status-message" role="status"></p><pre id="bibtex">'+e(bibtex(p))+'</pre></section></div>'
    emit('papers/'+p['id']+'/index.html',layout(p['title'],plain(p['summary']), 'papers/'+p['id']+'/',body,'papers',p))
    json_emit('data/papers/'+p['id']+'.json',{**p,'record_url':BASE+paper_url(p)})
    json_emit('data/papers/'+p['id']+'.csl.json',[csl(p)])
    emit('data/papers/'+p['id']+'.bib',bibtex(p))
    paper_md='# '+p['title']+'\n\n'+authors(p)+'. '+p['venue']+' ('+str(p['year'])+').\n\n'+plain(p['summary'])+'\n\n'+plain(p.get('connection',''))+'\n\n'
    if p.get('abstract'):paper_md+='## Abstract\n\n'+p['abstract']+'\n\n'
    paper_md+='[Original paper]('+p['paper_url']+')\n\n## Citation\n\n```bibtex\n'+bibtex(p)+'```\n'
    emit('data/papers/'+p['id']+'.md',paper_md)

def build_index():
    figure='''<figure class="cover-figure"><svg viewBox="0 0 520 365" role="img" aria-labelledby="cover-title cover-desc"><title id="cover-title">Three ways to structure model decisions</title><desc id="cover-desc">A branching prompt tree, a sequence-level energy score, and jointly scored candidate paths.</desc><g stroke="#94aa96" fill="none" stroke-width="1.5"><path d="M260 64V91M260 91H115V120M260 91H405V120M115 165V192M405 165V192M65 264L165 307M65 307L165 264M165 264L265 264M165 307L265 307M265 264L365 307M265 307L365 264M365 264L465 264M365 307L465 307"/></g><g fill="#fffefb" stroke="#22604d"><rect x="185" y="22" width="150" height="45" rx="4"/><rect x="40" y="120" width="150" height="45" rx="4"/><rect x="330" y="120" width="150" height="45" rx="4"/><rect x="40" y="193" width="150" height="32" rx="4"/><rect x="330" y="193" width="150" height="32" rx="4"/></g><g fill="#18352d" text-anchor="middle" font-family="Georgia" font-size="16"><text x="260" y="51">Ask a question</text><text x="115" y="149">Score a sequence</text><text x="405" y="149">Model a dependency</text></g><g fill="#526b5d" text-anchor="middle" font-family="system-ui" font-size="12"><text x="115" y="213">GLOBAL DISTRIBUTION</text><text x="405" y="213">JOINT CHOICES</text><text x="260" y="352">Structured decisions across language models</text></g><path d="M65 264L165 307L265 307L365 264L465 264" stroke="#af472c" stroke-width="3" fill="none"/><g fill="#22604d">'''+''.join(f'<circle cx="{x}" cy="{y}" r="7"/>' for x in [65,165,265,365,465] for y in [264,307])+'''</g></svg><figcaption>Questions, distributions, and paths through possible outputs.</figcaption></figure>'''
    body='<header class="hero hero-grid"><div><p class="kicker">Methods & connections</p><h1>How models choose,<br>generate, and learn.</h1><p class="lead">Seven guides to language-model decisions: prompted trees, sequence energies, probabilistic attention, structured decoding, text evaluation, learned rendering, and live training.</p><p>Start with a concrete example. Follow the method to its original paper and its connections to current research.</p><div class="actions"><a class="button" href="#guides">Explore the guides ↓</a><a class="button secondary" href="/research/papers/">Browse the papers</a></div></div>'+figure+'</header><section id="guides"><div class="section-top"><h2>Find the idea behind the method.</h2><p>Seven guides · Original papers & current connections</p></div>'
    for i,g in enumerate(GUIDES,1):
        body+='<article class="guide-row"><span class="guide-no">'+str(i).zfill(2)+'</span><div><h3><a href="'+guide_url(g)+'">'+e(g['title'])+'</a></h3><span class="category">'+e(g['eyebrow'])+'</span></div><p>'+e(g['description'])+'</p><a class="arrow" href="'+guide_url(g)+'" aria-label="Read '+e(g['title'],quote=True)+'">↗</a></article>'
    body+='</section><section class="home-bottom"><div><p class="kicker">Follow a research question</p><h2>From the original formulation to today’s systems.</h2><p>Compare how each method represents a problem, learns from data, and selects its predictions.</p><a href="/research/structured-decoding/">Explore joint decoding →</a></div><div><p class="kicker">Use the references</p><h2>Paper links and citations.</h2><p>Find full author lists and original paper links. Download citations in BibTeX or CSL JSON and read the guides in Markdown.</p><a href="/research/data/">Citations & downloads →</a></div></section>'
    emit('index.html',layout('Research notes: language models and structured learning','Guides to prompted decision trees, energy-based generation, probabilistic attention, joint decoding, text evaluation, learned rendering, and live training.','',body))

def build_bibliography():
    body='<header class="hero"><p class="kicker">Annotated bibliography</p><h1>Read the methods<br>in context.</h1><p class="lead">Original formulations and the research connected to them, with complete references and direct paper links.</p></header><div class="filters"><div><label for="paper-search">Search titles, authors, methods</label><input id="paper-search" type="search" placeholder="For example: diffusion, attention, Viterbi" autocomplete="off"></div><div><label for="paper-topic">Guide</label><select id="paper-topic"><option value="all">All guides</option>'+''.join('<option value="'+g['id']+'">'+e(g['title'])+'</option>' for g in GUIDES)+'</select></div><button id="paper-reset" class="secondary" type="button">Reset filters</button></div><p id="result-count" role="status">'+str(len(PAPERS))+' papers</p><p id="empty-results" hidden>No matching papers. Try another phrase or reset the filters.</p><noscript><p>All papers are shown below. Search and filters require JavaScript.</p></noscript>'
    for p in sorted(PAPERS,key=lambda x:(x['year'],x.get('first_public',''),x['title'])):
        topics=' '.join(g['id'] for g in GUIDES if p['id'] in g['reading_order'])
        searchable=' '.join([p['title'],authors(p),plain(p['summary']),plain(p.get('connection','')),topics])
        body+='<article class="paper-row" data-topics="'+topics+'" data-search="'+e(searchable,quote=True)+'"><div class="paper-year">'+str(p['year'])+'</div><div><h2><a href="'+paper_url(p)+'">'+name(p)+'</a></h2><p class="authors">'+e(authors(p))+' · '+e(p['venue'])+'</p><p>'+p['summary']+'</p><div class="paper-links"><a href="'+paper_url(p)+'">Notes & citation</a><a href="'+e(p['paper_url'],quote=True)+'">Paper ↗</a>'+('<a href="'+e(p['code_url'],quote=True)+'">Code ↗</a>' if p.get('code_url') else '')+'</div></div></article>'
    emit('papers/index.html',layout('Papers on language models and structured learning','An annotated bibliography with original methods, current connections, full authors, and reusable citations.','papers/',body,'papers'))

def build_exports():
    json_emit('data/papers.json',[{**p,'record_url':BASE+paper_url(p)} for p in PAPERS])
    json_emit('data/guides.json',[{**g,'url':BASE+guide_url(g),'markdown_url':url('data/guides/'+g['id']+'.md'),'original_references':original_references(g)} for g in GUIDES])
    json_emit('data/citations.csl.json',[csl(p) for p in PAPERS])
    emit('data/citations.bib','\n'.join(bibtex(p) for p in PAPERS))
    md='# Research notes: language models and structured learning\n\n'
    for g in GUIDES:md+='- ['+g['title']+']('+BASE+guide_url(g)+') — '+g['description']+'\n'
    md+='\n## Papers\n\n'
    for p in PAPERS:md+='### '+p['title']+'\n\n'+authors(p)+'. '+p['venue']+'.\n\n'+plain(p['summary'])+'\n\n'+plain(p.get('connection',''))+'\n\n[Paper]('+p['paper_url']+') · [Record and citation]('+BASE+paper_url(p)+')\n\n'
    emit('data/reading-list.md',md)
    emit('llms.txt','# Research notes: language models and structured learning\n\n> Methods, original papers, current connections, and citations.\n\n'+''.join('- ['+g['title']+']('+BASE+guide_url(g)+'): '+g['description']+'\n' for g in GUIDES)+'\n- [Annotated bibliography]('+url('data/reading-list.md')+')\n- [Bibliography JSON]('+url('data/papers.json')+')\n- [URL directory]('+url('data/navigation.json')+')\n')
    navigation={'title':'Research notes','updated':PAGE_DATES['data/'],'home':url(''),'bibliography':url('papers/'),'downloads':url('data/'),'guides':[{'title':g['title'],'url':BASE+guide_url(g),'markdown':url('data/guides/'+g['id']+'.md'),'original_papers':g['original_papers']} for g in GUIDES],'papers':[{'id':p['id'],'title':p['title'],'record':BASE+paper_url(p),'source':p['paper_url'],'json':url('data/papers/'+p['id']+'.json'),'bibtex':url('data/papers/'+p['id']+'.bib'),'csl':url('data/papers/'+p['id']+'.csl.json')} for p in PAPERS]}
    json_emit('data/navigation.json',navigation)
    items=[('Annotated bibliography','papers.json','JSON; full metadata and method notes'),('Citation library','citations.bib','BibTeX'),('Citation library','citations.csl.json','CSL JSON'),('Readable bibliography','reading-list.md','Markdown'),('Guide contents','guides.json','JSON; descriptions and sections'),('URL directory','navigation.json','JSON; guides, records, and citation files')]
    body='<header class="hero"><p class="kicker">Citations & data</p><h1>Citations and downloads.</h1><p class="lead">Download the bibliography, follow the original sources, or read the guides as plain text.</p></header><ul class="data-list">'+''.join('<li><a href="'+fn+'" download>'+label+' ↗</a><span>'+desc+'</span></li>' for label,fn,desc in items)+'</ul><section class="home-bottom"><div><h2>Individual papers</h2><p>Each paper record includes a copyable citation and individual BibTeX, CSL JSON and metadata downloads.</p><a href="/research/papers/">Browse paper records →</a></div><div><h2>Plain-text guides</h2>'+''.join('<p><a href="guides/'+g['id']+'.md">'+e(g['title'])+'</a></p>' for g in GUIDES)+'</div></section>'
    emit('data/index.html',layout('Citations and research data','Download the annotated bibliography, BibTeX, CSL JSON, Markdown guides, and a directory of research sources.','data/',body,'data'))
    body='<header class="hero"><p class="kicker">About</p><h1>A collection of methods<br>and their connections.</h1><p class="lead">These notes explain research on language models and structured learning, from original formulations to current applications.</p></header><div class="prose"><section><h2>How to use the collection</h2><p>Start with a guide, try its interactive example, and compare the methods. Follow the paper links for derivations, experiments, and implementations.</p></section><section><h2>Sources and authorship</h2><p>The collection is written by Yuntian Deng, an author of the original papers highlighted in these guides. Each paper record lists all authors. The guides compare the original methods with research on diffusion language models, agent decision trees, and training control.</p><p>Paper records list publication years and dates of first public versions so you can trace when a method was introduced and cite its published version.</p></section><section><h2>Reusable formats</h2><p>Use BibTeX or CSL JSON with a reference manager, or read and annotate the Markdown guides. <a href="/research/data/">Download the bibliography and guide contents</a>.</p></section></div>'
    emit('about/index.html',layout('About the research notes','Research guides, interactive examples, original papers, and citation downloads.','about/',body,'data'))

def validate_inputs():
    assert set(p['path'] for p in META['static_pages']) == {'', 'papers/', 'data/', 'about/'}
    assert len(PAGE_DATES) == len(META['static_pages']) + len(GUIDES) + len(PAPERS)
    for value in [*PAGE_DATES.values(), META['references_checked_at']]:
        assert date.fromisoformat(value).isoformat() == value
    for g in GUIDES:
        assert g['demo'] in {'tree','energy','lattice','attention','structure','markup','training'}
        ids=g['original_papers']+g['reading_order']+[x for s in g['sections'] for x in s.get('citations',[])]
        assert all(i in PP for i in ids),(g['id'],set(ids)-PP.keys())
        assert all(i in g['reading_order'] for i in g['original_papers'])
        assert len({s['id'] for s in g['sections']})==len(g['sections'])
        for s in g['sections']:
            if s.get('table'):assert all(len(r)==len(s['table']['columns']) for r in s['table']['rows'])
    for p in PAPERS:
        assert p['authors'] and all('given' in a and 'family' in a for a in p['authors'])
        assert p['paper_url'].startswith('https://')
        assert isinstance(p['year'],int)

validate_inputs()
build_index()
for g in GUIDES:build_guide(g)
for p in PAPERS:build_paper(p)
build_bibliography()
build_exports()
ET.register_namespace('', 'http://www.sitemaps.org/schemas/sitemap/0.9')
root=ET.Element('{http://www.sitemaps.org/schemas/sitemap/0.9}urlset')
for path in GENERATED.copy():
    if path.endswith('/index.html'):
        page_path=path.removeprefix('research/').removesuffix('index.html')
        entry=ET.SubElement(root,'url');ET.SubElement(entry,'loc').text=BASE+'/'+path.removesuffix('index.html');ET.SubElement(entry,'lastmod').text=PAGE_DATES[page_path]
emit('sitemap.xml','<?xml version="1.0" encoding="UTF-8"?>\n'+ET.tostring(root,encoding='unicode')+'\n')
if (ROOT/'_data/methods/zh/guides.json').exists():
    import sys
    from build_research_zh import build as build_chinese
    build_chinese(sys.modules[__name__])

print(json.dumps({'guides':len(GUIDES),'papers':len(PAPERS),'generated_files':len(GENERATED)},indent=2))
