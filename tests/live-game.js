'use strict';
const {io}=require('socket.io-client');
const fs=require('node:fs'),path=require('node:path');
const url=process.env.TARGET_URL||'https://battleships-team-wars.onrender.com';
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
async function two(p,q,target,label){assert(p.state?.board?.options?.includes(target),p.name+': '+target+' unavailable for '+label);assert(q.state?.board?.options?.includes(target),q.name+': '+target+' unavailable for '+label);await ok(p,'vote',target);await ok(q,'vote',target)}
async function fleet(team,pair){for(let n=0;n<5;n++){let p=pair[0];await wait(()=>p.state?.phase==='placement'&&p.state?.board?.stage==='cell'&&p.state.board.ship,team+' selecting ship');let cell=p.state.board.options[0];assert(cell,team+' has no valid ship starting square');await two(...pair,cell,team+' placement');await wait(()=>p.state?.board?.stage==='direction'&&p.state.board.selected===cell,team+' direction');let dir=p.state.board.options[0];assert(dir,team+' has no legal direction');await two(...pair,dir,team+' direction');await wait(()=>host.state?.admin?.[team]?.ships?.length===n+1,team+' ship '+(n+1))}pass(team+' placed 5 ships')}
async function fire(pair,team,target){await wait(()=>pair[0].state?.phase==='battle'&&pair[0].state?.turn===team,team+' attack turn');await two(...pair,target,team+' attack');attacks++;await wait(()=>host.state?.admin?.[team]?.shots?.includes(target),team+' shot recorded at '+target)}
function option(team,allowed){let p=team==='Blue'?blue[0]:red[0];return (p.state?.board?.options||[]).find(allowed)}
async function run(){
 assert(process.env.CONFIRM_LIVE_RESET==='RESET','Enter exactly RESET in confirm_live_reset');
 assert(key,'Set repository Actions secret BATTLESHIPS_HOST_KEY');
 assert(url.startsWith('https://'),'Target must use HTTPS');
 phase='preflight';
 host=await connect('Game Master');await wait(()=>host.state,'initial state');
 let denied=await ack(host,'host:reset',null);assert(!denied.ok,'Unauthenticated reset was allowed');pass('GM-only reset enforced');
 await ok(host,'host:auth',key);await wait(()=>host.state?.host&&host.state?.admin,'authenticated GM state');pass('GM authentication');
 const num=host.state.teams.Blue.players.length+host.state.teams.Red.players.length;
 assert(num===0,'Found '+num+' registered player(s); restart the Render service to clear old sessions before testing. No reset was performed.');
 assert(host.state.phase==='lobby','Game is '+host.state.phase+'; refusing to reset active game');
 await ok(host,'host:reset',null);pass('Safe live reset authorized');
 phase='joining';
 let all=[];
 for(let name of ['TestBlue1','TestRed1','TestBlue2','TestRed2']){let p=await connect(name);p.token=(await ok(p,'player:join',{name})).token;await wait(()=>p.state?.me,name+' joined');all.push(p)}
 blue=[all[0],all[2]];red=[all[1],all[3]];
 assert(blue.every(p=>p.state.me.team==='Blue')&&red.every(p=>p.state.me.team==='Red'),'Incorrect team assignment');pass('Four players allocated 2 versus 2');
 assert(blue[0].state.teams.Blue.players.length===2&&!blue[0].state.admin&&!red[0].state.admin,'Roster or admin-data problem');pass('Teammate rosters and GM data privacy');
 await ok(blue[0],'chat:send','Blue-only integration test');
 await wait(()=>blue[1].state?.chat?.some(x=>x.text==='Blue-only integration test'),'Blue private chat');
 assert(!red[0].state.chat.some(x=>x.text==='Blue-only integration test'),'Private chat leaked');pass('Team-private chat');
 assert(!(await ack(blue[0],'host:start',null)).ok,'Player could start the game');pass('Players denied GM controls');
 phase='placement';
 await ok(host,'host:start',null);await wait(()=>host.state?.phase==='placement','placement start');
 assert(['Blue','Red'].every(t=>host.state.admin[t].islands.length>0),'Missing team islands');pass('Islands generated');
 await fleet('Blue',blue);await fleet('Red',red);
 await wait(()=>host.state?.phase==='battle','battle start');pass('Both fleets placed, battle started');
 await wait(()=>blue[0].state?.intelligence?.length&&red[0].state?.intelligence?.length,'initial intelligence');
 assert(!blue[0].state.admin&&!red[0].state.admin,'Player received GM-only data');pass('Team intelligence and secrecy');
 phase='battle';
 await ok(host,'host:pause',null);await wait(()=>host.state?.phase==='paused','pause');
 assert(!(await ack(blue[0],'vote','0,0')).ok,'Vote accepted while paused');
 await ok(host,'host:resume',null);await wait(()=>host.state?.phase==='battle','resume');
 pass('Pause, resume and paused-vote rejection');
 const redCells=new Set(host.state.admin.Red.ships.flatMap(s=>s.cells));
 const blueCells=new Set(host.state.admin.Blue.ships.flatMap(s=>s.cells));
 await wait(()=>blue[0].state?.turn==='Blue'&&blue[0].state?.phase==='battle','Blue turn');
 let miss=option('Blue',c=>!redCells.has(c));assert(miss,'No legal Blue miss target');await fire(blue,'Blue',miss);
 await wait(()=>blue[0].state.board.attacks.includes(miss),'Blue miss state');assert(!blue[0].state.board.hitCells.includes(miss),'Miss reported as hit');pass('Miss recorded',miss);
 await wait(()=>red[0].state?.turn==='Red'&&red[0].state?.phase==='battle','Red turn');
 let hit=option('Red',c=>blueCells.has(c));assert(hit,'No legal Red hit target');await fire(red,'Red',hit);
 await wait(()=>blue[0].state?.board?.incoming?.includes(hit),'own fleet hit');
 assert(blue[0].state.board.ships.some(x=>x.hits.includes(hit)),'Own-ship hit not visible in player state');pass('Own-ship hit recorded',hit);
 blue[1].sock.disconnect();await wait(()=>blue[0].state?.board?.needed===1,'Blue majority after disconnect');
 let solo=option('Blue',c=>redCells.has(c));assert(solo,'No legal solo attack');await ok(blue[0],'vote',solo);attacks++;await wait(()=>host.state.admin.Blue.shots.includes(solo),'solo-majority shot');pass('Disconnected teammate no longer blocks majority');
 let reconnect=await connect('Returning Blue');reconnect.token=blue[1].token;
 await ok(reconnect,'player:join',{name:'TestBlue2',token:reconnect.token});await wait(()=>reconnect.state?.me?.team==='Blue','Blue reconnect');blue[1]=reconnect;pass('Reconnect with existing identity');
 await wait(()=>red[0].state?.turn==='Red'&&red[0].state?.phase==='battle','Red follow-up');
 let redMiss=option('Red',c=>!blueCells.has(c));assert(redMiss,'No legal Red miss');await fire(red,'Red',redMiss);pass('Miss reported on own fleet',redMiss);
 for(let target of [...redCells].filter(c=>!host.state.admin.Blue.shots.includes(c))){
   await wait(()=>blue[0].state?.phase==='battle'&&blue[0].state?.turn==='Blue','Blue next turn');
   assert(blue[0].state.board.options.includes(target),'Red ship cell '+target+' not available as a legal attack');
   await fire(blue,'Blue',target);
   if(host.state.phase==='finished')break;
   await wait(()=>red[0].state?.phase==='battle'&&red[0].state?.turn==='Red','Red next turn');
   let next=option('Red',c=>!blueCells.has(c));assert(next,'Red ran out of safe misses');
   await fire(red,'Red',next);
 }
 await wait(()=>host.state?.phase==='finished','victory',18000);
 assert(host.state.winner==='Blue','Unexpected winner '+host.state.winner);pass('Full game reaches Blue victory',String(attacks)+' attacks');
 assert(blue[0].state.intelligence.length>1,'Intelligence was not refreshed');pass('Intelligence refreshed during play');
}
(async()=>{try{await run()}catch(e){test.push({name:'Interrupted during '+phase,status:'FAIL',detail:String(e.message||e)});console.error('FAIL '+String(e.message||e));process.exitCode=1}finally{const result={target:url,date:new Date().toISOString(),phase:host?.state?.phase||phase,passed:test.filter(t=>t.status==='PASS').length,failed:test.filter(t=>t.status==='FAIL').length,attacks,duration_seconds:Math.round((Date.now()-started)/1000),tests:test,note:'Socket.IO multiplayer test only, not browser color or layout testing. Restart Render after a completed test to remove registered test players.'};fs.writeFileSync(reportFile,JSON.stringify(result,null,2));console.log('RESULT '+result.passed+' passed, '+result.failed+' failed');console.log('REPORT '+reportFile);clients.forEach(p=>p.sock.disconnect())}})();
