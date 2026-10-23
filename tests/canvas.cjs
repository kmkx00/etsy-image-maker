// Real raster rendering and actual app handlers, with a small DOM test double.
// Native browser behavior is covered separately by tests/generator.cjs.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const os=require('node:os');
const {createCanvas,loadImage}=require('@napi-rs/canvas');

class Element{
 constructor(){this.value='';this.children=[];this.listeners={};this.disabled=false;this.hidden=false;this.classList={toggle(){}}}
 addEventListener(name,fn){this.listeners[name]=fn}
 replaceChildren(...nodes){this.children=nodes;if(nodes[0]&&'value' in nodes[0])this.value=nodes[0].value}
 append(node){this.children.push(node)}
 add(node){this.append(node)}
 removeAttribute(name){delete this[name]}
}
function Option(text,value){this.text=text;this.value=value}
const elements={};
const get=id=>elements[id]??=new Element();
get('title').value='Something Blue';get('subtitle').value='BRIDAL CLIPART COLLECTION';
get('dark').value='#425c73';get('accent').value='#e6eef3';get('bg').value='#f9f7f3';
const document={getElementById:get,createElement(tag){
 if(tag!=='canvas')return new Element();
 const c=createCanvas(1,1);
 c.toBlob=(callback,type='image/png',quality=0.9)=>{
  c.encode(type==='image/jpeg'?'jpeg':'png',Math.round(quality*100))
   .then(bytes=>callback(new Blob([bytes],{type}))).catch(()=>callback(null));
 };
 return c;
}};
const context=vm.createContext({document,Option,URL,Blob,TextEncoder,setTimeout,console,navigator:{}});
const source=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8').split('<script>')[1].split('</script>')[0];
vm.runInContext(source,context);
// Use the native image decoder for the VM's canvas context.
context.decode=async blob=>({img:await loadImage(Buffer.from(await blob.arrayBuffer())),url:URL.createObjectURL(blob)});
vm.runInContext('readImage=decode',context);
const run=code=>vm.runInContext(code,context);

(async()=>{
 const files=[];
 for(let i=0;i<13;i++){
  const c=createCanvas(i===0?3600:256,i===0?3600:256);
  const ctx=c.getContext('2d');ctx.fillStyle='#6c8daf';
  ctx.fillRect(c.width*.3,c.height*.3,c.width*.4,c.height*.4);
  if(i===0){
   const faint=ctx.createImageData(10,10);
   for(let p=0;p<faint.data.length;p+=4){faint.data[p]=100;faint.data[p+3]=1}
   ctx.putImageData(faint,20,30);
  }
  files.push(new File([await c.encode('png')],i===12?'bonus-pattern.png':`${String(i+1).padStart(2,'0')}-art.png`,{type:'image/png'}));
 }
 const uploading=get('files').listeners.change({target:{files}});
 assert(get('files').disabled,'File input locks immediately during preparation');
 await uploading;
 assert.equal(run('artwork.length'),13);assert.equal(get('pattern').value,'12');assert(run('ready()'));
 const bounds=run('artwork[0].bounds');
 assert(bounds.x<=20&&bounds.y<=30,'Faint pixels must be inside the retained crop');
 assert(bounds.x+bounds.width>=2520&&bounds.y+bounds.height>=2520);
 console.log('PASS: full-resolution alpha=1 details retained; 12 clipart + bonus selection.');

 run(`windowlessSettings=[]; realBlob=canvasBlob; realRender=render;
 render=(c,i,settings,items)=>{windowlessSettings.push(settings.title);realRender(c,i,settings,items)};
 canvasBlob=async(...args)=>{
  if(args[0].width===W&&!globalThis.paused){globalThis.paused=true;await new Promise(r=>globalThis.release=r)}
  return realBlob(...args);
 }`);
 const generation=get('generate').onclick();
 for(const id of ['files','title','subtitle','dark','accent','bg','pattern','generate'])assert(get(id).disabled,id+' must lock');
 get('title').value='Changed while busy';get('title').listeners.input();
 // A synthetic file-change event must not replace the generation's artwork.
 await get('files').listeners.change({target:{files:[]}});
 assert.equal(run('artwork.length'),13);
 run('release()');await generation;
 assert.equal(run('exports.length'),8);assert(run('zipBlob instanceof Blob'));
 assert.equal(get('results').hidden,false);assert.equal(get('pages').children.length,8);
 assert.deepEqual(Array.from(run('windowlessSettings')),Array(8).fill('Something Blue'));
 const items=run('exports');
 const sheet=createCanvas(1200,600),sheetContext=sheet.getContext('2d');
 for(let i=0;i<items.length;i++){
  const img=await loadImage(Buffer.from(await items[i].blob.arrayBuffer()));
  assert.equal(img.width,3000);assert.equal(img.height,3000);
  sheetContext.drawImage(img,(i%4)*300,Math.floor(i/4)*300,300,300);
  run(`showPage(${i})`);
 }
 run('showPage(99)');
 const output=path.join(os.tmpdir(),'etsy-generator-canvas');
 fs.writeFileSync(output+'.png',await sheet.encode('png'));
 fs.writeFileSync(output+'.zip',Buffer.from(await run('zipBlob.arrayBuffer()')));
 console.log('PASS: busy controls, immutable settings, all eight 3000px rasters and page previews.');

 run('canvasBlob=async()=>{throw new Error("Injected export failure")}');
 await get('generate').onclick();
 assert.equal(run('exports.length'),0);assert.equal(run('zipBlob'),null);
 assert.equal(get('results').hidden,true);assert.equal(get('files').disabled,false);
 assert(get('progress').textContent.includes('Injected export failure'));
 run('canvasBlob=realBlob');await get('generate').onclick();
 assert.equal(run('exports.length'),8);
 console.log('PASS: failed export exposes no partial results; retry recovers.');

 await get('files').listeners.change({target:{files:files.map((f,i)=>new File([f],`element-${i}.png`,{type:f.type}))}});
 assert.equal(get('pattern').value,'');assert(get('generate').disabled);
 get('pattern').value='0';get('pattern').listeners.input();assert(!get('generate').disabled);
 await get('files').listeners.change({target:{files:files.slice(0,12)}});
 assert(get('generate').disabled);assert(get('results').hidden);
 const transparent=createCanvas(256,256);
 await assert.rejects(()=>context.decode(new Blob(['invalid png'])));
 context.blank=new File([await transparent.encode('png')],'blank.png',{type:'image/png'});
 await assert.rejects(()=>run('preparePNG(blank)'),/fully transparent/);
 console.log('PASS: ambiguous bonus requires selection; invalid count and transparent PNG rejected.');
 console.log('Raster contact sheet: '+output+'.png');
 console.log('ZIP: '+output+'.zip');
})().catch(error=>{console.error(error);process.exitCode=1});
