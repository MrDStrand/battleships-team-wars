const express=require('express'),http=require('http'),crypto=require('crypto'),{Server}=require('socket.io');
const app=express(),server=http.createServer(app),io=new Server(server),KEY=process.env.HOST_KEY;
if(!KEY)throw Error('HOST_KEY required');app.use(express.static('public'));
const SIZE=10,ISLANDS=4;
const makeIslands=()=>{const land=new Set();for(let i=0;i<ISLANDS;i++){let r=crypto.randomInt(2,SIZE-2),c=crypto.randomInt(2,SIZE-2),length=crypto.randomInt(3,7),vertical=crypto.randomInt(2)===0;for(let j=0;j<length;j++){let y=r+(vertical?j:0),x=c+(vertical?0:j);if(y<SIZE-1&&x<SIZE-1)land.add(y+','+x)}}return [...land]};
const FLEET=[['Carrier',5],['Battleship',4],['Cruiser',3],['Submarine',3],['Destroyer',2]],T=['Blue','Red'];
const fresh=()=>({ships:[],shots:[],islands:[],votes:{},eligible:[],locked:[],index:0});

const rooms=new Map(),tokens=new Map();
// In-memory room expiry. Default: 60 minutes after the final host/player disconnect.
// An override is useful in test runs; production should normally use the default.
const idleSetting=Number(process.env.ROOM_IDLE_MINUTES??60);
const ROOM_IDLE_MS=Number.isFinite(idleSetting)&&idleSetting>0?Math.round(idleSetting*60000):3600000;
const cleanCode=value=>typeof value==='string'?value.trim().toUpperCase():'';
const validCode=code=>/^[A-HJ-NP-Z2-9]{6}$/.test(code);
const newCode=()=>{const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let code;do{code=Array.from({length:6},()=>chars[crypto.randomInt(chars.length)]).join('')}while(rooms.has(code));return code};
function createGame(code){
 let g={phase:'lobby',teams:{Blue:fresh(),Red:fresh()},players:new Map(),hosts:new Set(),turn:'Blue',winner:null,deadline:null,clock:null,history:[],events:[]};
 let idleTimer=null;
 function hasConnections(){
  // Use live sockets, not merely retained player IDs or stale socket references.
  for(const sid of g.hosts)if(io.sockets.sockets.has(sid))return true;
  for(const p of g.players.values())if(p.sid&&io.sockets.sockets.has(p.sid))return true;
  return false;
 }
 function cancelIdle(){
  if(idleTimer!==null){clearTimeout(idleTimer);idleTimer=null}
 }
 function expire(){
  idleTimer=null;
  if(rooms.get(code)!==api||hasConnections())return;
  clear(); // Cancel any game clock before dropping its state.
  for(const p of g.players.values())tokens.delete(p.id);
  g.players.clear();g.hosts.clear();g.events=[];g.history=[];
  g.teams={Blue:fresh(),Red:fresh()};
  rooms.delete(code);
 }
 function scheduleIdle(){
  if(rooms.get(code)!==api||hasConnections()){cancelIdle();return}
  if(idleTimer!==null)return; // Repeated disconnects must not extend expiration.
  idleTimer=setTimeout(expire,ROOM_IDLE_MS);
  idleTimer.unref?.(); // An empty room should not keep an otherwise idle Node process alive.
 }
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

 function view(p,host){let s={roomCode:code,phase:g.phase,turn:g.turn,winner:g.winner,deadline:g.deadline,history:g.history.slice(-12),events:g.events.slice(-50),teams:Object.fromEntries(T.map(t=>[t,{players:members(t).map(x=>({name:x.name,online:!!x.sid,...(host?{id:x.id}:{})})),placedCount:g.teams[t].ships.length,sunk:g.teams[t].ships.filter(x=>x.cells.every(c=>g.teams[other(t)].shots.includes(c))).length}]))};if(p){let t=p.team,a=g.teams[t],b=g.teams[other(t)];s.me={id:p.id,name:p.name,team:t};s.board={size:SIZE,ownIslands:a.islands,enemyIslands:b.islands,ships:a.ships.map(x=>({...x,hits:x.cells.filter(c=>b.shots.includes(c))})),incoming:b.shots,latestIncoming:b.shots.at(-1)||null,attacks:a.shots,hitCells:a.shots.filter(c=>placed(other(t)).includes(c)),sunkEnemy:b.ships.filter(x=>x.cells.every(c=>a.shots.includes(c))).map(x=>x.cells),sunkEnemyShips:b.ships.filter(x=>x.cells.every(c=>a.shots.includes(c))).map(x=>({name:x.name,cells:x.cells})),locked:a.locked,options:g.phase==='battle'&&g.turn===t?opts(t):[],votes:tally(t),myVote:a.votes[p.id]||null,eligible:a.eligible.length,needed:need(t)}}if(host){s.host=true;s.admin=Object.fromEntries(T.map(t=>[t,{ships:g.teams[t].ships,islands:g.teams[t].islands,latestIncoming:g.teams[other(t)].shots.at(-1)||null,locked:g.teams[t].locked,votes:tally(t),eligible:g.teams[t].eligible.length,shots:g.teams[t].shots}]))}return s}

 function send(){
  for(const sock of io.sockets.sockets.values()){
   if(sock.data.room!==code)continue;
   const p=[...g.players.values()].find(x=>x.sid===sock.id);
   sock.emit('state',view(p,g.hosts.has(sock.id)));
  }
 }
 function assignSocket(sock,p){
  if(p.sid&&p.sid!==sock.id)io.sockets.sockets.get(p.sid)?.disconnect(true);
  p.sid=sock.id;
  cancelIdle();
  if(g.phase==='battle'&&g.turn===p.team)syncEligible(p.team);
 }
 function removePlayer(p){
  const sid=p.sid;g.players.delete(p.id);tokens.delete(p.id);
  delete g.teams[p.team].votes[p.id];
  g.teams[p.team].eligible=g.teams[p.team].eligible.filter(id=>id!==p.id);
  if(sid){
   const target=io.sockets.sockets.get(sid);
   if(target){
    target.emit('player:kicked',{message:'The Game Master removed you from this room.'});
    target.data.room=null;target.data.role=null;
    target.emit('state',{phase:'unassigned',roomCode:null});
    target.disconnect(true);
   }
  }
 }
 function onDisconnect(sock){
  g.hosts.delete(sock.id);
  const changed=new Set();
  for(const p of g.players.values())if(p.sid===sock.id){p.sid=null;changed.add(p.team)}
  for(const t of changed){syncEligible(t);if(g.phase==='battle'&&g.turn===t)resolve(t)}
  send();
  scheduleIdle();
 }
 const api={code,g,send,view,assignSocket,removePlayer,onDisconnect,buildFleet,reset,resolve,opts,active,syncEligible,clear,timer,log,cancelIdle,scheduleIdle};
 return api;
}
const matchFor=sock=>rooms.get(sock.data.room)||null;
const authorizedHost=sock=>{const room=matchFor(sock);return room&&room.g.hosts.has(sock.id)?room:null};
const playerFor=sock=>{const room=matchFor(sock);if(!room||sock.data.role!=='player')return null;const p=[...room.g.players.values()].find(p=>p.sid===sock.id);return p?{room,p}:null};
const enter=(sock,room,role)=>{
 if(sock.data.room&&sock.data.room!==room.code)return false;
 if(sock.data.role&&sock.data.role!==role)return false;
 sock.data.room=room.code;sock.data.role=role;return true;
};
io.on('connection',sock=>{
 sock.emit('state',{phase:'unassigned',roomCode:null});
 sock.on('host:create-room',(key,ack)=>{
  if(typeof key!=='string'||!crypto.timingSafeEqual(crypto.createHash('sha256').update(key).digest(),crypto.createHash('sha256').update(KEY).digest()))return ack?.({ok:false,error:'Invalid host key'});
  if(sock.data.room)return ack?.({ok:false,error:'Already connected to a room'});
  const code=newCode(),room=createGame(code);rooms.set(code,room);
  enter(sock,room,'host');room.g.hosts.add(sock.id);room.cancelIdle();
  ack?.({ok:true,roomCode:code});room.send();
 });
 sock.on('host:auth',(input,ack)=>{
  const key=typeof input==='string'?input:input?.key,code=cleanCode(input?.room);
  if(typeof key!=='string'||!crypto.timingSafeEqual(crypto.createHash('sha256').update(key).digest(),crypto.createHash('sha256').update(KEY).digest()))return ack?.({ok:false,error:'Invalid host key'});
  const room=rooms.get(code);
  if(!room)return ack?.({ok:false,error:'Room not found. Create a new room or check its code.'});
  if(!enter(sock,room,'host'))return ack?.({ok:false,error:'Already connected to another room'});
  room.g.hosts.add(sock.id);room.cancelIdle();ack?.({ok:true,roomCode:code});room.send();
 });
 sock.on('player:resume',(token,ack)=>{
  if(sock.data.role==='host')return ack?.({ok:false,error:'Game Master is observer-only'});
  const code=typeof token==='string'?tokens.get(token):null,room=rooms.get(code),p=room?.g.players.get(token);
  if(!p)return ack?.({ok:false,error:'Session no longer exists. Enter a room code and rejoin.'});
  if(!enter(sock,room,'player'))return ack?.({ok:false,error:'Already joined another room'});
  const active=[...room.g.players.values()].find(p=>p.sid===sock.id);
  if(active&&active.id!==p.id)return ack?.({ok:false,error:'Already participating as another player'});
  room.assignSocket(sock,p);ack?.({ok:true,token:p.id,roomCode:room.code});room.send();
 });
 sock.on('player:join',(input={},ack)=>{
  if(sock.data.role==='host')return ack?.({ok:false,error:'Game Master cannot join a team'});
  const name=typeof input?.name==='string'?input.name.trim().replace(/[<>]/g,'').slice(0,24):'';
  const code=cleanCode(input?.room);
  if(!name)return ack?.({ok:false,error:'Enter a player name'});
  if(!validCode(code))return ack?.({ok:false,error:'Enter a valid six-character room code'});
  const room=rooms.get(code);
  if(!room)return ack?.({ok:false,error:'Room not found. Check the Game Master invite code.'});
  if(sock.data.room&&sock.data.room!==code)return ack?.({ok:false,error:'Already connected to a different room'});
  if([...room.g.players.values()].some(p=>p.sid===sock.id))return ack?.({ok:false,error:'Already joined this room'});
  if(room.g.phase!=='lobby')return ack?.({ok:false,error:'This game has already started'});
  if([...room.g.players.values()].some(p=>p.name.toLowerCase()===name.toLowerCase()))return ack?.({ok:false,error:'Name already in use in this room'});
  const team=room.g.teams.Blue&&[...room.g.players.values()].filter(p=>p.team==='Blue').length<=[...room.g.players.values()].filter(p=>p.team==='Red').length?'Blue':'Red';
  const p={id:crypto.randomBytes(16).toString('hex'),name,team,sid:sock.id};
  if(!enter(sock,room,'player'))return ack?.({ok:false,error:'Cannot join this room'});
  room.g.players.set(p.id,p);tokens.set(p.id,code);room.cancelIdle();
  ack?.({ok:true,token:p.id,roomCode:code});room.send();
 });
 sock.on('vote',(choice,ack)=>{
  const record=playerFor(sock);if(!record)return ack?.({ok:false,error:'Not a room player'});
  const {room,p}=record,g=room.g,a=g.teams[p.team];
  if(g.phase!=='battle'||g.turn!==p.team||!a.eligible.includes(p.id)||!room.opts(p.team).includes(choice))return ack?.({ok:false,error:'Invalid vote'});
  a.votes[p.id]=choice;ack?.({ok:true});room.resolve(p.team);room.send();
 });
 sock.on('target:lock',(cell,ack)=>{
  const record=playerFor(sock);if(!record)return ack?.({ok:false,error:'Not a room player'});
  const {room,p}=record,g=room.g;
  if(g.phase!=='battle'&&g.phase!=='paused')return ack?.({ok:false,error:'Locks are available during battle only'});
  if(typeof cell!=='string'||!/^\\d{1,2},\\d{1,2}$/.test(cell)||cell.split(',').some(n=>Number(n)>=SIZE||String(Number(n))!==n))return ack?.({ok:false,error:'Invalid square'});
  const a=g.teams[p.team],enemy=g.teams[p.team==='Blue'?'Red':'Blue'];
  if(a.shots.includes(cell)||enemy.islands.includes(cell))return ack?.({ok:false,error:'This square cannot be locked'});
  const index=a.locked.indexOf(cell);
  if(index>=0)a.locked.splice(index,1);
  else{a.locked.push(cell);for(const [id,vote] of Object.entries(a.votes))if(vote===cell)delete a.votes[id]}
  ack?.({ok:true,locked:index<0});if(index<0&&g.phase==='battle'&&g.turn===p.team)room.resolve(p.team);room.send();
 });
 sock.on('host:kick',(id,ack)=>{
  const room=authorizedHost(sock);if(!room)return ack?.({ok:false,error:'Unauthorized'});
  const p=typeof id==='string'?room.g.players.get(id):null;if(!p)return ack?.({ok:false,error:'Player not in your room'});
  const team=p.team;room.removePlayer(p);
  if(room.g.phase==='battle'&&room.g.turn===team)room.resolve(team);
  ack?.({ok:true});room.send();
 });
 sock.on('host:clear-disconnected',(_,ack)=>{
  const room=authorizedHost(sock);if(!room)return ack?.({ok:false,error:'Unauthorized'});
  let removed=0;const affected=new Set();
  for(const p of [...room.g.players.values()])if(!p.sid){affected.add(p.team);room.removePlayer(p);removed++}
  for(const team of affected)if(room.g.phase==='battle'&&room.g.turn===team)room.resolve(team);
  ack?.({ok:true,removed});room.send();
 });
 sock.on('host:remove-all',(_,ack)=>{
  const room=authorizedHost(sock);if(!room)return ack?.({ok:false,error:'Unauthorized'});
  if(room.g.phase!=='lobby')return ack?.({ok:false,error:'Reset this room before removing all players'});
  const removed=room.g.players.size;
  for(const p of [...room.g.players.values()])room.removePlayer(p);
  ack?.({ok:true,removed});room.send();
 });
 for(const op of ['start','pause','resume','reset'])sock.on('host:'+op,(_,ack)=>{
  const room=authorizedHost(sock);if(!room)return ack?.({ok:false,error:'Unauthorized'});
  const g=room.g;
  if(op==='start'){
   if(g.phase!=='lobby'||!['Blue','Red'].every(t=>[...g.players.values()].some(p=>p.team===t)))return ack?.({ok:false,error:'Need players on both teams'});
   if(!['Blue','Red'].every(room.buildFleet)){
    g.teams={Blue:fresh(),Red:fresh()};
    return ack?.({ok:false,error:'Could not generate fleets, try again'});
   }
   g.phase='battle';g.turn='Blue';room.reset('Blue');room.timer();room.log('Fleets deployed automatically. Blue attacks first!');
  }else if(op==='pause'){
   if(g.phase!=='battle')return ack?.({ok:false,error:'Not in battle'});room.clear();g.phase='paused';
  }else if(op==='resume'){
   if(g.phase!=='paused')return ack?.({ok:false,error:'Not paused'});g.phase='battle';room.timer();
  }else{
   room.clear();g.phase='lobby';g.teams={Blue:fresh(),Red:fresh()};g.turn='Blue';g.winner=null;g.history=[];g.events=[];
  }
  ack?.({ok:true});room.send();
 });
 sock.on('disconnect',()=>{
  const room=matchFor(sock);if(room)room.onDisconnect(sock);
 });
});
server.listen(process.env.PORT||3000);
