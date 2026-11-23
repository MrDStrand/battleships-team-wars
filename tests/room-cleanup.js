'use strict';
// Isolated real Socket.IO room-expiry test. Starts a SECOND local server process,
// with a short timeout override, never connects to production or edits real games.
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const crypto=require('node:crypto');
const {io}=require('socket.io-client');
const path=require('node:path');
const PORT=3111,URL='http://127.0.0.1:'+PORT;
const KEY=crypto.randomBytes(24).toString('hex');
const IDLE_MS=1800; // ROOM_IDLE_MINUTES=.03 in this test only
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const child=spawn(process.execPath,['server.js'],{
 cwd:path.join(__dirname,'..'),env:{...process.env,HOST_KEY:KEY,PORT:String(PORT),ROOM_IDLE_MINUTES:'0.03'},
 stdio:['ignore','pipe','pipe']
});
let serverLog='',clients=[];
for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{serverLog+=chunk.toString()});
const connect=async()=>{
 const socket=io(URL,{transports:['websocket'],reconnection:false,timeout:2500});
 clients.push(socket);
 await new Promise((resolve,reject)=>{
  socket.once('connect',resolve);socket.once('connect_error',reject);
 });
 return socket;
};
async function getSocket(){
 const limit=Date.now()+9000;
 while(Date.now()<limit){
  try{return await connect()}catch{await sleep(120)}
 }
 throw Error('Cleanup test server did not start: '+serverLog.slice(-1500));
}
const send=(socket,event,arg)=>new Promise((resolve,reject)=>{
 socket.timeout(2500).emit(event,arg,(err,result)=>err?reject(Error(event+' timed out')):resolve(result));
});
const ok=async(socket,event,arg)=>{
 const result=await send(socket,event,arg);
 assert.equal(result?.ok,true,event+' failed: '+result?.error);
 return result;
};
async function verify(){
 // Room 1: player comes back before idle expiry; both room and token survive.
 const host=await getSocket();
 const code=(await ok(host,'host:create-room',KEY)).roomCode;
 const player=await getSocket();
 const token=(await ok(player,'player:join',{name:'Reconnect Test',room:code})).token;
 host.disconnect();
 await sleep(350);
 player.disconnect();
 await sleep(420);
 const returningPlayer=await getSocket();
 await ok(returningPlayer,'player:resume',token);
 await sleep(IDLE_MS+350);
 const reopenedHost=await getSocket();
 await ok(reopenedHost,'host:auth',{key:KEY,room:code});
 const roster=await new Promise(resolve=>reopenedHost.on('state',s=>{if(s.host)resolve(s.teams.Blue.players)}));
 assert(roster.some(p=>p.name==='Reconnect Test'),'Reconnect did not preserve the player');
 console.log('PASS reconnect cancels the entire idle countdown and preserves room/player token');

 // Room 2: host alone keeps a room alive, even past its former idle window.
 const onlyHost=await getSocket();
 const code2=(await ok(onlyHost,'host:create-room',KEY)).roomCode;
 await sleep(IDLE_MS+350);
 const secondObserver=await getSocket();
 await ok(secondObserver,'host:auth',{key:KEY,room:code2});
 console.log('PASS connected host alone keeps room alive indefinitely');

 // Room 3: expiry while one participant leaves but another stays connected is forbidden.
 const mixedHost=await getSocket();
 const code3=(await ok(mixedHost,'host:create-room',KEY)).roomCode;
 const mixedPlayer=await getSocket();
 const token3=(await ok(mixedPlayer,'player:join',{name:'Only Player',room:code3})).token;
 mixedHost.disconnect();
 await sleep(IDLE_MS+350);
 const playerResume=await getSocket();
 await ok(playerResume,'player:resume',token3);
 console.log('PASS connected player keeps room alive after host disconnect');

 // Room 4: fully unoccupied room expires and all of its tokens are invalidated.
 const disposableHost=await getSocket();
 const expiringCode=(await ok(disposableHost,'host:create-room',KEY)).roomCode;
 const disposablePlayer=await getSocket();
 const expiredToken=(await ok(disposablePlayer,'player:join',{name:'Expire Me',room:expiringCode})).token;
 disposableHost.disconnect();disposablePlayer.disconnect();
 await sleep(IDLE_MS+500);
 const probe=await getSocket();
 assert.equal((await send(probe,'player:resume',expiredToken)).ok,false,'Expired player token remained valid');
 assert.equal((await send(probe,'host:auth',{key:KEY,room:expiringCode})).ok,false,'Expired room remained accessible to host');
 assert.equal((await send(probe,'player:join',{name:'Too Late',room:expiringCode})).ok,false,'Expired room accepted new player');
 await ok(probe,'host:auth',{key:KEY,room:code2});
 console.log('PASS idle cleanup deletes room, rejects stale token and leaves another room untouched');

 // Repeat leave/rejoin with host only, proving host reconnect cancels expiry.
 secondObserver.disconnect();onlyHost.disconnect();
 await sleep(350);
 const hostResume=await getSocket();
 await ok(hostResume,'host:auth',{key:KEY,room:code2});
 await sleep(IDLE_MS+350);
 const hostResumeAgain=await getSocket();
 await ok(hostResumeAgain,'host:auth',{key:KEY,room:code2});
 console.log('PASS host reconnect cancels idle timer and prevents premature cleanup');

 // Finally expire an abandoned room containing a disconnected player token.
 returningPlayer.disconnect();reopenedHost.disconnect();
 await sleep(IDLE_MS+500);
 const finalProbe=await getSocket();
 assert.equal((await send(finalProbe,'player:resume',token)).ok,false,'Room 1 stale token survived cleanup');
 assert.equal((await send(finalProbe,'host:auth',{key:KEY,room:code})).ok,false,'Room 1 was not cleaned up');
 console.log('PASS all remaining offline player registrations and their tokens are purged');

 console.log('PASS room expiration test suite (short-duration isolated server)');
}
(async()=>{
 try{await verify()}
 catch(err){console.error('FAIL room expiration suite:',err.stack||err);console.error('Server log:',serverLog.slice(-2000));process.exitCode=1}
 finally{for(const s of clients)if(s.connected)s.disconnect();child.kill('SIGTERM')}
})();
