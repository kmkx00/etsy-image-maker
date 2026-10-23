// Run npm install, npx playwright install chromium, then npm run test:browser.
// BROWSER=webkit npm run test:browser also exercises installed WebKit.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {chromium,webkit}=require('playwright');

(async()=>{
 const browserType=process.env.BROWSER==='webkit'?webkit:chromium;
 const browser=await browserType.launch({headless:true,...(browserType===chromium?{channel:'chromium'}:{})});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  const fixtures=await page.evaluate(async()=>{
   const result=[];
   for(let i=0;i<13;i++){
    const c=document.createElement('canvas');
    c.width=c.height=i===0?3600:256;
    const ctx=c.getContext('2d');
    ctx.fillStyle='#6c8daf';
    ctx.fillRect(c.width*.3,c.height*.3,c.width*.4,c.height*.4);
    if(i===0){
     const faint=ctx.createImageData(10,10);
     for(let p=0;p<faint.data.length;p+=4){
      faint.data[p]=100;faint.data[p+3]=1;
     }
     ctx.putImageData(faint,20,30);
    }
    result.push({name:i===12?'bonus-pattern.png':`${i+1}-art.png`,base64:c.toDataURL().split(',')[1]});
   }
   return result;
  });
  const files=fixtures.map(f=>({name:f.name,mimeType:'image/png',buffer:Buffer.from(f.base64,'base64')}));
  await page.locator('#files').setInputFiles(files);
  await page.waitForFunction(()=>!working&&artwork.length===13&&ready());
  assert.equal(await page.locator('#pattern').inputValue(),'12');
  const bounds=await page.evaluate(()=>artwork[0].bounds);
  assert(bounds.x<=20&&bounds.y<=30,'Faint original-resolution pixels must survive bounds detection');
  assert(bounds.x+bounds.width>=2520&&bounds.y+bounds.height>=2520);

  // Pause after generation starts to exercise controls and the original race.
  await page.evaluate(()=>{
   window.realBlob=canvasBlob;
   window.renderedSettings=[];
   const originalRender=render;
   render=(c,i,settings,items)=>{
    window.renderedSettings.push(settings.title);
    originalRender(c,i,settings,items);
   };
   canvasBlob=async(...args)=>{
    if(args[0].width===W&&!window.paused){
     window.paused=true;
     await new Promise(resolve=>window.releaseGeneration=resolve);
    }
    return window.realBlob(...args);
   };
  });
  await page.locator('#generate').click();
  await page.waitForFunction(()=>window.releaseGeneration);
  for(const id of ['files','title','subtitle','dark','accent','bg','pattern','generate']){
   assert(await page.locator('#'+id).isDisabled(),id+' must be disabled during generation');
  }
  await page.evaluate(()=>{
   $('title').value='Changed during generation';
   $('title').dispatchEvent(new Event('input'));
   window.releaseGeneration();
  });
  await page.waitForFunction(()=>!working&&exports.length===8&&zipBlob!==null);
  assert(await page.locator('#results').isVisible());
  assert.equal(await page.locator('#pages button').count(),8);
  assert.deepEqual(await page.evaluate(()=>window.renderedSettings),Array(8).fill('Something Blue'));
  const dimensions=await page.evaluate(async()=>{
   const sizes=[];
   for(const item of exports){
    const bitmap=await createImageBitmap(item.blob);
    sizes.push([bitmap.width,bitmap.height]);bitmap.close();
   }
   return sizes;
  });
  assert.deepEqual(dimensions,Array.from({length:8},()=>[3000,3000]));
  for(let i=0;i<8;i++){
   await page.locator('#pages button').nth(i).click();
   await page.waitForFunction(()=>$('preview').complete&&$('preview').naturalWidth===3000);
  }
  await page.evaluate(()=>showPage(99));

  // Save actual ZIP bytes for independent extraction/CRC checks outside the browser.
  const zip=Buffer.from(await page.evaluate(async()=>Array.from(new Uint8Array(await zipBlob.arrayBuffer()))));
  const zipPath=path.join(os.tmpdir(),'etsy-generator-'+(process.env.BROWSER||'chromium')+'.zip');
  fs.writeFileSync(zipPath,zip);

  // Capture all eight rendered pages in one temporary visual QA sheet.
  const sheet=await page.evaluate(async()=>{
   const c=document.createElement('canvas');c.width=1200;c.height=600;
   const ctx=c.getContext('2d');
   for(let i=0;i<exports.length;i++){
    const img=await createImageBitmap(exports[i].blob);
    ctx.drawImage(img,(i%4)*300,Math.floor(i/4)*300,300,300);img.close();
   }
   return c.toDataURL().split(',')[1];
  });
  fs.writeFileSync(path.join(os.tmpdir(),'etsy-generator-'+(process.env.BROWSER||'chromium')+'.png'),Buffer.from(sheet,'base64'));

  // A failed render must leave no partial downloads, and retry must recover.
  await page.evaluate(()=>{canvasBlob=async()=>{throw new Error('Test export failure')}});
  await page.locator('#generate').click();
  await page.waitForFunction(()=>!working&&$('progress').textContent.includes('Test export failure'));
  assert(await page.locator('#results').isHidden());
  assert.equal(await page.evaluate(()=>exports.length),0);
  assert.equal(await page.evaluate(()=>zipBlob),null);
  assert(await page.locator('#files').isEnabled());
  await page.evaluate(()=>canvasBlob=window.realBlob);
  await page.locator('#generate').click();
  await page.waitForFunction(()=>!working&&exports.length===8&&zipBlob!==null);

  // Unknown filenames require an explicit bonus selection instead of guessing.
  await page.locator('#files').setInputFiles(files.map((f,i)=>({...f,name:`element-${i}.png`})));
  await page.waitForFunction(()=>!working&&artwork.length===13);
  assert.equal(await page.locator('#pattern').inputValue(),'');
  assert(await page.locator('#generate').isDisabled());
  await page.locator('#pattern').selectOption('0');
  assert(await page.locator('#generate').isEnabled());
  await page.locator('#files').setInputFiles(files.slice(0,12));
  await page.waitForFunction(()=>!working);
  assert(await page.locator('#generate').isDisabled());
  assert(await page.locator('#results').isHidden());
  assert.deepEqual(errors,[]);
  console.log('PASS: faint-alpha bounds, busy controls, immutable settings, eight 3000px previews, ZIP generation, failure recovery, explicit bonus selection, invalid file count.');
  console.log('ZIP for extraction check: '+zipPath);
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
