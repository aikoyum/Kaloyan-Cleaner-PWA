/* Kaloyan Cleaner PWA — explicit image capture; no browser extension APIs. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const KEY = 'kc_personal_gemini_key';
  const CODE = 'kc_license_code';
  const MODE = 'kc_mode';
  const PIN = 'kc_pin_v1';
  const CONSENT = 'kc_consent';
  const MODEL = 'kc_model';
  const STYLE = 'kc_style';
  const ALLOWED_MODELS = ['gemini-2.5-flash','gemini-2.5-flash-lite','gemini-3.1-flash-lite','gemini-3.5-flash-lite'];
  const DEFAULT_PROMPT = 'Analyze the visible image as a permitted study or document exercise. Read carefully and do not invent missing information. Determine the actual task format: use a letter only when the image shows genuine multiple-choice options; otherwise give the required number, word, formula, matching pairs, transcription, or concise written answer. Cover all clearly visible numbered tasks. If text is unreadable or uncertain, state that instead of guessing.';
  const state = {image:null, original:null, bitmap:null, selection:null, dragging:false, start:null, busy:false, answer:'', apiMode:localStorage.getItem(MODE)==='server'?'server':'personal'};
  let installPrompt = null;
  let toastTimer = null;
  function notify(message) { const el=$('toast'); el.textContent=message; el.hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.hidden=true,4500); }
  function setAnswer(body,{error=false,meta='',status='RESULT'}={}) {
    state.answer=error?'':body;
    $('answerStatus').textContent=status;
    $('answerBody').textContent=body;
    $('answerBody').className=error?'answer-body error':'answer-body';
    $('answerMeta').textContent=meta||'—';
    $('copyBtn').disabled=!state.answer;
  }
  function setPending(pending){state.busy=pending;$('analyzeBtn').disabled=pending||!state.image||!$('consentCheckbox').checked;$('analyzeLabel').textContent=pending?'Analyzing…':'Analyze image';$('captureBtn').disabled=pending;$('uploadBtn').disabled=pending;}
  function refreshConnection(){
    const ready=state.apiMode==='personal' ? Boolean(sessionStorage.getItem(KEY)) : Boolean(sessionStorage.getItem(CODE));
    $('connectionDot').classList.toggle('on',ready);
    $('connectionText').textContent=ready?(state.apiMode==='personal'?'Personal Gemini key':'License entered'):'Not configured';
  }
  function syncMode(){
    document.querySelectorAll('input[name="apiMode"]').forEach(r=>r.checked=r.value===state.apiMode);
    $('personalSettings').hidden=state.apiMode!=='personal';
    $('serverSettings').hidden=state.apiMode!=='server';
    $('apiKey').value=sessionStorage.getItem(KEY)||'';
    $('licenseCode').value=sessionStorage.getItem(CODE)||'';
    refreshConnection();
  }
  async function loadBlob(blob,source='image'){
    if(!(blob instanceof Blob)||!blob.type.startsWith('image/'))throw new Error('Choose a PNG, JPG or WebP image.');
    if(blob.size>18*1024*1024)throw new Error('Image is too large (limit 18 MB).');
    const url=URL.createObjectURL(blob);
    try{
      const img=new Image();
      await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Could not open image.'));img.src=url;});
      const scale=Math.min(1,2000/Math.max(img.naturalWidth,img.naturalHeight));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      canvas.getContext('2d',{alpha:false}).drawImage(img,0,0,canvas.width,canvas.height);
      const data=canvas.toDataURL('image/jpeg',0.83);
      state.original=data;
      await setCurrentImage(data,source);
    } finally {URL.revokeObjectURL(url);}
  }
  async function setCurrentImage(data,source='image'){
    const img=new Image();
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Invalid image.'));img.src=data;});
    state.image=data;state.bitmap=img;state.selection=null;
    $('emptyPreview').hidden=true;$('previewCanvas').hidden=false;$('dropZone').classList.add('has-image');
    $('cropHint').hidden=false;
    $('previewCanvas').width=img.naturalWidth;$('previewCanvas').height=img.naturalHeight;
    $('imageInfo').textContent=`${img.naturalWidth} × ${img.naturalHeight} · ${source}`;
    $('resetCropBtn').disabled=!state.original||state.image===state.original;
    $('cropBtn').disabled=true;$('removeBtn').disabled=false;
    drawPreview();setPending(false);
    setAnswer('Image ready. Select an area to crop, or analyze the full image.',{meta:'Ready to analyze',status:'IMAGE READY'});
  }
  function drawPreview(){
    if(!state.bitmap)return;
    const c=$('previewCanvas'),ctx=c.getContext('2d');
    ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(state.bitmap,0,0,c.width,c.height);
    if(state.selection){const r=state.selection;ctx.fillStyle='#06142165';ctx.fillRect(0,0,c.width,c.height);ctx.clearRect(r.x,r.y,r.w,r.h);ctx.drawImage(state.bitmap,r.x,r.y,r.w,r.h,r.x,r.y,r.w,r.h);ctx.strokeStyle='#80efb7';ctx.lineWidth=Math.max(2,c.width/700);ctx.setLineDash([Math.max(8,c.width/150),Math.max(5,c.width/230)]);ctx.strokeRect(r.x+1,r.y+1,r.w,r.h);ctx.setLineDash([]);}
  }
  function point(e){const c=$('previewCanvas'),r=c.getBoundingClientRect();return{x:Math.min(c.width,Math.max(0,(e.clientX-r.left)*c.width/r.width)),y:Math.min(c.height,Math.max(0,(e.clientY-r.top)*c.height/r.height))};}
  function normalizeRect(a,b){return{x:Math.floor(Math.min(a.x,b.x)),y:Math.floor(Math.min(a.y,b.y)),w:Math.round(Math.abs(a.x-b.x)),h:Math.round(Math.abs(a.y-b.y))};}
  const canvas=$('previewCanvas');
  canvas.addEventListener('pointerdown',e=>{if(!state.image||state.busy)return;state.dragging=true;state.start=point(e);state.selection=null;canvas.setPointerCapture(e.pointerId);e.preventDefault();});
  canvas.addEventListener('pointermove',e=>{if(!state.dragging)return;state.selection=normalizeRect(state.start,point(e));drawPreview();e.preventDefault();});
  function finishDrag(e){if(!state.dragging)return;state.dragging=false;state.selection=normalizeRect(state.start,point(e));if(state.selection.w<12||state.selection.h<12)state.selection=null;$('cropBtn').disabled=!state.selection;drawPreview();}
  canvas.addEventListener('pointerup',finishDrag);
  canvas.addEventListener('pointercancel',()=>{state.dragging=false;state.selection=null;drawPreview();});
  $('cropBtn').addEventListener('click',async()=>{
    const r=state.selection;if(!r||!state.bitmap)return;
    const c=document.createElement('canvas');c.width=r.w;c.height=r.h;
    c.getContext('2d',{alpha:false}).drawImage(state.bitmap,r.x,r.y,r.w,r.h,0,0,r.w,r.h);
    await setCurrentImage(c.toDataURL('image/jpeg',.85),'cropped');notify('Crop applied');
  });
  $('resetCropBtn').addEventListener('click',async()=>{if(state.original)await setCurrentImage(state.original,'original');});
  $('removeBtn').addEventListener('click',clearImage);
  function clearImage(){state.image=null;state.original=null;state.bitmap=null;state.selection=null;$('emptyPreview').hidden=false;canvas.hidden=true;$('cropHint').hidden=true;$('dropZone').classList.remove('has-image');$('imageInfo').textContent='No image selected';$('cropBtn').disabled=true;$('resetCropBtn').disabled=true;$('removeBtn').disabled=true;setPending(false);setAnswer('Your analysis will appear here after you select an image.',{meta:'',status:'RESULT'});}
  async function capture(){
    if(state.busy)return;
    if(!navigator.mediaDevices?.getDisplayMedia){notify('Screen capture is unavailable here. Try Upload image.');return;}
    let stream;
    try{
      // Must be called synchronously from the click handler for browser user activation.
      stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
      const video=document.createElement('video');video.muted=true;video.playsInline=true;video.srcObject=stream;
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Capture timed out.')),12000);video.onloadedmetadata=()=>{clearTimeout(timer);resolve();};video.onerror=()=>{clearTimeout(timer);reject(new Error('Cannot read screen source.'));};});
      await video.play();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(!video.videoWidth||!video.videoHeight)throw new Error('No video frame was received.');
      const c=document.createElement('canvas');const factor=Math.min(1,2000/Math.max(video.videoWidth,video.videoHeight));c.width=Math.round(video.videoWidth*factor);c.height=Math.round(video.videoHeight*factor);
      c.getContext('2d',{alpha:false}).drawImage(video,0,0,c.width,c.height);
      const jpg=c.toDataURL('image/jpeg',.83);state.original=jpg;await setCurrentImage(jpg,'screen capture');notify('Screen captured. You can now crop the image.');
      video.srcObject=null;
    }catch(e){if(e.name!=='NotAllowedError')notify(`Capture failed: ${e.message}`);else notify('Screen sharing was cancelled or blocked.');}
    finally{stream?.getTracks().forEach(t=>t.stop());}
  }
  $('captureBtn').addEventListener('click',capture);
  $('uploadBtn').addEventListener('click',()=>$('fileInput').click());
  $('fileInput').addEventListener('change',async e=>{const file=e.target.files?.[0];if(file){try{await loadBlob(file,'uploaded')}catch(err){notify(err.message)}}e.target.value='';});
  const drop=$('dropZone');
  drop.addEventListener('click',()=>{if(!state.image)$('fileInput').click()});
  drop.addEventListener('keydown',e=>{if(!state.image&&(e.key==='Enter'||e.key===' ')){e.preventDefault();$('fileInput').click()}});
  drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('drag-over')});
  drop.addEventListener('dragleave',()=>drop.classList.remove('drag-over'));
  drop.addEventListener('drop',async e=>{e.preventDefault();drop.classList.remove('drag-over');const file=[...e.dataTransfer.files].find(f=>f.type.startsWith('image/'));if(file){try{await loadBlob(file,'dropped')}catch(err){notify(err.message)}}});
  document.addEventListener('paste',async e=>{if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;const item=[...(e.clipboardData?.items||[])].find(x=>x.type.startsWith('image/'));if(item){e.preventDefault();try{await loadBlob(item.getAsFile(),'pasted')}catch(err){notify(err.message)}}});
  function createPrompt(){
    const custom=$('taskPrompt').value.trim().slice(0,1500);
    const style=$('answerStyle').value;
    const output=style==='explain'?'Provide the answer followed by a short explanation.':style==='extract'?'Transcribe the visible document text accurately. Preserve ordering and state any unreadable fragments.':'Be brief: just the appropriate answer(s) with minimal labels. Do not invent a multiple-choice letter when there are no options.';
    return `${DEFAULT_PROMPT}\n${output}${custom?`\nAdditional user instructions: ${custom}`:''}`;
  }
  async function requestGemini({image,prompt,model}){
    if(state.apiMode==='server'){
      const code=(sessionStorage.getItem(CODE)||'').trim();
      if(!code)throw new Error('Enter your activation code in Settings.');
      const r=await fetch('/.netlify/functions/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({licenseCode:code,image,prompt,model}),signal:AbortSignal.timeout(55000)});
      const data=await r.json().catch(()=>({error:'Invalid server response'}));
      if(!r.ok)throw new Error(data.error||`Server error ${r.status}`);
      if(!data.answer)throw new Error('Gemini returned an empty answer.');
      return{answer:data.answer,model:data.model||model};
    }
    const key=(sessionStorage.getItem(KEY)||'').trim();
    if(!key)throw new Error('Enter your personal Gemini API key in Settings.');
    const base64=image.split(',')[1];
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
      method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},signal:AbortSignal.timeout(45000),
      body:JSON.stringify({contents:[{parts:[{text:prompt},{inline_data:{mime_type:'image/jpeg',data:base64}}]}],generationConfig:{temperature:.1,maxOutputTokens:1024}})
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.error?.message||`Gemini HTTP ${r.status}`);
    const answer=(data.candidates||[]).flatMap(c=>c.content?.parts||[]).map(x=>x.text||'').join('\n').trim();
    if(!answer)throw new Error(data.promptFeedback?.blockReason?`Blocked: ${data.promptFeedback.blockReason}`:'Gemini returned an empty result.');
    return {answer,model};
  }
  $('analyzeBtn').addEventListener('click',async()=>{
    if(!state.image||state.busy||!$('consentCheckbox').checked)return;
    setPending(true);setAnswer('Sending your selected image to Gemini…',{status:'ANALYZING',meta:'This may take a few seconds'});
    const model=$('modelSelect').value;
    try{
      if(!ALLOWED_MODELS.includes(model))throw new Error('Invalid Gemini model.');
      const result=await requestGemini({image:state.image,prompt:createPrompt(),model});
      setAnswer(result.answer,{status:'COMPLETE',meta:`${result.model} · ${new Date().toLocaleTimeString()}`});
    }catch(e){let msg=e.name==='TimeoutError'?'Gemini request timed out.':e.message;if(msg==='Failed to fetch')msg='Network or browser policy blocked the request. Try the managed server deployment.';setAnswer(msg,{error:true,status:'ERROR',meta:'Check Settings and retry'});}
    finally{setPending(false);}
  });
  $('consentCheckbox').addEventListener('change',e=>{localStorage.setItem(CONSENT,e.target.checked?'yes':'no');setPending(false)});
  $('copyBtn').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(state.answer);notify('Result copied')}catch(e){notify('Clipboard permission unavailable.')}});
  $('answerStyle').addEventListener('change',()=>localStorage.setItem(STYLE,$('answerStyle').value));
  $('modelSelect').addEventListener('change',()=>{$('modelPill').textContent=$('modelSelect').selectedOptions[0].textContent;localStorage.setItem(MODEL,$('modelSelect').value)});
  function closeSettings(){$('settingsDialog').close();}
  $('settingsBtn').addEventListener('click',()=>{syncMode();$('settingsMessage').textContent='';$('settingsDialog').showModal();});
  $('closeSettings').addEventListener('click',e=>{e.preventDefault();closeSettings()});
  document.querySelectorAll('input[name="apiMode"]').forEach(el=>el.addEventListener('change',e=>{state.apiMode=e.target.value;syncMode()}));
  $('toggleKey').addEventListener('click',()=>{$('apiKey').type=$('apiKey').type==='password'?'text':'password';$('toggleKey').textContent=$('apiKey').type==='password'?'Show':'Hide'});
  $('clearKeyBtn').addEventListener('click',()=>{sessionStorage.removeItem(KEY);$('apiKey').value='';refreshConnection();notify('Key forgotten')});
  $('clearLicenseBtn').addEventListener('click',()=>{sessionStorage.removeItem(CODE);$('licenseCode').value='';refreshConnection();notify('License forgotten')});
  $('saveSettings').addEventListener('click',()=>{
    state.apiMode=document.querySelector('input[name="apiMode"]:checked').value;
    localStorage.setItem(MODE,state.apiMode);
    const key=$('apiKey').value.trim(),code=$('licenseCode').value.trim().toUpperCase();
    if(key)sessionStorage.setItem(KEY,key);
    if(code)sessionStorage.setItem(CODE,code);
    refreshConnection();closeSettings();notify('Settings saved for this browser session');
  });
  async function hashPin(pin,salt){const input=new TextEncoder().encode(`${salt}:${pin}`);const hash=await crypto.subtle.digest('SHA-256',input);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');}
  $('setPinBtn').addEventListener('click',async()=>{const p=$('pinInput').value;if(!/^\d{4}$/.test(p)){$('settingsMessage').textContent='Enter exactly 4 digits.';return;}const salt=[...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join('');localStorage.setItem(PIN,JSON.stringify({salt,hash:await hashPin(p,salt)}));sessionStorage.setItem('kc_unlocked','yes');$('pinInput').value='';$('settingsMessage').textContent='Local PIN enabled. It will be requested in a new session.';});
  $('removePinBtn').addEventListener('click',()=>{localStorage.removeItem(PIN);sessionStorage.removeItem('kc_unlocked');$('settingsMessage').textContent='Local PIN removed.';});
  async function unlock(){const saved=localStorage.getItem(PIN);if(!saved){$('pinDialog').close();return;}try{const x=JSON.parse(saved),valid=await hashPin($('unlockPin').value,x.salt)===x.hash;if(valid){sessionStorage.setItem('kc_unlocked','yes');$('unlockPin').value='';$('unlockError').textContent='';$('pinDialog').close()}else{$('unlockError').textContent='Incorrect PIN.';}}catch(e){$('unlockError').textContent='PIN lock data is invalid.';}}
  $('unlockBtn').addEventListener('click',unlock);
  $('unlockPin').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();unlock()}});
  $('pinDialog').addEventListener('cancel',e=>e.preventDefault());
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('installBtn').hidden=false;});
  $('installBtn').addEventListener('click',async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('installBtn').hidden=true;});
  window.addEventListener('appinstalled',()=>{$('installBtn').hidden=true;notify('App installed')});
  function init(){
    $('consentCheckbox').checked=localStorage.getItem(CONSENT)==='yes';
    const chosen=localStorage.getItem(MODEL);if(ALLOWED_MODELS.includes(chosen))$('modelSelect').value=chosen;
    const style=localStorage.getItem(STYLE);if(['brief','explain','extract'].includes(style))$('answerStyle').value=style;
    $('modelPill').textContent=$('modelSelect').selectedOptions[0].textContent;
    refreshConnection();clearImage();
    if(localStorage.getItem(PIN)&&sessionStorage.getItem('kc_unlocked')!=='yes')$('pinDialog').showModal();
    if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
  init();
})();
