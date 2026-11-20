'use strict';
// Shared battle sound effects for the player and Game Master dashboards.
// Only server-confirmed public battle events trigger sound. No network audio files or secrets.
window.BattleAudio=(()=>{
 const KEY='battleships-battle-effects-muted';
 let enabled=true,ctx=null,noise=null,ready=false,observed=false,lastId=null,lastTime=0;
 try{enabled=localStorage.getItem(KEY)!=='true'}catch{}
 const button=()=>document.getElementById('battle-sound');
 const status=()=>document.getElementById('battle-sound-status');
 const supported=()=>Boolean(window.AudioContext||window.webkitAudioContext);
 function updateUI(){
  const b=button(),s=status();
  if(b){b.setAttribute('aria-pressed',String(enabled));b.textContent=enabled?'🔊 BATTLE FX ON':'🔇 BATTLE FX OFF';}
  if(s)s.textContent=!enabled?'MUTED':!supported()?'AUDIO UNAVAILABLE':ready?'AUDIO READY':'CLICK TO ENABLE AUDIO';
 }
 function unlock(){
  if(!enabled||!supported())return;
  try{
   if(!ctx)ctx=new (window.AudioContext||window.webkitAudioContext)();
   if(ctx.state==='running'){ready=true;updateUI();return}
   // Only invoked directly from a click/key gesture; do not auto-resume in a socket callback.
   const promise=ctx.resume();
   if(promise&&typeof promise.then==='function')promise.then(()=>{ready=ctx.state==='running';updateUI()}).catch(()=>{ready=false;updateUI()});
   else{ready=ctx.state==='running';updateUI()}
  }catch{ready=false;updateUI()}
 }
 function noiseBuffer(){
  if(noise)return noise;
  const length=Math.ceil(ctx.sampleRate*.7),buffer=ctx.createBuffer(1,length,ctx.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<length;i++)data[i]=(Math.random()*2-1);
  noise=buffer;return buffer;
 }
 function explosion(){
  const start=ctx.currentTime,src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
  src.buffer=noiseBuffer();filter.type='lowpass';
  filter.frequency.setValueAtTime(1900,start);filter.frequency.exponentialRampToValueAtTime(160,start+.52);
  gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.24,start+.009);
  gain.gain.exponentialRampToValueAtTime(.0001,start+.59);
  src.connect(filter);filter.connect(gain);gain.connect(ctx.destination);
  src.start(start);src.stop(start+.6);
  // A short bass thump under the crackle makes the hit sound like an explosion.
  const boom=ctx.createOscillator(),bass=ctx.createGain();
  boom.type='sine';boom.frequency.setValueAtTime(105,start);boom.frequency.exponentialRampToValueAtTime(37,start+.35);
  bass.gain.setValueAtTime(.0001,start);bass.gain.exponentialRampToValueAtTime(.19,start+.018);
  bass.gain.exponentialRampToValueAtTime(.0001,start+.43);
  boom.connect(bass);bass.connect(ctx.destination);boom.start(start);boom.stop(start+.44);
 }
 function swoosh(){
  const start=ctx.currentTime,src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
  src.buffer=noiseBuffer();filter.type='bandpass';filter.Q.value=.65;
  filter.frequency.setValueAtTime(3600,start);filter.frequency.exponentialRampToValueAtTime(380,start+.35);
  gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.13,start+.045);
  gain.gain.exponentialRampToValueAtTime(.0001,start+.41);
  src.connect(filter);filter.connect(gain);gain.connect(ctx.destination);src.start(start);src.stop(start+.44);
  // A falling whistle gives the swoosh a passing-projectile character.
  const whistle=ctx.createOscillator(),wg=ctx.createGain();
  whistle.type='sine';whistle.frequency.setValueAtTime(1300,start);whistle.frequency.exponentialRampToValueAtTime(220,start+.3);
  wg.gain.setValueAtTime(.0001,start);wg.gain.exponentialRampToValueAtTime(.03,start+.045);
  wg.gain.exponentialRampToValueAtTime(.0001,start+.33);
  whistle.connect(wg);wg.connect(ctx.destination);whistle.start(start);whistle.stop(start+.34);
 }
 function play(result){
  if(!enabled||!ready||!ctx||ctx.state!=='running')return;
  try{if(result==='HIT'||result==='SUNK')explosion();else if(result==='MISS')swoosh()}catch{}
 }
 function observe(events){
  if(!Array.isArray(events))return;
  if(!observed){
   observed=true;lastId=events.length?events[events.length-1].id:null;
   lastTime=events.length?Number(events[events.length-1].time)||Date.now():Date.now();
   return; // Never replay old battle sounds to a player who joins mid-match.
  }
  if(!events.length){lastId=null;lastTime=Date.now();return}
  const index=lastId?events.findIndex(e=>e.id===lastId):-1;
  const fresh=index>=0?events.slice(index+1):events.filter(e=>Number(e.time)>lastTime);
  const newest=events[events.length-1];lastId=newest.id;
  lastTime=Math.max(lastTime,Number(newest.time)||0);
  // Socket state may batch several transitions. Only the freshest recent impact is audible.
  const event=fresh[fresh.length-1];
  if(event&&Date.now()-Number(event.time)<5000)play(event.result);
 }
 function init(){
  document.addEventListener('pointerdown',unlock,{capture:true});
  document.addEventListener('keydown',unlock,{capture:true});
  const b=button();
  if(b)b.addEventListener('click',()=>{
   enabled=!enabled;
   try{localStorage.setItem(KEY,enabled?'false':'true')}catch{}
   if(enabled)unlock();
   updateUI();
  });
  updateUI();
 }
 return {init,observe,unlock,get enabled(){return enabled},get ready(){return ready}};
})();
