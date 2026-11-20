'use strict';const socket=io(),$=id=>document.getElementById(id);let state=null,authenticated=false;
$('auth').onsubmit=e=>{e.preventDefault();socket.emit('host:auth',$('key').value,r=>{if(r?.ok){authenticated=true;$('key').value='';$('error').textContent='';sessionStorage.removeItem('battleships-host-player-token');}else $('error').textContent=r?.error||'Authentication failed';});};
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

// Hidden by default so the Game Master can operate without seeing ship positions.
// This only changes rendering; authenticated server state and host permissions are unchanged.
const grids=$('host-team-grids'),toggle=$('toggle-team-grids'),gridStatus=$('team-grid-status');
toggle.onclick=()=>{
 const show=grids.hidden;
 grids.hidden=!show;
 toggle.textContent=show?'Hide team grids':'Show team grids';
 toggle.setAttribute('aria-expanded',String(show));
 gridStatus.textContent=show?'Blue and Red fleet grids visible.':'Team grids hidden. Game controls and player management remain available.';
 document.querySelector('.gm-layout').classList.toggle('grids-hidden',!show);
};
window.BattleAudio.init();
socket.on('state',s=>{state=s;window.BattleAudio.observe(s.events);$('status').textContent=s.phase.toUpperCase();if(!s.host){$('login').hidden=false;$('dashboard').hidden=true;return}$('login').hidden=true;$('dashboard').hidden=false;$('phase').textContent=`${s.phase.toUpperCase()} · ${s.turn} turn${s.winner?' · Winner: '+s.winner:''}`;for(const team of ['Blue','Red']){let t=s.admin[team],el=$(team.toLowerCase()),shipCells=new Set(t.ships.flatMap(x=>x.cells)),shipByCell=new Map(t.ships.flatMap(ship=>ship.cells.map(cell=>[cell,ship]))),hits=new Set(s.admin[team==='Blue'?'Red':'Blue'].shots),ownShots=new Set(t.shots),land=new Set(t.islands||[]);el.style.setProperty('--grid-size',10);el.replaceChildren();for(let r=0;r<10;r++)for(let c=0;c<10;c++){let cell=`${r},${c}`,b=document.createElement('div');b.className='cell';b.textContent='';b.title='Square '+String.fromCharCode(65+c)+(10-r);if(land.has(cell)){b.classList.add('island');b.textContent='▲';}if(shipCells.has(cell)){b.classList.add('ship','ship-hull');const ship=shipByCell.get(cell);b.textContent=shipSegment(ship.cells,cell);b.title=ship.name+' at '+String.fromCharCode(65+c)+(10-r)}if(hits.has(cell)){const hit=shipCells.has(cell);b.classList.add(hit?'own-hit':'miss');b.textContent=hit?'✕':'•';b.title=(hit?'Ship hit':'Miss')+' at '+String.fromCharCode(65+c)+(10-r);}if(t.latestIncoming===cell){b.classList.add('latest-incoming');b.title='LATEST ENEMY ATTACK at '+String.fromCharCode(65+c)+(10-r);const marker=document.createElement('span');marker.className='latest-attack-symbol';marker.textContent='⌖';b.append(marker);}el.append(b);}$(team.toLowerCase()+'info').textContent=`Ships ${t.ships.length}/5 · Latest incoming: ${t.latestIncoming?String.fromCharCode(65+Number(t.latestIncoming.split(',')[1]))+(10-Number(t.latestIncoming.split(',')[0])):'None'} · Votes: ${JSON.stringify(t.votes)} · Eligible: ${t.eligible}`;}$('players').replaceChildren(...['Blue','Red'].flatMap(team=>s.teams[team].players.map(p=>{let el=document.createElement('div');el.className='gm-player-row';const label=document.createElement('span');label.textContent=`${team}: ${p.name} ${p.online?'●':'○'}`;const kick=document.createElement('button');kick.type='button';kick.className='gm-kick';kick.textContent='Kick';kick.title='Remove '+p.name+' and invalidate their session';kick.onclick=()=>{if(confirm('Remove '+p.name+' from '+team+'?'))hostAction('host:kick',p.id)};el.append(label,kick);return el;})));$('history').replaceChildren(...(s.events||[]).slice(-30).reverse().map(event=>{const el=document.createElement('div');el.className='gm-log-event';const when=new Date(event.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});const [r,c]=event.cell.split(',').map(Number);el.textContent=when+' · '+event.team+' '+String.fromCharCode(65+c)+(10-r)+' · '+(event.result==='SUNK'?event.ship+' SUNK':event.result);return el;}));});
setInterval(()=>{if(state)$('timer').textContent=state.deadline?`${Math.max(0,Math.ceil((state.deadline-Date.now())/1000))}s`:'';},250);
