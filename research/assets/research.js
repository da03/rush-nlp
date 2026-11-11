(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const percent = x => (x * 100).toFixed(1) + '%';
  const updateBar = (id, p) => { const el = $('#' + id); if (!el) return; $('.bar-fill', el).style.width = percent(p); $('.number', el).textContent = percent(p); };
  const search = $('#paper-search');
  if (search) {
    const filter = $('#paper-topic'), rows = $$('.paper-row'), count = $('#result-count');
    const update = () => {
      const term = search.value.trim().toLocaleLowerCase(), topic = filter.value;
      let n = 0;
      rows.forEach(row => { const show = (!term || row.dataset.search.toLocaleLowerCase().includes(term)) && (topic === 'all' || row.dataset.topics.split(' ').includes(topic)); row.hidden = !show; n += Number(show); });
      count.textContent = n + ' of ' + rows.length + ' papers'; $('#empty-results').hidden = n > 0;
      const url = new URL(location.href); term ? url.searchParams.set('q', search.value.trim()) : url.searchParams.delete('q'); topic === 'all' ? url.searchParams.delete('topic') : url.searchParams.set('topic', topic); history.replaceState(null, '', url);
    };
    const params = new URLSearchParams(location.search); search.value = params.get('q') || ''; if ([...filter.options].some(o => o.value === params.get('topic'))) filter.value = params.get('topic');
    search.addEventListener('input', update); filter.addEventListener('change', update); $('#paper-reset').addEventListener('click', () => {search.value = ''; filter.value = 'all'; update(); search.focus();}); update();
  }
  $$('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    const content = $(button.dataset.copy).textContent, status = $(button.dataset.status);
    try { await navigator.clipboard.writeText(content); status.textContent = 'Citation copied.'; }
    catch (_) { status.textContent = 'Select and copy the citation below.'; const range = document.createRange(); range.selectNodeContents($(button.dataset.copy)); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); }
  }));
  if ($('#tree-demo')) {
    const paths = {
      how: {text:'How do I export my notes?', answers:['Yes','No'], next:'Does the message describe a failure?', outcome:'How-to question'},
      bug: {text:'Can you help? The export button crashes every time.', answers:['Yes','Yes'], next:'Does the message describe a failure?', outcome:'Bug report'},
      praise: {text:'The new export feature is excellent.', answers:['No','Yes'], next:'Does the message express positive sentiment?', outcome:'Positive feedback'}
    };
    const update = () => {const p = paths[$('#tree-example').value]; $('#tree-input').textContent = p.text; $('#tree-answer-1').textContent = p.answers[0]; $('#tree-question-2').textContent = p.next; $('#tree-answer-2').textContent = p.answers[1]; $('#tree-leaf').textContent = p.outcome; $('#tree-trace').textContent = 'Does the message ask for help? → '+p.answers[0]+' → '+p.next+' → '+p.answers[1]+' → '+p.outcome;};
    $('#tree-example').addEventListener('change', update); update();
  }
  if ($('#energy-demo')) {
    const base = [.6,.3,.1], energy = [2,.4,0];
    const update = () => {const beta = Number($('#energy-strength').value), weights = base.map((p,i) => p*Math.exp(-beta*energy[i])), total = weights.reduce((a,b)=>a+b,0); $('#energy-strength-value').textContent = beta.toFixed(1); weights.forEach((w,i)=>updateBar('energy-output-'+i,w/total)); $('#energy-caption').textContent = beta === 0 ? 'At zero correction, the output is the base distribution.' : 'Corrected probabilities: '+weights.map((w,i)=>'ABC'[i]+' '+percent(w/total)).join(', ')+'.';};
    $('#energy-strength').addEventListener('input', update); update();
  }
  if ($('#lattice-demo')) {
    const paths = [{text:'the cats sleeps',p:.55*.6,good:false},{text:'the cats sleep',p:.55*.4,good:true},{text:'the cat sleeps',p:.45*.6,good:true},{text:'the cat sleep',p:.45*.4,good:false}];
    const update = () => {const joint = $('#lattice-mode').value==='joint'; const weights=paths.map(p=>p.p*(joint?(p.good?.9:.1):1)), best=weights.indexOf(Math.max(...weights)); $$('#lattice-table tbody tr').forEach((row,i)=>{row.classList.toggle('best',i===best); row.cells[1].textContent=weights[i].toFixed(3);row.cells[2].textContent=i===best?'Highest score':'';}); $('#lattice-output').textContent=paths[best].text;$('#lattice-explanation').textContent=joint?'Adjacent-pair compatibility changes the best path. This four-path example is small enough to enumerate exactly.':'Independent token scores favor cats and sleeps, producing an inconsistent pair.';};
    $('#lattice-mode').addEventListener('change',update);update();
  }
  if ($('#attention-demo')) {
    const sigmoid=x=>1/(1+Math.exp(-x));
    const update=()=>{const p=Number($('#attention-probability').value),det=sigmoid(4*p),marg=(1-p)*sigmoid(0)+p*sigmoid(4);$('#attention-probability-value').textContent=percent(p);updateBar('attention-state-0',1-p);updateBar('attention-state-1',p);$('#attention-deterministic').textContent=det.toFixed(3);$('#attention-marginal').textContent=marg.toFixed(3);$('#attention-gap').textContent='Difference: '+Math.abs(det-marg).toFixed(3);};
    $('#attention-probability').addEventListener('input',update);update();
  }
  if ($('#structure-demo')) {
    const modes={ordered:{text:'Introduction → method → results → conclusion',repeat:0,summary:'The section order progresses through the document.'},loop:{text:'Introduction → method → results → method → results → method',repeat:3,summary:'Individual sections read fluently, but the transition structure repeatedly returns to earlier stages.'}};
    const update=()=>{const m=modes[$('#structure-order').value];$('#structure-sequence').textContent=m.text;$('#structure-result').textContent=m.summary;};$('#structure-order').addEventListener('change',update);update();
  }
  if ($('#training-demo')) {
    let step=10, rate=.001, pending=null, events=['Step 10 · learning rate 0.001 · no pending action'];
    const render=()=>{$('#training-step').textContent=step;$('#training-rate').textContent=rate.toFixed(4);$('#training-pending').textContent=pending===null?'No pending action':'Set learning rate to '+pending.toFixed(4)+' at the next control point';$('#training-log').textContent=events.join('\n');};
    $('#training-request').addEventListener('click',()=>{pending=Number($('#training-new-rate').value);events.push('Requested · learning rate '+pending.toFixed(4));render();});
    $('#training-next').addEventListener('click',()=>{step++;if(pending!==null){rate=pending;pending=null;events.push('Step '+step+' · applied learning rate '+rate.toFixed(4));}else events.push('Step '+step+' · continued with '+rate.toFixed(4));events=events.slice(-8);render();});
    $('#training-reset').addEventListener('click',()=>{step=10;rate=.001;pending=null;events=['Step 10 · learning rate 0.001 · no pending action'];render();});render();
  }
})();
