'use strict';
const socket=io(), $=id=>document.getElementById(id);let state=null,lockMode=false,token=sessionStorage.getItem('battleships-token');
const coord=(r,c)=>`${r},${c}`,label=(r,c)=>`${String.fromCharCode(65+c)}${r+1}`;
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
$('chat-form').onsubmit=e=>{e.preventDefault();const input=$('chat-input'),message=input.value.trim();if(!message)return;socket.emit('chat:send',message,r=>{if(r?.ok){input.value='';$('chat-error').textContent='';}else $('chat-error').textContent=r?.error||'Message not sent';});};
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
  b.type='button';b.className='cell';b.textContent=label(r,c);
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
  left.replaceChildren(...Array.from({length:10},(_,i)=>{const e=document.createElement('span');e.textContent=i+1;return e}));
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
function renderChat(s){$('chat-title').textContent=s.me.team+' team chat';const el=$('chat-messages'),wasBottom=el.scrollHeight-el.scrollTop-el.clientHeight<28;const current=el.dataset.lastId||'',messages=s.chat||[];const last=messages.length?messages[messages.length-1].id:'';if(current===last)return;el.replaceChildren(...messages.map(m=>{const line=document.createElement('div');line.className='chat-message';const who=document.createElement('strong');who.textContent=m.name+': ';const body=document.createElement('span');body.textContent=m.text;line.append(who,body);return line;}));el.dataset.lastId=last;if(wasBottom)el.scrollTop=el.scrollHeight;}
function render(s){renderChat(s);const intel=$('intelligence');if(intel){const items=s.intelligence||[];if(intel.dataset.lastId!==(items.at(-1)?.id||'')){intel.replaceChildren(...items.slice().reverse().map(m=>{const div=document.createElement('div');div.className='intel-item';div.textContent='◈ '+m.text;return div;}));intel.dataset.lastId=items.at(-1)?.id||'';}}const mates=s.teams[s.me.team].players;$('teammate-count').textContent='('+mates.filter(p=>p.online).length+'/'+mates.length+' online)';$('teammates').replaceChildren(...mates.map(p=>{const item=document.createElement('span');item.className='teammate'+(p.online?' online':' offline');const dot=document.createElement('span');dot.className='presence-dot';dot.setAttribute('aria-hidden','true');item.append(dot,document.createTextNode(p.name+(p.name===s.me.name?' (you)':'')));item.title=p.online?'Online':'Offline';return item;}));let b=s.board,team=s.me.team,opp=team==='Blue'?'Red':'Blue';$('identity').textContent=`Captain ${s.me.name}`;updateTurn(s);updateEndgame(s);$('timer').textContent=s.deadline?`${Math.max(0,Math.ceil((s.deadline-Date.now())/1000))}s`:'';let enemyHit=b.ships.flatMap(x=>x.hits);let attackEnabled=s.phase==='battle'&&s.turn===team;board($('own'),b.ships,b.incoming,enemyHit,[],[],null,{},b.ownIslands,b.size,b.latestIncoming);board($('enemy'),[],b.attacks,b.hitCells,b.sunkEnemy,attackEnabled?b.options:[],attackEnabled?b.myVote:null,attackEnabled?b.votes:{},b.enemyIslands,b.size,null,b.locked||[],b.sunkEnemyShips||[],s.phase==='battle'||s.phase==='paused');$('enemy').parentElement.append($('instruction'),$('votestatus'));$('instruction').textContent=attackEnabled?'Vote for attack target':'';let votes=Object.entries(b.votes).map(([k,v])=>`${k}: ${v}`).join(' · ');$('votestatus').textContent=attackEnabled?`Majority ${b.needed}/${b.eligible} · ${votes||'Awaiting votes'}${b.myVote?' · Your vote: '+b.myVote:''}`:'';$('fleet').innerHTML=b.ships.map(x=>`<div>${x.name}: ${x.hits.length}/${x.length} hits ${x.hits.length===x.length?'☠️':''}</div>`).join('')||'<span class="muted">No ships placed yet</span>';$('teams').textContent=`YOU: ${s.teams[team].players.length} sailors · ${s.teams[team].placedCount}/5 ships · ${s.teams[team].sunk} sunk\nENEMY: ${s.teams[opp].players.length} sailors · ${s.teams[opp].placedCount}/5 ships · ${s.teams[opp].sunk} sunk`;$('teams').style.whiteSpace='pre-line';$('history').replaceChildren(...s.history.slice().reverse().map(h=>{let div=document.createElement('div');div.textContent=h.replace(/^(Blue|Red) fired at /,(_,side)=>side===team?'You fired at ':'Enemy fired at ').replace(/^(Blue|Red) wins!$/,(_,side)=>side===team?'You win!':'Enemy wins!').replace(/^Fleets deployed automatically\. Blue attacks first!$/,s.turn===team?'Fleets deployed. You attack first!':'Fleets deployed. Enemy attacks first!');return div;}));}
setInterval(()=>{if(state?.deadline&&state.me)$('timer').textContent=`${Math.max(0,Math.ceil((state.deadline-Date.now())/1000))}s`;},250);
