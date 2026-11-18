'use strict';
const {io}=require('socket.io-client');
const fs=require('node:fs'),path=require('node:path');
// Use the dedicated loopback-only server started by GitHub Actions. Never connect test credentials to the public deployment.
const url='http://127.0.0.1:3100';
const key=process.env.BATTLESHIPS_HOST_KEY;
const reportFile=path.join(__dirname,'battleships-test-report.json');
const test=[],clients=[],started=Date.now();
let phase='setup',host,blue,red,attacks=0;
const pass=(name,detail='')=>{test.push({name,status:'PASS',detail});console.log('PASS '+name+(detail?' - '+detail:''));};
const assert=(b,m)=>{if(!b)throw Error(m)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn,label,ms=15000){let end=Date.now()+ms;while(Date.now()<end){let v=fn();if(v)return v;await sleep(50)}throw Error('Timeout: '+label)}
function connect(name){return new Promise((resolve,reject)=>{let sock=io(url,{transports:['websocket','polling'],timeout:20000,reconnection:false});let p={name,sock,state:null,token:null};clients.push(p);sock.on('state',s=>p.state=s);sock.once('connect',()=>resolve(p));sock.once('connect_error',e=>reject(Error(name+' connection failed: '+e.message)));setTimeout(()=>{if(!sock.connected)reject(Error(name+' connection timed out'))},25000).unref()})}
const ack=(p,event,value)=>new Promise((resolve,reject)=>p.sock.timeout(16000).emit(event,value,(err,result)=>err?reject(Error(p.name+' '+event+' timed out')):resolve(result||{})));
async function ok(p,event,value){let r=await ack(p,event,value);assert(r.ok,p.name+' '+event+' refused: '+(r.error||'unknown'));return r}
async function two(p,q,target,label){const snapshot=p.state;assert(snapshot?.board?.options?.includes(target),p.name+': '+target+' unavailable for '+label);await wait(()=>q.state?.phase===snapshot.phase&&q.state?.turn===snapshot.turn&&q.state?.board?.stage===snapshot.board.stage&&q.state.board.selected===snapshot.board.selected&&q.state.board.options.includes(target),q.name+' to receive '+label+' options ('+target+')');await ok(p,'vote',target);await ok(q,'vote',target)}
async function fire(pair,team,target){await wait(()=>pair[0].state?.phase==='battle'&&pair[0].state?.turn===team,team+' attack turn');await two(...pair,target,team+' attack');attacks++;await wait(()=>host.state?.admin?.[team]?.shots?.includes(target),team+' shot recorded at '+target)}
function option(team,allowed){let p=team==='Blue'?blue[0]:red[0];return (p.state?.board?.options||[]).find(allowed)}
async function run(){
 assert(key,'Isolated test session key is missing');
 assert(url==='http://127.0.0.1:3100','Integration tests must target the isolated loopback server');
 phase='preflight';
 host=await connect('Game Master');await wait(()=>host.state,'initial state');
 let denied=await ack(host,'host:reset',null);assert(!denied.ok,'Unauthenticated reset was allowed');pass('GM-only reset enforced');
 await ok(host,'host:auth',key);await wait(()=>host.state?.host&&host.state?.admin,'authenticated GM state');pass('GM authentication');
 assert(host.state.phase==='lobby','Isolated server did not start in lobby phase');
 const players=host.state.teams.Blue.players.length+host.state.teams.Red.players.length;
 assert(players===0,'Isolated server unexpectedly started with '+players+' players');
 await ok(host,'host:reset',null);pass('Fresh isolated lobby ready');
 phase='roster administration';
 assert(!(await ack(host,'host:kick','not-a-player')).ok,'Kick accepted nonexistent player');
 const temp=await connect('Kick target');
 temp.token=(await ok(temp,'player:join',{name:'Kick target'})).token;
 await wait(()=>host.state.teams.Blue.players.some(p=>p.name==='Kick target'&&p.id),'GM can see temporary player ID');
 const tempId=host.state.teams.Blue.players.find(p=>p.name==='Kick target').id;
 let kickedEvent=false;temp.sock.once('player:kicked',()=>{kickedEvent=true});
 await ok(host,'host:kick',tempId);
 await wait(()=>kickedEvent&&host.state.teams.Blue.players.every(p=>p.id!==tempId),'kicked player removed');
 const stale=await connect('Invalid token test');
 assert(!(await ack(stale,'player:resume',temp.token)).ok,'Kicked token was allowed to resume');
 pass('GM kicks player, invalidates token, and notifies client');
 const disconnected=await connect('Disconnected target');
 const staleToken=(await ok(disconnected,'player:join',{name:'Disconnected target'})).token;
 await wait(()=>host.state.teams.Blue.players.some(p=>p.name==='Disconnected target'),'disconnected test registration');
 disconnected.sock.disconnect();
 await wait(()=>host.state.teams.Blue.players.some(p=>p.name==='Disconnected target'&&!p.online),'disconnected registration status');
 const cleaned=await ok(host,'host:clear-disconnected',null);
 assert(cleaned.removed===1,'Expected exactly one disconnected player, got '+cleaned.removed);
 await wait(()=>host.state.teams.Blue.players.length===0,'disconnected player removed');
 assert(!(await ack(stale,'player:resume',staleToken)).ok,'Cleared player token still valid');
 pass('GM clears disconnected registrations without changing battle');
 const allTarget=await connect('Remove-all target');
 await ok(allTarget,'player:join',{name:'Remove-all target'});
 await wait(()=>host.state.teams.Blue.players.length===1,'remove-all test player joined');
 const removedAll=await ok(host,'host:remove-all',null);
 assert(removedAll.removed===1,'Remove-all did not remove one registered player');
 await wait(()=>host.state.teams.Blue.players.length===0,'all players removed');
 pass('GM removes all players in lobby');
 phase='joining';
 let all=[];
 for(let name of ['TestBlue1','TestRed1','TestBlue2','TestRed2']){let p=await connect(name);p.token=(await ok(p,'player:join',{name})).token;await wait(()=>p.state?.me,name+' joined');all.push(p)}
 const assignments=all.map(p=>p.name+'='+p.state.me.team);
 console.log('TEAM ASSIGNMENTS '+assignments.join(', '));
 blue=all.filter(p=>p.state.me.team==='Blue');red=all.filter(p=>p.state.me.team==='Red');
 await wait(()=>host.state.teams.Blue.players.length+host.state.teams.Red.players.length>=4,'GM roster reaches four registered players');
 const joinedRoster=[...host.state.teams.Blue.players,...host.state.teams.Red.players];
 const expected=new Set(all.map(p=>p.name));
 assert(joinedRoster.length===4&&joinedRoster.every(p=>expected.has(p.name)),'Unexpected registered player(s) joined during test: '+joinedRoster.map(p=>p.name).join(', ')+'. Close all player tabs, return to lobby and retry.');
 assert(blue.length===2&&red.length===2,'Teams not balanced: '+assignments.join(', '));
 await wait(()=>blue.every(p=>p.state.teams.Blue.players.length===2)&&red.every(p=>p.state.teams.Red.players.length===2),'rosters synchronized');
 pass('Four players allocated 2 versus 2',assignments.join(', '));
 assert(!blue[0].state.admin&&!red[0].state.admin,'GM data leaked to players');pass('Teammate rosters and GM data privacy');
 await ok(blue[0],'chat:send','Blue-only integration test');
 await wait(()=>blue[1].state?.chat?.some(x=>x.text==='Blue-only integration test'),'Blue private chat');
 assert(!red[0].state.chat.some(x=>x.text==='Blue-only integration test'),'Private chat leaked');pass('Team-private chat');
 assert(!(await ack(blue[0],'host:start',null)).ok,'Player could start the game');pass('Players denied GM controls');
 phase='fleet generation';
 await ok(host,'host:start',null);
 await wait(()=>host.state?.phase==='battle','automatic fleet start');
 assert(['Blue','Red'].every(t=>host.state.admin[t].islands.length>0),'Missing team islands');pass('Islands generated');
 for(const team of ['Blue','Red']){
   const a=host.state.admin[team],occupied=new Set(),islands=new Set(a.islands);
   assert(a.ships.length===5,team+' did not receive 5 ships');
   for(const ship of a.ships){
     assert(ship.cells.length===ship.length,team+' ship length invalid: '+ship.name);
     const rows=ship.cells.map(x=>Number(x.split(',')[0])),cols=ship.cells.map(x=>Number(x.split(',')[1]));
     assert(new Set(rows).size===1||new Set(cols).size===1,team+' ship not straight: '+ship.name);
     for(const c of ship.cells){
       const [y,x]=c.split(',').map(Number);
       assert(y>=0&&y<10&&x>=0&&x<10,team+' out-of-bounds ship cell');
       assert(!islands.has(c)&&!occupied.has(c),team+' ship overlaps land or another ship');
       occupied.add(c);
     }
   }
   for(let i=0;i<a.ships.length;i++)for(let j=i+1;j<a.ships.length;j++)for(const c of a.ships[i].cells){
      const [y,x]=c.split(',').map(Number);
      for(const d of a.ships[j].cells){const [dy,dx]=d.split(',').map(Number);assert(Math.abs(y-dy)+Math.abs(x-dx)!==1,team+' ships touch orthogonally')}
   }
   pass(team+' random fleet is legal (5 ships)');
 }
 assert(host.state.turn==='Blue','Blue must attack first');pass('Automatic battle start and Blue first');
 assert(!blue[0].state.board.ships.some(x=>!x.cells?.length),'Blue should see its own ships');
 assert(!blue[0].state.board.enemyShips,'Enemy ship data leaked');pass('Own ships visible and enemy ships hidden');
 await wait(()=>blue[0].state?.intelligence?.length&&red[0].state?.intelligence?.length,'initial intelligence');
 assert(!blue[0].state.admin&&!red[0].state.admin,'Player received GM-only data');pass('Team intelligence and secrecy');
 phase='battle';
 await ok(host,'host:pause',null);await wait(()=>host.state?.phase==='paused','pause');
 assert(!(await ack(blue[0],'vote','0,0')).ok,'Vote accepted while paused');
 await ok(host,'host:resume',null);await wait(()=>host.state?.phase==='battle','resume');
 pass('Pause, resume and paused-vote rejection');
 assert(blue[0].state.board.size===10&&red[0].state.board.size===10,'Boards must be 10x10');
 assert(blue[0].state.board.options.length<=100,'Too many board cells');
 pass('Both teams have 10x10 grids');
 const lockTarget=blue[0].state.board.options[0];
 assert(lockTarget,'Missing Blue lock target');
 assert(!(await ack(blue[0],'target:lock','99,99')).ok,'Out-of-bounds target lock accepted');
 assert(!(await ack(host,'target:lock',lockTarget)).ok,'Non-player allowed to lock');
 const firstLock=await ok(blue[0],'target:lock',lockTarget);
 assert(firstLock.locked===true,'Lock action did not lock target');
 await wait(()=>blue[1].state.board.locked.includes(lockTarget)&&!blue[1].state.board.options.includes(lockTarget),'Blue lock synchronized across team');
 assert(!(await ack(blue[1],'vote',lockTarget)).ok,'Server accepted a vote on a locked square');
 assert(!red[0].state.board.locked.includes(lockTarget),'Blue lock leaked to Red team');
 pass('Team-wide lock synchronized; locked votes rejected; opponent locks private');
 const unlock=await ok(blue[1],'target:lock',lockTarget);
 assert(unlock.locked===false,'Teammate did not unlock the target');
 await wait(()=>blue[0].state.board.options.includes(lockTarget)&&!blue[1].state.board.locked.includes(lockTarget),'unlock synchronized');
 pass('A teammate can unlock another player\'s square');
 await ok(blue[0],'target:lock',lockTarget);
 await wait(()=>blue[1].state.board.locked.includes(lockTarget),'relock synchronized');
 await ok(blue[1],'target:lock',lockTarget);
 await wait(()=>blue[0].state.board.options.includes(lockTarget),'relock released');
 pass('Repeated lock and unlock preserves vote availability');
 const pending=blue[0].state.board.options[0];
 await ok(blue[0],'vote',pending);
 await wait(()=>blue[1].state.board.votes[pending]===1,'first vote visible');
 await ok(blue[1],'target:lock',pending);
 await wait(()=>!blue[0].state.board.votes[pending]&&blue[0].state.board.myVote===null,'lock cancels outstanding vote');
 assert(!host.state.admin.Blue.shots.includes(pending),'Lock unexpectedly fired an attack');
 await ok(blue[0],'target:lock',pending);
 await wait(()=>blue[1].state.board.options.includes(pending),'unlock restores voting option');
 pass('Locking a pending vote cancels it without firing');
 const redCells=new Set(host.state.admin.Red.ships.flatMap(s=>s.cells));
 const blueCells=new Set(host.state.admin.Blue.ships.flatMap(s=>s.cells));
 await wait(()=>blue[0].state?.turn==='Blue'&&blue[0].state?.phase==='battle','Blue turn');
 let miss=option('Blue',c=>!redCells.has(c));assert(miss,'No legal Blue miss target');await fire(blue,'Blue',miss);
 await wait(()=>blue[0].state.board.attacks.includes(miss),'Blue miss state');assert(!blue[0].state.board.hitCells.includes(miss),'Miss reported as hit');await wait(()=>red[0].state.board.latestIncoming===miss,'Red latest incoming miss');pass('Miss recorded and latest incoming marker',miss);
 await wait(()=>red[0].state?.turn==='Red'&&red[0].state?.phase==='battle','Red turn');
 let hit=option('Red',c=>blueCells.has(c));assert(hit,'No legal Red hit target');await fire(red,'Red',hit);
 await wait(()=>blue[0].state?.board?.incoming?.includes(hit),'own fleet hit');
 assert(blue[0].state.board.ships.some(x=>x.hits.includes(hit)),'Own-ship hit not visible in player state');assert(blue[0].state.board.latestIncoming===hit,'Latest attack marker missing on own-hit square');pass('Own-ship hit and latest marker recorded',hit);
 blue[1].sock.disconnect();await wait(()=>blue[0].state?.board?.needed===1,'Blue majority after disconnect');
 let solo=option('Blue',c=>redCells.has(c));assert(solo,'No legal solo attack');await ok(blue[0],'vote',solo);attacks++;await wait(()=>host.state.admin.Blue.shots.includes(solo),'solo-majority shot');pass('Disconnected teammate no longer blocks majority');
 let reconnect=await connect('Returning Blue');reconnect.token=blue[1].token;
 await ok(reconnect,'player:join',{name:blue[1].name,token:reconnect.token});await wait(()=>reconnect.state?.me?.team==='Blue','Blue reconnect');blue[1]=reconnect;pass('Reconnect with existing identity');
 await wait(()=>red[0].state?.turn==='Red'&&red[0].state?.phase==='battle','Red follow-up');
 let redMiss=option('Red',c=>!blueCells.has(c));assert(redMiss,'No legal Red miss');await fire(red,'Red',redMiss);await wait(()=>blue[0].state.board.latestIncoming===redMiss,'Latest incoming marker moved');pass('Latest incoming marker moves on new enemy shot',redMiss);
 for(let target of [...redCells].filter(c=>!host.state.admin.Blue.shots.includes(c))){
   await wait(()=>blue[0].state?.phase==='battle'&&blue[0].state?.turn==='Blue','Blue next turn');
   assert(blue[0].state.board.options.includes(target),'Red ship cell '+target+' not available as a legal attack');
   await fire(blue,'Blue',target);
   const identified=host.state.admin.Red.ships.filter(ship=>ship.cells.every(c=>host.state.admin.Blue.shots.includes(c)));
   await wait(()=>identified.every(ship=>blue[0].state.board.sunkEnemyShips?.some(x=>x.name===ship.name&&x.cells.length===ship.length&&x.cells.every(c=>ship.cells.includes(c)))),'complete sunk ship segments');
   if(identified.length&&identified.some(ship=>ship.cells.includes(target)))pass('Entire sunk ship identified for rendering',identified.map(ship=>ship.name).join(', '));
   if(host.state.phase==='finished')break;
   await wait(()=>red[0].state?.phase==='battle'&&red[0].state?.turn==='Red','Red next turn');
   let next=option('Red',c=>!blueCells.has(c));assert(next,'Red ran out of safe misses');
   await fire(red,'Red',next);
 }
 await wait(()=>host.state?.phase==='finished','victory',18000);
 assert(host.state.winner==='Blue','Unexpected winner '+host.state.winner);pass('Full game reaches Blue victory',String(attacks)+' attacks');
 assert(blue[0].state.intelligence.length>1,'Intelligence was not refreshed');pass('Intelligence refreshed during play');
}
(async()=>{try{await run()}catch(e){test.push({name:'Interrupted during '+phase,status:'FAIL',detail:String(e.message||e)});console.error('FAIL '+String(e.message||e));process.exitCode=1}finally{const result={target:url,date:new Date().toISOString(),phase:host?.state?.phase||phase,passed:test.filter(t=>t.status==='PASS').length,failed:test.filter(t=>t.status==='FAIL').length,attacks,duration_seconds:Math.round((Date.now()-started)/1000),tests:test,note:'Isolated GitHub Actions Socket.IO integration test against a temporary local server using the current repository code. NOT a test of deployed Render, nor a visual browser test.'};fs.writeFileSync(reportFile,JSON.stringify(result,null,2));console.log('RESULT '+result.passed+' passed, '+result.failed+' failed');console.log('REPORT '+reportFile);clients.forEach(p=>p.sock.disconnect())}})();
