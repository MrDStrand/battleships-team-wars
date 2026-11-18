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
 let browser,host,pages=[];
 try{
  host=io(URL,{reconnection:false,transports:['websocket']});
  await new Promise((resolve,reject)=>{host.once('connect',resolve);host.once('connect_error',reject)});
  await ack(host,'host:auth',secret);
  await ack(host,'host:reset',null);
  await ack(host,'host:remove-all',null);
  browser=await chromium.launch({headless:true});
  const ctx=await browser.newContext({viewport:{width:1440,height:900}});
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
  // Blue attacks first: Red must be able to lock, without being allowed to vote.
  assert.match(await red1.locator('#turn').innerText(),/Blue attacking/);
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
