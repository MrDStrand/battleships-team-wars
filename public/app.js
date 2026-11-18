'use strict';
const socket=io(), $=id=>document.getElementById(id);let state=null,lockMode=false,token=sessionStorage.getItem('battleships-token');
const coord=(r,c)=>`${r},${c}`,label=(r,c)=>`${String.fromCharCode(65+r)}${c+1}`;
function emit(event,data,cb){socket.emit(event,data,res=>{if(!res?.ok) $('error').textContent=res?.error||'Request failed';else cb?.(res);});}
$('join').onsubmit=e=>{e.preventDefault();emit('player:join',{name:$('name').value},r=>{token=r.token;sessionStorage.setItem('battleships-token',token);$('error').textContent='';});};
function setLockMode(next){
 lockMode=next;
 $('lock-mode').textContent=next?'🔒 LOCK MODE ON — click tiles to lock/unlock':'🎯 VOTE MODE — click tiles to vote';
 $('lock-mode').setAttribute('aria-pressed',String(next));
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
function board(el,ships,shots,hits,sunk,selectable,vote,votes={},islands=[],size=10,latestIncoming=null,locked=[],sunkShips=[],lockEnabled=false){
 const occupied=new Set(ships.flatMap(s=>s.cells)),shotSet=new Set(shots),hitSet=new Set(hits),sunkSet=new Set(sunk.flat()),allowed=new Set(selectable),land=new Set(islands),lockedSet=new Set(locked),shipByCell=new Map();
 for(const ship of sunkShips)for(const cell of ship.cells)shipByCell.set(cell,ship);
 el.style.setProperty('--grid-size',size);el.replaceChildren();
 for(let r=0;r<size;r++)for(let c=0;c<size;c++){
  const cell=coord(r,c),b=document.createElement('button'),ship=shipByCell.get(cell),isLocked=lockedSet.has(cell),canLock=lockEnabled&&!land.has(cell)&&!shotSet.has(cell);
  b.type='button';b.className='cell';b.textContent=label(r,c);
  if(land.has(cell)){b.classList.add('island');b.title='Island — blocked';b.textContent='▲'}
  if(occupied.has(cell))b.classList.add('ship');
  if(shotSet.has(cell)){const hit=hitSet.has(cell);if(hit&&el.id==='own')b.classList.remove('ship');b.classList.add(hit?(el.id==='own'?'own-hit':'hit'):'miss');b.title=(hit?'Hit':'Miss')+' at '+label(r,c);b.textContent=hit?'✕':'•'}
  if(sunkSet.has(cell))b.classList.add('sunk');
  if(ship){
   const segments=new Set(ship.cells);
   b.classList.add('sunk-ship');b.textContent='▰';b.title=ship.name+' SUNK at '+label(r,c);
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
function renderChat(s){$('chat-title').textContent=s.me.team+' team chat';const el=$('chat-messages'),wasBottom=el.scrollHeight-el.scrollTop-el.clientHeight<28;const current=el.dataset.lastId||'',messages=s.chat||[];const last=messages.length?messages[messages.length-1].id:'';if(current===last)return;el.replaceChildren(...messages.map(m=>{const line=document.createElement('div');line.className='chat-message';const who=document.createElement('strong');who.textContent=m.name+': ';const body=document.createElement('span');body.textContent=m.text;line.append(who,body);return line;}));el.dataset.lastId=last;if(wasBottom)el.scrollTop=el.scrollHeight;}
function render(s){renderChat(s);const intel=$('intelligence');if(intel){const items=s.intelligence||[];if(intel.dataset.lastId!==(items.at(-1)?.id||'')){intel.replaceChildren(...items.slice().reverse().map(m=>{const div=document.createElement('div');div.className='intel-item';div.textContent='◈ '+m.text;return div;}));intel.dataset.lastId=items.at(-1)?.id||'';}}const mates=s.teams[s.me.team].players;$('teammate-count').textContent='('+mates.filter(p=>p.online).length+'/'+mates.length+' online)';$('teammates').replaceChildren(...mates.map(p=>{const item=document.createElement('span');item.className='teammate'+(p.online?' online':' offline');const dot=document.createElement('span');dot.className='presence-dot';dot.setAttribute('aria-hidden','true');item.append(dot,document.createTextNode(p.name+(p.name===s.me.name?' (you)':'')));item.title=p.online?'Online':'Offline';return item;}));let b=s.board,team=s.me.team,opp=team==='Blue'?'Red':'Blue';$('identity').textContent=`${s.me.name} · ${team} Team`;$('turn').textContent=s.phase==='battle'?`${s.turn} attacking`:s.phase==='finished'?`${s.winner} wins!`:s.phase==='paused'?'Paused':s.phase==='lobby'?'Waiting for players':'Waiting';$('timer').textContent=s.deadline?`${Math.max(0,Math.ceil((s.deadline-Date.now())/1000))}s`:'';let enemyHit=b.ships.flatMap(x=>x.hits);let attackEnabled=s.phase==='battle'&&s.turn===team;board($('own'),b.ships,b.incoming,enemyHit,[],[],null,{},b.ownIslands,b.size,b.latestIncoming);board($('enemy'),[],b.attacks,b.hitCells,b.sunkEnemy,attackEnabled?b.options:[],attackEnabled?b.myVote:null,attackEnabled?b.votes:{},b.enemyIslands,b.size,null,b.locked||[],b.sunkEnemyShips||[],s.phase==='battle'||s.phase==='paused');$('enemy').parentElement.append($('instruction'),$('votestatus'));$('instruction').textContent=attackEnabled?'Vote for attack target':'';let votes=Object.entries(b.votes).map(([k,v])=>`${k}: ${v}`).join(' · ');$('votestatus').textContent=attackEnabled?`Majority ${b.needed}/${b.eligible} · ${votes||'Awaiting votes'}${b.myVote?' · Your vote: '+b.myVote:''}`:'';$('fleet').innerHTML=b.ships.map(x=>`<div>${x.name}: ${x.hits.length}/${x.length} hits ${x.hits.length===x.length?'☠️':''}</div>`).join('')||'<span class="muted">No ships placed yet</span>';$('teams').textContent=`Blue: ${s.teams.Blue.players.length} players, ${s.teams.Blue.placedCount}/5 ships, ${s.teams.Blue.sunk} sunk\nRed: ${s.teams.Red.players.length} players, ${s.teams.Red.placedCount}/5 ships, ${s.teams.Red.sunk} sunk`;$('teams').style.whiteSpace='pre-line';$('history').replaceChildren(...s.history.slice().reverse().map(h=>{let div=document.createElement('div');div.textContent=h;return div;}));}
setInterval(()=>{if(state?.deadline&&state.me)$('timer').textContent=`${Math.max(0,Math.ceil((state.deadline-Date.now())/1000))}s`;},250);
