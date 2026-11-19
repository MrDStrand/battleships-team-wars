const express=require('express'),http=require('http'),crypto=require('crypto'),{Server}=require('socket.io');
const app=express(),server=http.createServer(app),io=new Server(server),KEY=process.env.HOST_KEY;
if(!KEY)throw Error('HOST_KEY required');app.use(express.static('public'));
const SIZE=10,ISLANDS=4;
const makeIslands=()=>{const land=new Set();for(let i=0;i<ISLANDS;i++){let r=crypto.randomInt(2,SIZE-2),c=crypto.randomInt(2,SIZE-2),length=crypto.randomInt(3,7),vertical=crypto.randomInt(2)===0;for(let j=0;j<length;j++){let y=r+(vertical?j:0),x=c+(vertical?0:j);if(y<SIZE-1&&x<SIZE-1)land.add(y+','+x)}}return [...land]};
const FLEET=[['Carrier',5],['Battleship',4],['Cruiser',3],['Submarine',3],['Destroyer',2]],T=['Blue','Red'];
const fresh=()=>({ships:[],shots:[],islands:[],votes:{},eligible:[],locked:[],index:0});
let g={phase:'lobby',teams:{Blue:fresh(),Red:fresh()},players:new Map(),hosts:new Set(),turn:'Blue',winner:null,deadline:null,clock:null,history:[],events:[]};
const other=t=>t==='Blue'?'Red':'Blue',members=t=>[...g.players.values()].filter(p=>p.team===t),active=t=>members(t).filter(p=>p.sid),need=t=>Math.floor(g.teams[t].eligible.length/2)+1;
const cells=(start,dir,n)=>{let [r,c]=start.split(',').map(Number),[dr,dc]=({up:[-1,0],down:[1,0],left:[0,-1],right:[0,1]})[dir]||[99,99],out=[];for(let i=0;i<n;i++){let y=r+i*dr,x=c+i*dc;if(y<0||x<0||y>=SIZE||x>=SIZE)return null;out.push(y+','+x)}return out};
const placed=t=>g.teams[t].ships.flatMap(s=>s.cells);
const valid=(t,c,d)=>{let x=cells(c,d,FLEET[g.teams[t].index][1]);if(!x)return false;const occupied=new Set(placed(t)),land=new Set(g.teams[t].islands);return x.every(cell=>{const [r,col]=cell.split(',').map(Number);return !land.has(cell)&&!occupied.has(cell)&&![[r-1,col],[r+1,col],[r,col-1],[r,col+1]].some(([y,z])=>occupied.has(y+','+z));});};
const shuffled=a=>{for(let i=a.length-1;i>0;i--){let j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]]}return a};
const buildFleet=t=>{const a=g.teams[t];for(let attempt=0;attempt<30;attempt++){a.islands=makeIslands();a.ships=[];a.index=0;const backtrack=()=>{if(a.index===FLEET.length)return true;const [name,n]=FLEET[a.index];const candidates=shuffled(Array.from({length:SIZE*SIZE},(_,i)=>[Math.floor(i/SIZE)+','+(i%SIZE),'right']).concat(Array.from({length:SIZE*SIZE},(_,i)=>[Math.floor(i/SIZE)+','+(i%SIZE),'down'])));for(const [start,dir] of candidates){if(!valid(t,start,dir))continue;a.ships.push({name,length:n,cells:cells(start,dir,n)});a.index++;if(backtrack())return true;a.index--;a.ships.pop()}return false};if(backtrack())return true}a.ships=[];a.index=0;a.islands=[];return false};
const opts=t=>Array.from({length:SIZE*SIZE},(_,i)=>Math.floor(i/SIZE)+','+(i%SIZE)).filter(c=>!g.teams[t].shots.includes(c)&&!g.teams[other(t)].islands.includes(c)&&!g.teams[t].locked.includes(c));
const tally=t=>{let o={};for(let v of Object.values(g.teams[t].votes))o[v]=(o[v]||0)+1;return o};
const reset=t=>{g.teams[t].votes={};g.teams[t].eligible=active(t).map(p=>p.id)};
const syncEligible=t=>{const a=g.teams[t],online=new Set(active(t).map(p=>p.id));a.eligible=[...online];for(const id of Object.keys(a.votes))if(!online.has(id))delete a.votes[id];};
const log=s=>{g.history.push(s);g.history=g.history.slice(-100)};
const battleEvent=(team,cell,result,ship=null)=>{g.events.push({id:crypto.randomBytes(8).toString('hex'),time:Date.now(),team,cell,result,...(ship?{ship}:{})});g.events=g.events.slice(-100)};
const clear=()=>{clearTimeout(g.clock);g.clock=null;g.deadline=null};
function timer(){clear();/* Unlimited voting: majority alone advances the attack. */}
function fire(t,c){
 const a=g.teams[t],enemy=g.teams[other(t)];a.shots.push(c);a.locked=a.locked.filter(x=>x!==c);
 const targetShip=enemy.ships.find(ship=>ship.cells.includes(c));
 const sunk=targetShip&&targetShip.cells.every(x=>a.shots.includes(x));
 const result=sunk?'SUNK':targetShip?'HIT':'MISS';
 battleEvent(t,c,result,sunk?targetShip.name:null);
 const square=String.fromCharCode(65+Number(c.split(',')[1]))+(10-Number(c.split(',')[0]));
 log(t+' fired at '+square+': '+(sunk?targetShip.name+' SUNK':result));
 if(enemy.ships.every(ship=>ship.cells.every(x=>a.shots.includes(x)))){g.phase='finished';g.winner=t;clear();log(t+' wins!')}
 else{g.turn=other(t);reset(g.turn);timer()}
}
function resolve(t){if(g.phase!=='battle'||g.turn!==t)return;let win=Object.entries(tally(t)).find(([k,v])=>v>=need(t));if(win)fire(t,win[0])}
function view(p,host){let s={phase:g.phase,turn:g.turn,winner:g.winner,deadline:g.deadline,history:g.history.slice(-12),events:g.events.slice(-50),teams:Object.fromEntries(T.map(t=>[t,{players:members(t).map(x=>({name:x.name,online:!!x.sid,...(host?{id:x.id}:{})})),placedCount:g.teams[t].ships.length,sunk:g.teams[t].ships.filter(x=>x.cells.every(c=>g.teams[other(t)].shots.includes(c))).length}]))};if(p){let t=p.team,a=g.teams[t],b=g.teams[other(t)];s.me={id:p.id,name:p.name,team:t};s.board={size:SIZE,ownIslands:a.islands,enemyIslands:b.islands,ships:a.ships.map(x=>({...x,hits:x.cells.filter(c=>b.shots.includes(c))})),incoming:b.shots,latestIncoming:b.shots.at(-1)||null,attacks:a.shots,hitCells:a.shots.filter(c=>placed(other(t)).includes(c)),sunkEnemy:b.ships.filter(x=>x.cells.every(c=>a.shots.includes(c))).map(x=>x.cells),sunkEnemyShips:b.ships.filter(x=>x.cells.every(c=>a.shots.includes(c))).map(x=>({name:x.name,cells:x.cells})),locked:a.locked,options:g.phase==='battle'&&g.turn===t?opts(t):[],votes:tally(t),myVote:a.votes[p.id]||null,eligible:a.eligible.length,needed:need(t)}}if(host){s.host=true;s.admin=Object.fromEntries(T.map(t=>[t,{ships:g.teams[t].ships,islands:g.teams[t].islands,latestIncoming:g.teams[other(t)].shots.at(-1)||null,locked:g.teams[t].locked,votes:tally(t),eligible:g.teams[t].eligible.length,shots:g.teams[t].shots}]))}return s}
function send(){for(let sock of io.sockets.sockets.values()){let p=[...g.players.values()].find(x=>x.sid===sock.id);sock.emit('state',view(p,g.hosts.has(sock.id)))}}
const playerOnSocket=sid=>[...g.players.values()].find(p=>p.sid===sid);
const assignSocket=(sock,p)=>{if(p.sid&&p.sid!==sock.id)io.sockets.sockets.get(p.sid)?.disconnect(true);p.sid=sock.id;if(g.phase==='battle'&&g.turn===p.team)syncEligible(p.team)};
const removePlayer=p=>{const sid=p.sid;g.players.delete(p.id);delete g.teams[p.team].votes[p.id];g.teams[p.team].eligible=g.teams[p.team].eligible.filter(id=>id!==p.id);if(sid){const target=io.sockets.sockets.get(sid);if(target&&!g.hosts.has(sid)){target.emit('player:kicked',{message:'The Game Master removed your player from this game.'});target.disconnect(true)}}};
io.on('connection',sock=>{
sock.on('host:auth',(key,ack)=>{let ok=typeof key==='string'&&crypto.timingSafeEqual(crypto.createHash('sha256').update(key).digest(),crypto.createHash('sha256').update(KEY).digest());if(ok)g.hosts.add(sock.id);ack?.(ok?{ok:true}:{ok:false,error:'Invalid host key'});send()});
sock.on('host:join-player',(data,ack)=>{
 if(!g.hosts.has(sock.id))return ack?.({ok:false,error:'Game Master authentication required'});
 if(g.phase!=='lobby')return ack?.({ok:false,error:'Join as a player before the game starts'});
 if(playerOnSocket(sock.id))return ack?.({ok:false,error:'You are already participating'});
 const name=typeof data?.name==='string'?data.name.trim().replace(/[<>]/g,'').slice(0,24):'';
 const team=data?.team;
 if(!name)return ack?.({ok:false,error:'Enter your player name'});
 if(!T.includes(team))return ack?.({ok:false,error:'Choose Blue or Red'});
 if([...g.players.values()].some(p=>p.name.toLowerCase()===name.toLowerCase()))return ack?.({ok:false,error:'Player name already in use'});
 const p={id:crypto.randomBytes(16).toString('hex'),name,team,sid:sock.id,hostPlayer:true};
 g.players.set(p.id,p);ack?.({ok:true,token:p.id,team});send();
});
sock.on('host:leave-player',(_,ack)=>{
 if(!g.hosts.has(sock.id))return ack?.({ok:false,error:'Game Master authentication required'});
 const p=playerOnSocket(sock.id);
 if(!p||!p.hostPlayer)return ack?.({ok:false,error:'You are not participating as host'});
 const team=p.team;removePlayer(p);if(g.phase==='battle'&&g.turn===team)resolve(team);
 ack?.({ok:true});send();
});
sock.on('player:resume',(token,ack)=>{const p=typeof token==='string'?g.players.get(token):null;if(!p)return ack?.({ok:false,error:'Session no longer exists. Join again with your name.'});if(p.hostPlayer&&!g.hosts.has(sock.id))return ack?.({ok:false,error:'Game Master authentication required'});const active=playerOnSocket(sock.id);if(active&&active.id!==p.id)return ack?.({ok:false,error:'Already participating as another player'});assignSocket(sock,p);ack?.({ok:true,token:p.id});send()});
sock.on('player:join',({name,token}={},ack)=>{name=typeof name==='string'?name.trim().replace(/[<>]/g,'').slice(0,24):'';if(!name)return ack?.({ok:false,error:'Enter a name'});let p=typeof token==='string'?g.players.get(token):null;if(token&&!p)return ack?.({ok:false,error:'Previous session expired. Join again with your name.'});if(p){if(p.hostPlayer&&!g.hosts.has(sock.id))return ack?.({ok:false,error:'Game Master authentication required'});assignSocket(sock,p)}else{if(playerOnSocket(sock.id))return ack?.({ok:false,error:'Already participating'});if(g.phase!=='lobby')return ack?.({ok:false,error:'Game already started'});if([...g.players.values()].some(x=>x.name.toLowerCase()===name.toLowerCase()))return ack?.({ok:false,error:'Name in use'});let team=members('Blue').length<=members('Red').length?'Blue':'Red';p={id:crypto.randomBytes(16).toString('hex'),name,team,sid:sock.id};g.players.set(p.id,p)}ack?.({ok:true,token:p.id});send()});
sock.on('vote',(choice,ack)=>{let p=[...g.players.values()].find(x=>x.sid===sock.id);if(!p)return ack?.({ok:false,error:'Not a player'});let t=p.team,a=g.teams[t];if(g.phase!=='battle'||g.turn!==t||!a.eligible.includes(p.id)||!opts(t).includes(choice))return ack?.({ok:false,error:'Invalid vote'});a.votes[p.id]=choice;ack?.({ok:true});resolve(t);send()});
sock.on('target:lock',(cell,ack)=>{const p=[...g.players.values()].find(x=>x.sid===sock.id);if(!p)return ack?.({ok:false,error:'Join a team first'});if(g.phase!=='battle'&&g.phase!=='paused')return ack?.({ok:false,error:'Locks are available during battle only'});if(typeof cell!=='string'||!/^\d{1,2},\d{1,2}$/.test(cell)||cell.split(',').some(n=>Number(n)>=SIZE||String(Number(n))!==n))return ack?.({ok:false,error:'Invalid square'});const a=g.teams[p.team],enemy=g.teams[other(p.team)];if(a.shots.includes(cell)||enemy.islands.includes(cell))return ack?.({ok:false,error:'This square cannot be locked'});const index=a.locked.indexOf(cell);if(index>=0)a.locked.splice(index,1);else{a.locked.push(cell);for(const [id,vote] of Object.entries(a.votes))if(vote===cell)delete a.votes[id]}ack?.({ok:true,locked:index<0});if(index<0&&g.phase==='battle'&&g.turn===p.team)resolve(p.team);send()});
sock.on('host:kick',(id,ack)=>{if(!g.hosts.has(sock.id))return ack?.({ok:false,error:'Unauthorized'});const p=typeof id==='string'?g.players.get(id):null;if(!p)return ack?.({ok:false,error:'Player no longer exists'});const team=p.team;removePlayer(p);if(g.phase==='battle'&&g.turn===team)resolve(team);ack?.({ok:true});send()});
sock.on('host:clear-disconnected',(_,ack)=>{if(!g.hosts.has(sock.id))return ack?.({ok:false,error:'Unauthorized'});let removed=0;const affected=new Set();for(const p of [...g.players.values()])if(!p.sid){affected.add(p.team);removePlayer(p);removed++}for(const team of affected)if(g.phase==='battle'&&g.turn===team)resolve(team);ack?.({ok:true,removed});send()});
sock.on('host:remove-all',(_,ack)=>{if(!g.hosts.has(sock.id))return ack?.({ok:false,error:'Unauthorized'});if(g.phase!=='lobby')return ack?.({ok:false,error:'Reset the game to the lobby before removing all players'});const removed=g.players.size;for(const p of [...g.players.values()])removePlayer(p);ack?.({ok:true,removed});send()});
for(let op of ['start','pause','resume','reset'])sock.on('host:'+op,(_,ack)=>{if(!g.hosts.has(sock.id))return ack?.({ok:false,error:'Unauthorized'});if(op==='start'){if(g.phase!=='lobby'||!T.every(t=>members(t).length))return ack?.({ok:false,error:'Need players on both teams'});if(!T.every(buildFleet)){g.teams={Blue:fresh(),Red:fresh()};return ack?.({ok:false,error:'Could not generate valid fleets; try starting again'})}g.phase='battle';g.turn='Blue';reset('Blue');timer();log('Fleets deployed automatically. Blue attacks first!')}else if(op==='pause'){if(g.phase!=='battle')return ack?.({ok:false,error:'Not in battle'});clear();g.phase='paused'}else if(op==='resume'){if(g.phase!=='paused')return ack?.({ok:false,error:'Not paused'});g.phase='battle';timer()}else{clear();g.phase='lobby';g.teams={Blue:fresh(),Red:fresh()};g.turn='Blue';g.winner=null;g.history=[];g.events=[]}ack?.({ok:true});send()});
sock.on('disconnect',()=>{g.hosts.delete(sock.id);const changed=new Set();for(let p of g.players.values())if(p.sid===sock.id){p.sid=null;changed.add(p.team)}for(const t of changed){syncEligible(t);if(g.phase==='battle'&&g.turn===t)resolve(t)}send()});send()});
server.listen(process.env.PORT||3000);
