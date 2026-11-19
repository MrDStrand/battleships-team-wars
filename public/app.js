'use strict';
const socket=io(), $=id=>document.getElementById(id);let state=null,lockMode=false,token=sessionStorage.getItem('battleships-token');
const coord=(r,c)=>`${r},${c}`,label=(r,c)=>`${String.fromCharCode(65+c)}${10-r}`;
function emit(event,data,cb){socket.emit(event,data,res=>{if(!res?.ok) $('error').textContent=res?.error||'Request failed';else cb?.(res);});}
$('join').onsubmit=e=>{e.preventDefault();emit('player:join',{name:$('name').value},r=>{token=r.token;sessionStorage.setItem('battleships-token',token);$('error').textContent='';});};
function setLockMode(next){
 lockMode=next;
 $('lock-mode').setAttribute('aria-checked',String(next));
 $('enemy').classList.toggle('is-lock-mode',next);
 $('lock-status').textContent=next?'LOCK MODE: pale-grey squares can be locked. Click a grey padlock to unlock. Switch back to vote.':'VOTE MODE: normal clicks vote on your turn. Use Lock mode to mark squares.';
 if(state?.me)render(state);
}
$('lock-mode').onclick=()=>setLockMode(!lockMode);
function toggleTargetLock(cell){
 const loc=label(...cell.split(',').map(Number));
 $('lock-status').textContent='Updating '+loc+'…';
 socket.timeout(7000).emit('target:lock',cell,(err,res)=>{
  if(err||!res?.ok){$('lock-status').textContent='Could not change '+loc+': '+(res?.error||'Server did not respond');return}
  $('lock-status').textContent=res.locked?'🔒 '+loc+' LOCKED for your team':'🔓 '+loc+' UNLOCKED for your team';
 });
}
// One delegated handler is attached once, so it survives every live grid redraw.
$('enemy').addEventListener('click',e=>{
 const tile=e.target.closest('button.cell[data-cell]');
 if(!tile||!$('enemy').contains(tile))return;
 const cell=tile.dataset.cell,board=state?.board;
 if(!state?.me||!board)return;
 const lockable=(state.phase==='battle'||state.phase==='paused')&&!board.attacks.includes(cell)&&!board.enemyIslands.includes(cell);
 if(lockMode||e.shiftKey){
  e.preventDefault();e.stopPropagation();
  if(lockable)toggleTargetLock(cell);
  else $('lock-status').textContent='That square cannot be locked.';
  return;
 }
 if(state.phase==='battle'&&state.turn===state.me.team&&board.options.includes(cell))emit('vote',cell);
});
$('enemy').addEventListener('contextmenu',e=>{
 const tile=e.target.closest('button.cell[data-cell]');
 if(!tile||!$('enemy').contains(tile))return;
 e.preventDefault();
 if(state?.me&&(state.phase==='battle'||state.phase==='paused'))toggleTargetLock(tile.dataset.cell);
});
socket.on('connect',()=>{if(token)socket.emit('player:resume',token,r=>{if(!r?.ok){token=null;sessionStorage.removeItem('battleships-token');$('error').textContent='Your previous session ended. Enter your name to join again.';}});});
socket.on('disconnect',reason=>{if(reason==='io server disconnect'&&!token)socket.connect();});
socket.on('player:kicked',data=>{token=null;sessionStorage.removeItem('battleships-token');state=null;$('login').hidden=false;$('dashboard').hidden=true;$('error').textContent=data?.message||'You were removed by the Game Master.';});
socket.on('state',s=>{state=s;$('status').textContent=s.phase.toUpperCase();$('login').hidden=!!s.me;$('dashboard').hidden=!s.me;if(s.me)render(s);});
// Use distinct bow, hull and stern shapes for ships in either orientation.
function shipSegment(cells,cell){
 const [r,c]=cell.split(',').map(Number);
 const coords=cells.map(x=>x.split(',').map(Number));
 const horizontal=coords.every(([row])=>row===coords[0][0]);
 const values=coords.map(x=>horizontal?x[1]:x[0]);
 const position=horizontal?c:r,first=Math.min(...values),last=Math.max(...values);
 if(position===first)return horizontal?'◀':'▲';
 if(position===last)return horizontal?'▶':'▼';
 return horizontal?'━':'┃';
}
function board(el,ships,shots,hits,sunk,selectable,vote,votes={},islands=[],size=10,latestIncoming=null,locked=[],sunkShips=[],lockEnabled=false){
 const occupied=new Set(ships.flatMap(s=>s.cells)),shotSet=new Set(shots),hitSet=new Set(hits),sunkSet=new Set(sunk.flat()),allowed=new Set(selectable),land=new Set(islands),lockedSet=new Set(locked),shipByCell=new Map(),ownShipByCell=new Map();
 for(const ownShip of ships)for(const segment of ownShip.cells)ownShipByCell.set(segment,ownShip);
 for(const ship of sunkShips)for(const cell of ship.cells)shipByCell.set(cell,ship);
 el.style.setProperty('--grid-size',size);el.replaceChildren();
 for(let r=0;r<size;r++)for(let c=0;c<size;c++){
  const cell=coord(r,c),b=document.createElement('button'),ship=shipByCell.get(cell),isLocked=lockedSet.has(cell),canLock=lockEnabled&&!land.has(cell)&&!shotSet.has(cell);
  b.type='button';b.className='cell';b.textContent='';b.setAttribute('aria-label','Square '+label(r,c));b.title='Square '+label(r,c);
  if(land.has(cell)){b.classList.add('island');b.title='Island — blocked';b.textContent='▲'}
  if(occupied.has(cell)){b.classList.add('ship','ship-hull');const ownShip=ownShipByCell.get(cell);b.textContent=shipSegment(ownShip.cells,cell);b.title=ownShip.name+' at '+label(r,c)}
  if(shotSet.has(cell)){const hit=hitSet.has(cell);if(hit&&el.id==='own')b.classList.remove('ship');b.classList.add(hit?(el.id==='own'?'own-hit':'hit'):'miss');b.title=(hit?'Hit':'Miss')+' at '+label(r,c);b.textContent=hit?'✕':'•'}
  if(sunkSet.has(cell))b.classList.add('sunk');
  if(ship){
   const segments=new Set(ship.cells);
   b.classList.add('sunk-ship','ship-hull');b.textContent=shipSegment(ship.cells,cell);b.title=ship.name+' SUNK at '+label(r,c);
   if(segments.has(coord(r,c-1)))b.classList.add('sunk-join-left');
   if(segments.has(coord(r,c+1)))b.classList.add('sunk-join-right');
   if(segments.has(coord(r-1,c)))b.classList.add('sunk-join-top');
   if(segments.has(coord(r+1,c)))b.classList.add('sunk-join-bottom');
   b.setAttribute('aria-label',ship.name+' sunk, '+label(r,c));
  }
  if(isLocked){b.classList.add('locked-square');b.textContent='🔒';b.title='Locked by your team. Switch to Lock mode and click to unlock';b.setAttribute('aria-label',label(r,c)+' locked. Use Lock mode and click to unlock')}
  if(cell===latestIncoming){b.classList.add('latest-incoming');b.title='LATEST ENEMY ATTACK at '+label(r,c)+(hitSet.has(cell)?' — HIT':' — MISS');b.setAttribute('aria-label',b.title);const marker=document.createElement('span');marker.className='latest-attack-symbol';marker.textContent='⌖';marker.setAttribute('aria-hidden','true');b.append(marker)}
  b.dataset.cell=cell;
  // Keep grid buttons enabled in every phase; disabled buttons suppress pointer events in some browsers.
  // All actions are handled centrally, with server validation.
  if(canLock)b.classList.add('lockable');
  if(allowed.has(cell)&&!lockMode)b.classList.add('selectable');
  if(canLock&&lockMode)b.classList.add('lock-target');
  if(vote===cell)b.classList.add('voted');
  if(votes[cell]){const count=document.createElement('span');count.className='count';count.textContent=String(votes[cell]);count.title=votes[cell]+' teammate vote(s)';b.append(count)}
  el.append(b);
 }
}
function setupBoardAxes(){
 for(const shell of document.querySelectorAll('.board-shell')){
  const top=shell.querySelector('.axis-top'),left=shell.querySelector('.axis-left');
  const letters=Array.from({length:10},(_,i)=>String.fromCharCode(65+i));
  top.replaceChildren(...letters.map(v=>{const e=document.createElement('span');e.textContent=v;return e}));
  left.replaceChildren(...Array.from({length:10},(_,i)=>{const e=document.createElement('span');e.textContent=10-i;return e}));
 }
}
setupBoardAxes();
function updateTurn(s){
 const el=$('turn'),mine=s.turn===s.me.team;
 el.classList.toggle('your-turn',s.phase==='battle'&&mine);
 el.classList.toggle('enemy-turn',s.phase==='battle'&&!mine);
 el.classList.toggle('end-turn',s.phase==='finished');
 if(s.phase==='battle')el.textContent=mine?'⚡ YOUR TURN — VOTE TO ATTACK':'⏳ ENEMY TURN — DEFEND YOUR FLEET';
 else if(s.phase==='finished')el.textContent=s.winner===s.me.team?'🏆 VICTORY!':'🏴‍☠️ DEFEAT';
 else if(s.phase==='paused')el.textContent='⏸ BATTLE PAUSED';
 else el.textContent='⚓ WAITING FOR BATTLE';
}
let announcedEndgame=null,closedEndgame=null;
$('endgame-close').onclick=()=>{$('endgame').hidden=true;closedEndgame=announcedEndgame};
function updateEndgame(s){
 const overlay=$('endgame');
 if(s.phase!=='finished'||!s.winner){overlay.hidden=true;announcedEndgame=null;closedEndgame=null;return}
 const won=s.winner===s.me.team,ending=s.winner+'-'+s.me.team;
 if(announcedEndgame===ending)return;
 announcedEndgame=ending;
 if(closedEndgame===ending)return;
 overlay.hidden=false;
 overlay.classList.toggle('victory',won);
 overlay.classList.toggle('defeat',!won);
 $('endgame-emblem').textContent=won?'🏆':'🏴‍☠️';
 $('endgame-title').textContent=won?'YOU WIN!':'YOUR FLEET IS SUNK';
 $('endgame-subtitle').textContent=won?'Enemy fleet destroyed. Victory is yours!':'The enemy has won. Your pirate flag flies over the wreckage.';
 const effects=$('endgame-effects');
 effects.replaceChildren();
 if(won){
  for(let i=0;i<12;i++){
   const fire=document.createElement('span');fire.className='firework';fire.textContent=i%3===0?'💥':'✦';fire.style.left=(8+(i*37)%84)+'%';fire.style.top=(8+(i*23)%65)+'%';fire.style.animationDelay=(i%6*.22)+'s';effects.append(fire);
  }
 }else{
  for(let i=0;i<3;i++){const flag=document.createElement('span');flag.className='pirate-flag';flag.textContent='🏴‍☠️';flag.style.left=(10+i*35)+'%';flag.style.animationDelay=(i*.3)+'s';effects.append(flag)}
 }
}
// The sonar is alive: a continuous sweep and only real, confirmed shots as blips.
// No unhit enemy ship location is ever used to populate the display.
// The sweep keeps rotating in CSS; this clock emits a visual echo each revolution.
// Audio is strictly opt-in to respect browser autoplay policies and shared spaces.
const SONAR_PERIOD_MS=4500;
let sonarSoundEnabled=false,sonarAudio=null,sonarSweepCount=0;
function sonarChime(){
 if(!sonarSoundEnabled||document.hidden||!state?.me||state.phase!=='battle')return;
 try{
  const Context=window.AudioContext||window.webkitAudioContext;
  if(!Context)return;
  if(!sonarAudio)sonarAudio=new Context();
  if(sonarAudio.state!=='running')return;
  const now=sonarAudio.currentTime,osc=sonarAudio.createOscillator(),gain=sonarAudio.createGain();
  osc.type='sine';osc.frequency.setValueAtTime(930,now);
  osc.frequency.exponentialRampToValueAtTime(510,now+.23);
  gain.gain.setValueAtTime(.0001,now);
  gain.gain.exponentialRampToValueAtTime(.035,now+.012);
  gain.gain.exponentialRampToValueAtTime(.0001,now+.34);
  osc.connect(gain);gain.connect(sonarAudio.destination);
  osc.start(now);osc.stop(now+.36);
 }catch(e){$('radar-audio-status').textContent='AUDIO UNAVAILABLE';sonarSoundEnabled=false;$('radar-sound').setAttribute('aria-pressed','false')}
}
function sonarPulse(){
 if(!state?.me||state.phase!=='battle'||document.hidden)return;
 const layer=$('radar-pings'),ring=document.createElement('span');
 ring.className='sonar-echo';
 // Replacing a finished echo, instead of accumulating DOM elements.
 layer.replaceChildren(ring);
 sonarSweepCount++;
 // One soft ping every two or three revolutions rather than continuous beeping.
 if(sonarSweepCount%5===0||sonarSweepCount%5===2)sonarChime();
}
setInterval(sonarPulse,SONAR_PERIOD_MS);
$('radar-sound').onclick=async()=>{
 sonarSoundEnabled=!sonarSoundEnabled;
 if(sonarSoundEnabled){
  try{
   const Context=window.AudioContext||window.webkitAudioContext;
   if(!Context)throw Error('Web Audio unavailable');
   if(!sonarAudio)sonarAudio=new Context();
   await sonarAudio.resume();
   if(sonarAudio.state!=='running')throw Error('Audio suspended');
   sonarChime();
  }catch(e){sonarSoundEnabled=false;$('radar-audio-status').textContent='AUDIO UNAVAILABLE'}
 }
 $('radar-sound').setAttribute('aria-pressed',String(sonarSoundEnabled));
 $('radar-sound').textContent=sonarSoundEnabled?'◖)) MUTE PING':'◖)) ENABLE PING';
 if(sonarSoundEnabled)$('radar-audio-status').textContent='AUDIO ON';
 else if($('radar-audio-status').textContent!=='AUDIO UNAVAILABLE')$('radar-audio-status').textContent='SOUND OFF';
};
function updateRadar(s){
 const b=s.board,contacts=$('radar-points'),points=[];
 const enemyHits=new Set(b.hitCells),ownHits=new Set(b.ships.flatMap(ship=>ship.hits));
 for(const cell of b.attacks)points.push({cell,kind:enemyHits.has(cell)?'hit':'miss',side:'outgoing'});
 for(const cell of b.incoming)points.push({cell,kind:ownHits.has(cell)?'hit':'miss',side:'incoming'});
 const signature=points.map(x=>x.cell+x.kind+x.side).join('|');
 if(contacts.dataset.signature!==signature){
  contacts.dataset.signature=signature;contacts.replaceChildren();
  for(const point of points){
   const [r,c]=point.cell.split(',').map(Number),dot=document.createElement('span');
   dot.className='radar-blip '+point.kind+' '+point.side;
   dot.style.left=((c+.5)*10)+'%';dot.style.top=((r+.5)*10)+'%';
   dot.title=(point.side==='outgoing'?'Your attack ':'Incoming attack ')+label(r,c)+' — '+point.kind;
   contacts.append(dot);
  }
 }
 $('radar-contacts').textContent=String(points.length).padStart(2,'0');
 $('radar-scan').textContent=s.phase==='battle'?'TRACKING':s.phase==='paused'?'HOLD':s.phase==='finished'?'COMPLETE':'STANDBY';
 $('radar').classList.toggle('radar-operating',s.phase==='battle');
}
function renderBattleLog(s){
 const el=$('history'),team=s.me.team,events=s.events||[];
 const signature=events.map(event=>event.id).join('|');
 if(el.dataset.signature===signature)return;
 el.dataset.signature=signature;el.replaceChildren();
 for(const event of events.slice(-15).reverse()){
  const own=event.team===team,row=document.createElement('div'),icon=document.createElement('span'),desc=document.createElement('div'),time=document.createElement('time');
  row.className='battle-event '+event.result.toLowerCase()+(own?' friendly':' hostile');
  icon.className='event-icon';icon.textContent=event.result==='MISS'?'◯':event.result==='SUNK'?'☠':'✕';
  desc.className='event-detail';
  const action=document.createElement('strong'),sub=document.createElement('small');
  const [r,c]=event.cell.split(',').map(Number);
  action.textContent=(own?'YOU':'ENEMY')+' · '+label(r,c);
  sub.textContent=event.result==='SUNK'?event.ship+' SUNK':event.result;
  desc.append(action,sub);
  time.className='event-time';time.dateTime=new Date(event.time).toISOString();
  time.textContent=new Date(event.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
  row.append(icon,desc,time);el.append(row);
 }
 if(!events.length){const idle=document.createElement('div');idle.className='log-empty';idle.textContent='AWAITING FIRST CONTACT…';el.append(idle)}
}
function renderFleet(s){
 const el=$('fleet');el.replaceChildren();
 const symbols=['▰','▰','▱','▱','▰'];
 for(const [i,ship] of s.board.ships.entries()){
  const line=document.createElement('div');line.className='fleet-entry';
  const head=document.createElement('span');head.className='fleet-name';head.textContent=(symbols[i]||'▰')+'  '+ship.name.toUpperCase();
  const life=document.createElement('span');life.className='fleet-health';
  for(let n=0;n<ship.length;n++){const bar=document.createElement('i');if(n<ship.hits.length)bar.className='damaged';life.append(bar)}
  const count=document.createElement('small');count.textContent=ship.hits.length===ship.length?'SUNK':(ship.length-ship.hits.length)+'/'+ship.length+' INTACT';
  line.append(head,life,count);el.append(line);
 }
 if(!s.board.ships.length){const placeholder=document.createElement('div');placeholder.className='log-empty';placeholder.textContent='AWAITING FLEET DEPLOYMENT';el.append(placeholder)}
}
function render(s){
 const b=s.board,team=s.me.team,opp=team==='Blue'?'Red':'Blue';
 $('identity').textContent='CAPTAIN '+s.me.name.toUpperCase();updateTurn(s);updateEndgame(s);
 $('timer').textContent=s.deadline?Math.max(0,Math.ceil((s.deadline-Date.now())/1000))+'s':'';
 const crew=s.teams[team].players;
 $('teammate-count').textContent='('+crew.filter(p=>p.online).length+'/'+crew.length+')';
 $('teammates').replaceChildren(...crew.map(p=>{
  const item=document.createElement('span');item.className='teammate'+(p.online?' online':' offline');
  const dot=document.createElement('span');dot.className='presence-dot';dot.setAttribute('aria-hidden','true');
  item.append(dot,document.createTextNode(p.name+(p.name===s.me.name?' • YOU':'')));
  item.title=p.online?'Online':'Offline';return item;
 }));
 const incomingHits=b.ships.flatMap(ship=>ship.hits);
 const attackEnabled=s.phase==='battle'&&s.turn===team;
 board($('own'),b.ships,b.incoming,incomingHits,[],[],null,{},b.ownIslands,b.size,b.latestIncoming);
 board($('enemy'),[],b.attacks,b.hitCells,b.sunkEnemy,attackEnabled?b.options:[],attackEnabled?b.myVote:null,attackEnabled?b.votes:{},b.enemyIslands,b.size,null,b.locked||[],b.sunkEnemyShips||[],s.phase==='battle'||s.phase==='paused');
 const voteCount=Object.values(b.votes).reduce((a,n)=>a+n,0);
 $('votestatus').textContent=attackEnabled?'VOTING · '+voteCount+' CAST · '+b.needed+' TO FIRE'+(b.myVote?' · YOUR TARGET '+label(...b.myVote.split(',').map(Number)):''):'TARGETING STANDBY · LOCK MODE AVAILABLE';
 const yourFloat=s.teams[team].placedCount-s.teams[team].sunk;
 const enemyFloat=s.teams[opp].placedCount-s.teams[opp].sunk;
 const status=$('teams');status.replaceChildren();
 for(const [heading,count,other] of [['YOU',yourFloat,false],['ENEMY',enemyFloat,true]]){
  const card=document.createElement('div');card.className='strength '+(other?'strength-enemy':'strength-you');
  const name=document.createElement('span');name.textContent=heading;
  const ships=document.createElement('strong');ships.textContent=count+' / 5';
  const caption=document.createElement('small');caption.textContent='SHIPS AFLOAT';
  card.append(name,ships,caption);status.append(card);
 }
 renderFleet(s);renderBattleLog(s);updateRadar(s);
}
setInterval(()=>{if(state?.deadline&&state.me)$('timer').textContent=`${Math.max(0,Math.ceil((state.deadline-Date.now())/1000))}s`;},250);
