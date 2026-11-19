'use strict';
const {chromium}=require('playwright');
const {io}=require('socket.io-client');
const assert=require('node:assert/strict');
const URL='http://127.0.0.1:3100';
const secret=process.env.BATTLESHIPS_HOST_KEY;
const fs=require('node:fs');
const path=require('node:path');
async function ack(sock,event,data){
 return await new Promise((resolve,reject)=>{
  sock.timeout(7000).emit(event,data,(err,res)=>{
   if(err)return reject(err);
   if(!res?.ok)return reject(new Error(event+': '+(res?.error||'Rejected')));
   resolve(res);
  });
 });
}
async function main(){
 assert(secret,'Temporary test HOST_KEY is required');
 let browser,host,hostState=null,pages=[];
 try{
  host=io(URL,{reconnection:false,transports:['websocket']});
  host.on('state',value=>{hostState=value});
  await new Promise((resolve,reject)=>{host.once('connect',resolve);host.once('connect_error',reject)});
  await ack(host,'host:auth',secret);
  await ack(host,'host:reset',null);
  await ack(host,'host:remove-all',null);
  browser=await chromium.launch({headless:true});
  const ctx=await browser.newContext({viewport:{width:1440,height:900}});
  // Exercise the authenticated Game Master player controls in an actual browser.
  const gmPage=await ctx.newPage();pages.push(gmPage);
  await gmPage.goto(URL+'/host.html',{waitUntil:'domcontentloaded'});
  await gmPage.locator('#key').fill(secret);
  await gmPage.locator('#auth button').click();
  await gmPage.locator('#dashboard').waitFor({state:'visible',timeout:8000});
  await gmPage.locator('#host-player-name').fill('GM Browser');
  await gmPage.locator('#host-player-team').selectOption('Blue');
  await gmPage.locator('#host-player-form button').click();
  await gmPage.locator('#host-player-panel').waitFor({state:'visible',timeout:8000});
  assert.equal(await gmPage.locator('#host-player-grid .cell').count(),100,'GM participation grid should have 100 squares');
  assert.equal(await gmPage.locator('#reset').isVisible(),true,'Host lost administrator controls while playing');
  const opponent=await ctx.newPage();pages.push(opponent);
  await opponent.goto(URL,{waitUntil:'domcontentloaded'});
  await opponent.locator('#name').fill('GM Opponent');
  await opponent.locator('#join button').click();
  await opponent.locator('#dashboard').waitFor({state:'visible',timeout:8000});
  await ack(host,'host:start',null);
  await gmPage.locator('#host-player-grid .cell.selectable').first().click();
  await gmPage.waitForFunction(()=>document.getElementById('host-player-turn').textContent.includes('ENEMY TURN'));
  assert(hostState.events.some(e=>e.team==='Blue'),'Host did not cast an attack vote from the Game Master interface');
  await ack(host,'host:reset',null);
  gmPage.once('dialog',dialog=>dialog.accept());
  await gmPage.locator('#host-player-leave').click();
  // Browser dialogs are handled by the explicit handler for the Leave confirmation.
  await gmPage.locator('#host-player-form').waitFor({state:'visible',timeout:8000});
  assert.equal(await gmPage.locator('#dashboard').isVisible(),true,'Host dashboard closed after leaving player role');
  await ack(host,'host:remove-all',null);
  await gmPage.close();await opponent.close();
  pages=[];
  console.log('PASS Chromium: authenticated GM joins as player, votes, leaves and keeps host controls');
  for(const name of ['BrowserBlue1','BrowserRed1','BrowserBlue2','BrowserRed2']){
   const p=await ctx.newPage();pages.push(p);
   await p.goto(URL,{waitUntil:'domcontentloaded'});
   await p.locator('#name').fill(name);
   await p.getByRole('button',{name:'Join game'}).click();
   await p.locator('#dashboard').waitFor({state:'visible',timeout:8000});
  }
  await ack(host,'host:start',null);
  const blue1=pages[0],red1=pages[1],blue2=pages[2],red2=pages[3];
  for(const p of pages)await p.locator('#enemy button.cell[data-cell="0,0"]').waitFor({state:'visible'});
  assert.equal(await blue1.locator('#own button.cell').count(),100,'Blue own grid must have 100 cells');
  assert.equal(await red1.locator('#enemy button.cell').count(),100,'Red enemy grid must have 100 cells');
  console.log('PASS Chromium: both grids render exactly 100 squares');
  assert.equal(await blue1.locator('.radar-sweep').count(),1,'Animated radar sweep element missing');
  assert.equal(await blue1.locator('#radar-points').count(),1,'Radar contact layer missing');
  assert.equal(await blue1.locator('#chat-form').count(),0,'Retired chat still visible');
  assert.equal(await blue1.locator('#intelligence').count(),0,'Retired intelligence still visible');
  assert.equal(await blue1.locator('.radar-sweep').evaluate(el=>getComputedStyle(el).animationName),'sonar-spin','Radar sweep should spin during active gameplay');
  console.log('PASS Chromium: live animated sonar, no chat or intelligence panels');

  // Blue attacks first: Red must be able to lock, without being allowed to vote.
  await red1.waitForFunction(()=>document.getElementById('turn').textContent.includes('ENEMY TURN'));
  await blue1.waitForFunction(()=>document.getElementById('turn').textContent.includes('YOUR TURN'));
  assert.match(await red1.locator('#turn').innerText(),/ENEMY TURN/);
  assert.match(await blue1.locator('#turn').innerText(),/YOUR TURN/);
  assert.equal(await blue1.locator('#enemy button.cell[data-cell="0,0"]').getAttribute('aria-label'),'Square A10');
  assert.equal(await blue1.locator('#enemy button.cell[data-cell="9,9"]').getAttribute('aria-label'),'Square J1');
  assert((await blue1.locator('#enemy button.cell').allInnerTexts()).every(text=>text===''||text==='▲'),'Empty enemy cells must not show coordinates');
  assert.equal((await blue1.locator('.axis-top').first().innerText()).replace(/\s+/g,''),'ABCDEFGHIJ');
  for(const shell of await blue1.locator('.board-shell').all()){
    const grid=await shell.locator('.board').boundingBox();
    const letters=await shell.locator('.axis-top').boundingBox();
    assert(grid&&letters&&letters.y>=grid.y+grid.height-1,'Letters should appear below the grid');
  }
  assert.equal((await blue1.locator('.axis-left').first().innerText()).replace(/\s+/g,''),'10987654321');
  assert.equal(await blue1.locator('#instruction').count(),0,'Yellow grid-shifting instruction must be gone');
  assert.equal(await blue1.locator('#enemy .cell').count(),100,'Enemy board still has 100 cells');
  console.log('PASS Chromium: chess coordinates and YOUR TURN / ENEMY TURN banners');
  await red1.locator('#lock-mode').click();
  assert.equal(await red1.locator('#lock-mode').getAttribute('aria-checked'),'true');
  assert.equal(await red1.locator('#lock-mode').getAttribute('role'),'switch');
  await red1.locator('#enemy button.cell[data-cell="0,0"]').click();
  await red1.locator('#enemy button.cell[data-cell="0,0"].locked-square').waitFor({timeout:8000});
  await red2.locator('#enemy button.cell[data-cell="0,0"].locked-square').waitFor({timeout:8000});
  assert.match(await red1.locator('#lock-status').innerText(),/LOCKED/);
  assert.equal(await blue1.locator('#enemy button.cell[data-cell="0,0"].locked-square').count(),0);
  console.log('PASS Chromium: Red locks a target with a normal click while Blue is attacking; the lock synchronizes to Red teammates only');
  await red2.locator('#lock-mode').click();
  await red2.locator('#enemy button.cell[data-cell="0,0"].locked-square').click();
  await red1.locator('#enemy button.cell[data-cell="0,0"]:not(.locked-square)').waitFor({timeout:8000});
  console.log('PASS Chromium: a second teammate unlocks the same tile with a normal click');
  // In vote mode, left-click still votes normally, including after switching modes off.
  await blue1.locator('#enemy button.cell[data-cell="0,0"]').click();
  await blue1.locator('#enemy button.cell[data-cell="0,0"].voted').waitFor({timeout:8000});
  await blue2.locator('#enemy button.cell[data-cell="0,0"]').click();
  await blue1.locator('#enemy button.cell[data-cell="0,0"].hit, #enemy button.cell[data-cell="0,0"].miss').first().waitFor({timeout:8000});
  console.log('PASS Chromium: ordinary clicks still cast attack votes and resolve a majority');
  await blue1.locator('#radar-points .radar-blip.outgoing').first().waitFor({timeout:8000});
  await red1.locator('#radar-points .radar-blip.incoming').first().waitFor({timeout:8000});
  await blue1.locator('#history .battle-event').first().waitFor({timeout:8000});
  assert.match(await blue1.locator('#history .battle-event .event-time').first().innerText(),/^\d{2}:\d{2}:\d{2}$/,'Battle event missing time');
  console.log('PASS Chromium: radar plots confirmed attacks and battle results include HH:MM:SS');

  // Continue a complete browser match to verify both sides see the correct final result.
  await red1.locator('#lock-mode').click();
  await red2.locator('#lock-mode').click();
  const targetCells=hostState.admin.Red.ships.flatMap(ship=>ship.cells);
  const ownShipCells=new Set(hostState.admin.Blue.ships.flatMap(ship=>ship.cells));
  const enemyIslands=new Set(hostState.admin.Blue.islands);
  const allCells=Array.from({length:100},(_,i)=>Math.floor(i/10)+','+(i%10));
  async function votePair(a,b,team,cell){
   const locator='#enemy button.cell[data-cell="'+cell+'"]';
   await a.waitForFunction(()=>document.getElementById('turn').textContent.includes('YOUR TURN'));
   await b.waitForFunction(()=>document.getElementById('turn').textContent.includes('YOUR TURN'));
   await a.locator(locator).click();
   await b.locator(locator).click();
   const deadline=Date.now()+10000;
   while(Date.now()<deadline){
    if(hostState?.admin?.[team]?.shots?.includes(cell))return;
    await new Promise(resolve=>setTimeout(resolve,40));
   }
   throw Error('Browser votes did not fire '+team+' at '+cell);
  }
  for(const cell of targetCells){
   if(hostState.phase==='finished')break;
   if(!hostState.admin.Blue.shots.includes(cell)){
    if(hostState.turn==='Red'){
     const miss=allCells.find(c=>!ownShipCells.has(c)&&!enemyIslands.has(c)&&!hostState.admin.Red.shots.includes(c));
     assert(miss,'No safe Red miss remaining');
     await votePair(red1,red2,'Red',miss);
    }
    await votePair(blue1,blue2,'Blue',cell);
   }
  }
  assert.equal(hostState.phase,'finished','Browser-driven game should reach victory');
  assert.equal(hostState.winner,'Blue','Expected Blue to win browser match');
  await blue1.locator('#endgame.victory').waitFor({state:'visible',timeout:10000});
  await red1.locator('#endgame.defeat').waitFor({state:'visible',timeout:10000});
  assert.match(await blue1.locator('#endgame-title').innerText(),/YOU WIN/);
  assert.match(await red1.locator('#endgame-title').innerText(),/YOUR FLEET IS SUNK/);
  assert(await blue1.locator('#endgame-effects .firework').count()>=10,'Winner fireworks missing');
  assert(await red1.locator('#endgame-effects .pirate-flag').count()>=1,'Loser pirate flags missing');
  console.log('PASS Chromium: final victory shows fireworks and explosions; defeat shows pirate skull flags');

 }catch(e){
  if(pages[0])try{await pages[0].screenshot({path:path.join(__dirname,'browser-lock-failure.png'),fullPage:true})}catch{}
  throw e;
 }finally{
  if(host?.connected){
   try{await ack(host,'host:reset',null);await ack(host,'host:remove-all',null)}catch(e){console.warn('Browser test cleanup: '+e.message)}
   host.disconnect();
  }
  if(browser)await browser.close();
 }
}
main().catch(e=>{console.error('FAIL Chromium browser lock test: '+e.stack);process.exitCode=1});
