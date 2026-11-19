'use strict';const socket=io(),$=id=>document.getElementById(id);let state=null,authenticated=false,hostLockMode=false;const hostPlayerTokenKey='battleships-host-player-token';
$('auth').onsubmit=e=>{e.preventDefault();socket.emit('host:auth',$('key').value,r=>{if(r?.ok){authenticated=true;$('key').value='';$('error').textContent='';const token=sessionStorage.getItem(hostPlayerTokenKey);if(token)socket.emit('player:resume',token,result=>{if(!result?.ok){sessionStorage.removeItem(hostPlayerTokenKey);$('host-player-error').textContent='Previous player session expired. Join again if you wish.';}});}else $('error').textContent=r?.error||'Authentication failed';});};
for(const op of ['start','pause','resume','reset'])$(op).onclick=()=>{if(op==='reset'&&!confirm('Reset the entire game?'))return;socket.emit('host:'+op,null,r=>{if(!r?.ok)alert(r?.error||'Failed');});};
function hostAction(event,data,success){socket.emit(event,data,r=>{if(!r?.ok){alert(r?.error||'Action failed');return}success?.(r)});}
$('clear-disconnected').onclick=()=>{if(confirm('Remove all disconnected players from both team rosters?'))hostAction('host:clear-disconnected',null,r=>alert('Removed '+r.removed+' disconnected player(s).'));};
$('remove-all').onclick=()=>{if(confirm('REMOVE ALL registered players and disconnect everyone? This requires the lobby phase.'))hostAction('host:remove-all',null,r=>alert('Removed '+r.removed+' player(s).'));};
function shipSegment(cells,cell){const [r,c]=cell.split(',').map(Number),coords=cells.map(x=>x.split(',').map(Number)),horizontal=coords.every(([row])=>row===coords[0][0]),values=coords.map(x=>horizontal?x[1]:x[0]),position=horizontal?c:r,first=Math.min(...values),last=Math.max(...values);if(position===first)return horizontal?'◀':'▲';if(position===last)return horizontal?'▶':'▼';return horizontal?'━':'┃'}
function setupHostAxes(){
 for(const shell of document.querySelectorAll('.board-shell')){
  const top=shell.querySelector('.axis-top'),left=shell.querySelector('.axis-left');
  top.replaceChildren(...Array.from({length:10},(_,i)=>{const e=document.createElement('span');e.textContent=String.fromCharCode(65+i);return e}));
  left.replaceChildren(...Array.from({length:10},(_,i)=>{const e=document.createElement('span');e.textContent=10-i;return e}));
 }
}
setupHostAxes();

