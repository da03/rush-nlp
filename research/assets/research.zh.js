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
      count.textContent = n + " / " + rows.length + " 篇论文"; $('#empty-results').hidden = n > 0;
      const url = new URL(location.href); term ? url.searchParams.set('q', search.value.trim()) : url.searchParams.delete('q'); topic === 'all' ? url.searchParams.delete('topic') : url.searchParams.set('topic', topic); history.replaceState(null, '', url);
    };
    const params = new URLSearchParams(location.search); search.value = params.get('q') || ''; if ([...filter.options].some(o => o.value === params.get('topic'))) filter.value = params.get('topic');
    search.addEventListener('input', update); filter.addEventListener('change', update); $('#paper-reset').addEventListener('click', () => {search.value = ''; filter.value = 'all'; update(); search.focus();}); update();
  }
  $$('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    const content = $(button.dataset.copy).textContent, status = $(button.dataset.status);
    try { await navigator.clipboard.writeText(content); status.textContent = "引用已复制。"; }
    catch (_) { status.textContent = "请选择并复制下方引用。"; const range = document.createRange(); range.selectNodeContents($(button.dataset.copy)); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); }
  }));
  if ($('#tree-demo')) {
    const paths = {
      how: {text:"如何导出我的笔记？", answers:["是","否"], next:"这条消息是否描述了故障？", outcome:"使用方法咨询"},
      bug: {text:"能帮忙看看吗？每次点击导出按钮都会崩溃。", answers:["是","是"], next:"这条消息是否描述了故障？", outcome:"故障报告"},
      praise: {text:"新的导出功能非常好用。", answers:["否","是"], next:"这条消息是否表达了正面评价？", outcome:"正面反馈"}
    };
    const update = () => {const p = paths[$('#tree-example').value]; $('#tree-input').textContent = p.text; $('#tree-answer-1').textContent = p.answers[0]; $('#tree-question-2').textContent = p.next; $('#tree-answer-2').textContent = p.answers[1]; $('#tree-leaf').textContent = p.outcome; $('#tree-trace').textContent = "这条消息是否在寻求帮助？ → "+p.answers[0]+' → '+p.next+' → '+p.answers[1]+' → '+p.outcome;};
    $('#tree-example').addEventListener('change', update); update();
  }
  if ($('#energy-demo')) {
    const base = [.6,.3,.1], energy = [2,.4,0];
    const update = () => {const beta = Number($('#energy-strength').value), weights = base.map((p,i) => p*Math.exp(-beta*energy[i])), total = weights.reduce((a,b)=>a+b,0); $('#energy-strength-value').textContent = beta.toFixed(1); weights.forEach((w,i)=>updateBar('energy-output-'+i,w/total)); $('#energy-caption').textContent = beta === 0 ? "修正强度为零时，输出等于基础分布。" : "修正后的概率："+weights.map((w,i)=>'ABC'[i]+' '+percent(w/total)).join(', ')+'.';};
    $('#energy-strength').addEventListener('input', update); update();
  }
  if ($('#lattice-demo')) {
    const paths = [{text:'the cats sleeps',p:.55*.6,good:false},{text:'the cats sleep',p:.55*.4,good:true},{text:'the cat sleeps',p:.45*.6,good:true},{text:'the cat sleep',p:.45*.4,good:false}];
    const update = () => {const joint = $('#lattice-mode').value==='joint'; const weights=paths.map(p=>p.p*(joint?(p.good?.9:.1):1)), best=weights.indexOf(Math.max(...weights)); $$('#lattice-table tbody tr').forEach((row,i)=>{row.classList.toggle('best',i===best); row.cells[1].textContent=weights[i].toFixed(3);row.cells[2].textContent=i===best?"得分最高":'';}); $('#lattice-output').textContent=paths[best].text;$('#lattice-explanation').textContent=joint?"相邻词元的相容性改变了最优路径。这个四路径示例可通过枚举精确计算。":"独立词元得分偏好 cats 和 sleeps，导致主谓不一致。";};
    $('#lattice-mode').addEventListener('change',update);update();
  }
  if ($('#attention-demo')) {
    const sigmoid=x=>1/(1+Math.exp(-x));
    const update=()=>{const p=Number($('#attention-probability').value),det=sigmoid(4*p),marg=(1-p)*sigmoid(0)+p*sigmoid(4);$('#attention-probability-value').textContent=percent(p);updateBar('attention-state-0',1-p);updateBar('attention-state-1',p);$('#attention-deterministic').textContent=det.toFixed(3);$('#attention-marginal').textContent=marg.toFixed(3);$('#attention-gap').textContent="差值："+Math.abs(det-marg).toFixed(3);};
    $('#attention-probability').addEventListener('input',update);update();
  }
  if ($('#structure-demo')) {
    const modes={ordered:{text:"引言 → 方法 → 结果 → 结论",repeat:0,summary:"章节顺序沿着论述向前推进。"},loop:{text:"引言 → 方法 → 结果 → 方法 → 结果 → 方法",repeat:3,summary:"单个章节读起来流畅，章节之间却反复回到前面的阶段。"}};
    const update=()=>{const m=modes[$('#structure-order').value];$('#structure-sequence').textContent=m.text;$('#structure-result').textContent=m.summary;};$('#structure-order').addEventListener('change',update);update();
  }
  if ($('#training-demo')) {
    let step=10, rate=.001, pending=null, events=["第 10 步 · 学习率 0.001 · 没有待执行操作"];
    const render=()=>{$('#training-step').textContent=step;$('#training-rate').textContent=rate.toFixed(4);$('#training-pending').textContent=pending===null?"没有待执行操作":"将学习率设为 "+pending.toFixed(4)+"，在下一个控制点应用";$('#training-log').textContent=events.join('\n');};
    $('#training-request').addEventListener('click',()=>{pending=Number($('#training-new-rate').value);events.push("已请求 · 学习率 "+pending.toFixed(4));render();});
    $('#training-next').addEventListener('click',()=>{step++;if(pending!==null){rate=pending;pending=null;events.push("第 "+step+" 步 · 已应用学习率 "+rate.toFixed(4));}else events.push("第 "+step+" 步 · 继续使用学习率 "+rate.toFixed(4));events=events.slice(-8);render();});
    $('#training-reset').addEventListener('click',()=>{step=10;rate=.001;pending=null;events=["第 10 步 · 学习率 0.001 · 没有待执行操作"];render();});render();
  }
})();
