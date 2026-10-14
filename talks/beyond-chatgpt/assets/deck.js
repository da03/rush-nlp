/* Local presentation controls. No remote services are loaded by this file. */
const deck = Reveal;
deck.initialize({
  width:1280,height:720,margin:0.04,minScale:0.2,maxScale:2,
  hash:true,history:true,center:false,transition:'fade',transitionSpeed:'fast',
  backgroundTransition:'none',controls:true,controlsTutorial:false,progress:true,
  slideNumber:'c/t',showSlideNumber:'all',navigationMode:'linear',
  autoPlayMedia:false,viewDistance:2,defaultTiming:120,
  pdfSeparateFragments:false,pdfMaxPagesPerSlide:1,
  plugins:[],
  keyboard:{
    80:()=>toggleVideo(),
    82:()=>restartVideo(),
    72:()=>toggleHelp(),
    76:()=>openLive()
  }
});
function currentVideo(){return deck.getCurrentSlide()?.querySelector('video')}
function toggleVideo(){const v=currentVideo();if(!v)return;v.paused?v.play().catch(()=>{}):v.pause()}
function restartVideo(){const v=currentVideo();if(!v)return;v.currentTime=0;v.play().catch(()=>{})}
function openLive(){const s=deck.getCurrentSlide();const a=s?.querySelector('.media-tools [data-live]')||s?.querySelector('[data-live]');if(a)window.open(a.href,'_blank','noopener')}
function toggleHelp(){const el=document.getElementById('deck-help');el.hidden=!el.hidden}
document.querySelectorAll('[data-video-toggle]').forEach(b=>b.addEventListener('click',toggleVideo));
document.querySelectorAll('[data-video-restart]').forEach(b=>b.addEventListener('click',restartVideo));
document.querySelector('[data-help-close]')?.addEventListener('click',toggleHelp);
deck.on('slidechanged',()=>{
  document.querySelectorAll('video').forEach(v=>v.pause());
  const v=currentVideo();if(v){v.currentTime=0;if(v.hasAttribute('data-play-on-entry'))v.play().catch(()=>{})}
});
deck.on('ready',()=>{const v=currentVideo();if(v?.hasAttribute('data-play-on-entry'))v.play().catch(()=>{})});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.getElementById('deck-help').hidden=true}});