const hostCoord=(r,c)=>String.fromCharCode(65+c)+(10-r);
$('host-player-form').onsubmit=e=>{
 e.preventDefault();
 $('host-player-error').textContent='';
 socket.emit('host:join-player',{name:$('host-player-name').value,team:$('host-player-team').value},r=>{
  if(!r?.ok){$('host-player-error').textContent=r?.error||'Could not join';return}
  sessionStorage.setItem(hostPlayerTokenKey,r.token);
  $('host-player-error').textContent='You joined '+r.team+'. Your votes now count for your team.';
 });
};
$('host-player-leave').onclick=()=>{
 if(!confirm('Leave your player role? Your Game Master controls will remain available.'))return;
 socket.emit('host:leave-player',null,r=>{
  if(!r?.ok){$('host-player-error').textContent=r?.error||'Unable to leave';return}
  sessionStorage.removeItem(hostPlayerTokenKey);
  $('host-player-error').textContent='You are now hosting only.';
 });
};
$('host-player-mode').onclick=()=>{
 hostLockMode=!hostLockMode;
 $('host-player-mode').setAttribute('aria-checked',String(hostLockMode));
 $('host-player-grid').classList.toggle('is-lock-mode',hostLockMode);
 if(state?.host&&state?.me)renderHostPlayer(state);
};
function hostPlayerAction(event,cell){
 const isLock=event==='target:lock';
 $('host-player-lock-status').textContent=isLock?'Updating '+cell+'…':'';
 socket.timeout(7000).emit(event,cell,(err,r)=>{
  if(err||!r?.ok){$('host-player-lock-status').textContent='Action failed: '+(r?.error||'Connection timed out');return}
  $('host-player-lock-status').textContent=isLock?(r.locked?'🔒 Locked ':'🔓 Unlocked ')+cell:'Vote recorded';
 });
}
$('host-player-grid').addEventListener('click',e=>{
 const tile=e.target.closest('.cell[data-cell]');
 if(!tile||!state?.host||!state?.me||!state?.board)return;
 const cell=tile.dataset.cell,b=state.board;
 if(hostLockMode){
  if(state.phase!=='battle'&&state.phase!=='paused')return;
  if(b.attacks.includes(cell)||b.enemyIslands.includes(cell))return;
  hostPlayerAction('target:lock',cell);
 }else if(state.phase==='battle'&&state.turn===state.me.team&&b.options.includes(cell))hostPlayerAction('vote',cell);
});
function renderHostPlayer(s){
 const joined=!!(s.me&&s.board);
 $('host-player-form').hidden=joined;
 $('host-player-summary').hidden=!joined;
 $('host-player-panel').hidden=!joined;
 $('host-player-form').querySelector('button').disabled=s.phase!=='lobby';
 if(!joined)return;
 const me=s.me,b=s.board,available=new Set(b.options),locked=new Set(b.locked),shots=new Set(b.attacks),land=new Set(b.enemyIslands),hits=new Set(b.hitCells),sunkCells=new Map();
 for(const ship of b.sunkEnemyShips)for(const cell of ship.cells)sunkCells.set(cell,ship);
 $('host-player-identity').textContent='⚓ '+me.name+' · '+me.team+' TEAM';
 $('host-player-turn').textContent=s.phase==='battle'?(s.turn===me.team?'⚡ YOUR TURN — VOTE NOW':'⏳ ENEMY TURN'):s.phase==='finished'?(s.winner===me.team?'🏆 YOU WIN':'🏴‍☠️ FLEET SUNK'):s.phase==='paused'?'BATTLE PAUSED':'WAITING FOR START';
 $('host-player-votes').textContent=s.phase==='battle'&&s.turn===me.team?('VOTES: '+Object.values(b.votes).reduce((a,n)=>a+n,0)+' / '+b.needed+' NEEDED'+(b.myVote?' · YOUR VOTE '+hostCoord(...b.myVote.split(',').map(Number)):'')):'You can lock and unlock squares between turns.';
 const grid=$('host-player-grid');grid.style.setProperty('--grid-size',b.size);grid.classList.toggle('is-lock-mode',hostLockMode);
 const signature=[s.phase,s.turn,hostLockMode,b.attacks.join('|'),b.hitCells.join('|'),b.locked.join('|'),b.myVote,JSON.stringify(b.votes)].join(';');
 if(grid.dataset.signature===signature)return;grid.dataset.signature=signature;grid.replaceChildren();
 for(let r=0;r<b.size;r++)for(let c=0;c<b.size;c++){
  const cell=r+','+c,btn=document.createElement('button'),ship=sunkCells.get(cell),isLocked=locked.has(cell);
  btn.type='button';btn.className='cell';btn.dataset.cell=cell;btn.title='Square '+hostCoord(r,c);btn.setAttribute('aria-label','Square '+hostCoord(r,c));
  if(land.has(cell)){btn.classList.add('island');btn.textContent='▲'}
  if(shots.has(cell)){btn.classList.add(hits.has(cell)?'hit':'miss');btn.textContent=hits.has(cell)?'✕':'•'}
  if(ship){btn.classList.add('sunk-ship','ship-hull');btn.textContent=shipSegment(ship.cells,cell);btn.title=ship.name+' SUNK at '+hostCoord(r,c)}
  if(isLocked){btn.classList.add('locked-square');btn.textContent='🔒'}
  if(available.has(cell)&&!hostLockMode)btn.classList.add('selectable');
  if(hostLockMode&&!shots.has(cell)&&!land.has(cell))btn.classList.add('lock-target');
  if(b.myVote===cell)btn.classList.add('voted');
  if(b.votes[cell]){const badge=document.createElement('span');badge.className='count';badge.textContent=b.votes[cell];btn.append(badge)}
  grid.append(btn);
 }
}
socket.on('state',s=>{state=s;$('status').textContent=s.phase.toUpperCase();if(!s.host){$('login').hidden=false;$('dashboard').hidden=true;return}$('login').hidden=true;$('dashboard').hidden=false;renderHostPlayer(s);$('phase').textContent=`${s.phase.toUpperCase()} · ${s.turn} turn${s.winner?' · Winner: '+s.winner:''}`;for(const team of ['Blue','Red']){let t=s.admin[team],el=$(team.toLowerCase()),shipCells=new Set(t.ships.flatMap(x=>x.cells)),shipByCell=new Map(t.ships.flatMap(ship=>ship.cells.map(cell=>[cell,ship]))),hits=new Set(s.admin[team==='Blue'?'Red':'Blue'].shots),ownShots=new Set(t.shots),land=new Set(t.islands||[]);el.style.setProperty('--grid-size',10);el.replaceChildren();for(let r=0;r<10;r++)for(let c=0;c<10;c++){let cell=`${r},${c}`,b=document.createElement('div');b.className='cell';b.textContent='';b.title='Square '+String.fromCharCode(65+c)+(10-r);if(land.has(cell)){b.classList.add('island');b.textContent='▲';}if(shipCells.has(cell)){b.classList.add('ship','ship-hull');const ship=shipByCell.get(cell);b.textContent=shipSegment(ship.cells,cell);b.title=ship.name+' at '+String.fromCharCode(65+c)+(10-r)}if(hits.has(cell)){const hit=shipCells.has(cell);b.classList.add(hit?'own-hit':'miss');b.textContent=hit?'✕':'•';b.title=(hit?'Ship hit':'Miss')+' at '+String.fromCharCode(65+c)+(10-r);}if(t.latestIncoming===cell){b.classList.add('latest-incoming');b.title='LATEST ENEMY ATTACK at '+String.fromCharCode(65+c)+(10-r);const marker=document.createElement('span');marker.className='latest-attack-symbol';marker.textContent='⌖';b.append(marker);}el.append(b);}$(team.toLowerCase()+'info').textContent=`Ships ${t.ships.length}/5 · Latest incoming: ${t.latestIncoming?String.fromCharCode(65+Number(t.latestIncoming.split(',')[1]))+(10-Number(t.latestIncoming.split(',')[0])):'None'} · Votes: ${JSON.stringify(t.votes)} · Eligible: ${t.eligible}`;}$('players').replaceChildren(...['Blue','Red'].flatMap(team=>s.teams[team].players.map(p=>{let el=document.createElement('div');el.className='gm-player-row';const label=document.createElement('span');label.textContent=`${team}: ${p.name} ${p.online?'●':'○'}`;const kick=document.createElement('button');kick.type='button';kick.className='gm-kick';kick.textContent='Kick';kick.title='Remove '+p.name+' and invalidate their session';kick.onclick=()=>{if(confirm('Remove '+p.name+' from '+team+'?'))hostAction('host:kick',p.id)};el.append(label,kick);return el;})));$('history').replaceChildren(...(s.events||[]).slice(-30).reverse().map(event=>{const el=document.createElement('div');el.className='gm-log-event';const when=new Date(event.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});const [r,c]=event.cell.split(',').map(Number);el.textContent=when+' · '+event.team+' '+String.fromCharCode(65+c)+(10-r)+' · '+(event.result==='SUNK'?event.ship+' SUNK':event.result);return el;}));});
setInterval(()=>{if(state)$('timer').textContent=state.deadline?`${Math.max(0,Math.ceil((state.deadline-Date.now())/1000))}s`:'';},250);
