import { parseBetSlip } from './bet-slip-parser.js';
import { icon } from './ui-icons.js';
const esc=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LIMIT=12*1024*1024;

export class BetSlipImport {
  constructor({onDraft}) {
    this.onDraft=onDraft;this.job=0;this.worker=null;this.draft=null;this.busy=false;
    this.dialog=document.createElement('dialog');this.dialog.id='slip-dialog';this.dialog.className='tracker-dialog';this.dialog.setAttribute('aria-labelledby','slip-title');
    this.dialog.innerHTML=`<header class="tracker-dialog-header"><div><span class="tracker-kicker">Screenshot import</span><h2 id="slip-title">Start with your bet slip</h2></div><button type="button" class="tracker-icon-button" data-slip-close aria-label="Close screenshot import">${icon('close')}</button></header><div class="slip-body"><p class="slip-intro">Choose a screenshot. We’ll read the text and prepare a ticket for you to check.</p><div class="slip-drop"><span class="slip-upload-icon">${icon('paper')}</span><strong>Drop a bet slip here</strong><p>PNG, JPG or WebP · up to 12 MB</p><button type="button" class="tracker-button" data-slip-choose>Choose screenshot</button><small>You can also paste an image from your clipboard.</small><input type="file" accept="image/png,image/jpeg,image/webp" data-slip-file aria-label="Bet slip screenshot" hidden></div><div class="slip-preview" hidden><img alt="Your bet slip screenshot"><div><strong data-slip-filename></strong><button class="tracker-button" type="button" data-slip-choose>Replace screenshot</button></div></div><div class="slip-progress" hidden><div><span data-slip-status role="status">Preparing text reader…</span><button type="button" data-slip-stop>Cancel reading</button></div><progress max="1" aria-label="Screenshot reading progress"></progress></div><p class="slip-error" role="alert" hidden></p><div class="slip-draft" hidden></div><details class="slip-text-entry"><summary>Paste or correct the ticket text</summary><label>Text from your slip<textarea data-slip-text rows="8" maxlength="24000" placeholder="Player, selection, line, stake and ticket odds…" spellcheck="false"></textarea></label><button type="button" class="tracker-button" data-slip-parse>Read these details</button></details><p class="slip-privacy">Read on your device. Your screenshot is not uploaded or saved. English text works best; unclear or missing details need your review.</p></div><footer class="tracker-dialog-footer"><button type="button" class="tracker-button" data-slip-close>Cancel</button><button type="button" class="tracker-button primary" data-slip-use disabled>Review ticket ${icon('arrow')}</button></footer>`;
    document.body.append(this.dialog);
    this.$=selector=>this.dialog.querySelector(selector);
    this.dialog.addEventListener('click',event=>{
      if(event.target.closest('[data-slip-close]'))this.dialog.close();
      if(event.target.closest('[data-slip-choose]'))this.$('[data-slip-file]').click();
      if(event.target.closest('[data-slip-stop]')){this.cancel();this.message('Reading canceled. Choose another image or paste the ticket text.');}
      if(event.target.closest('[data-slip-parse]')){this.cancel();this.readText(this.$('[data-slip-text]').value);}
      if(event.target.closest('[data-slip-use]')&&this.draft&&!this.busy){const draft={...this.draft,preview:this.$('.slip-preview').hidden?'':this.$('.slip-preview img').src};this.returnToForm=true;this.dialog.close();this.onDraft(draft);}
    });
    this.$('[data-slip-file]').addEventListener('change',event=>{const file=event.target.files[0];if(file)this.readFile(file);event.target.value='';});
    this.dialog.addEventListener('dragover',event=>{event.preventDefault();this.$('.slip-drop').classList.add('dragging');});
    this.dialog.addEventListener('dragleave',()=>this.$('.slip-drop').classList.remove('dragging'));
    this.dialog.addEventListener('drop',event=>{event.preventDefault();this.$('.slip-drop').classList.remove('dragging');const file=event.dataTransfer?.files[0];if(file)this.readFile(file);});
    document.addEventListener('paste',event=>{if(!this.dialog.open)return;const item=[...event.clipboardData.items].find(item=>item.type.startsWith('image/'));if(item){event.preventDefault();this.readFile(item.getAsFile());}});
    this.dialog.addEventListener('close',()=>{this.cancel();this.$('.slip-preview img').removeAttribute('src');if(!this.returnToForm)this.trigger?.focus({preventScroll:true});});
  }
  open(){
    this.trigger=document.activeElement;this.returnToForm=false;this.draft=null;this.$('.slip-error').hidden=true;this.$('.slip-draft').hidden=true;this.$('.slip-preview').hidden=true;this.$('.slip-drop').hidden=false;this.$('[data-slip-text]').value='';this.$('.slip-text-entry').open=false;this.$('[data-slip-use]').disabled=true;this.dialog.showModal();this.$('[data-slip-choose]').focus();
  }
  cancel(){this.job++;this.busy=false;this.worker?.terminate();this.worker=null;this.$('.slip-progress').hidden=true;this.$('[data-slip-use]').disabled=!this.draft?.recognized;}
  message(text){this.$('.slip-error').textContent=text;this.$('.slip-error').hidden=false;}
  readText(text){
    this.draft=parseBetSlip(text);this.$('[data-slip-use]').disabled=!this.draft.recognized;this.$('.slip-error').hidden=true;
    const {fields,legs,issues}=this.draft;
    this.$('.slip-draft').hidden=false;
    this.$('.slip-draft').innerHTML=`<div class="slip-draft-title">${icon('check')}<h3>${this.draft.recognized?'Details ready to review':'No ticket details found'}</h3></div><dl><div><dt>Sportsbook</dt><dd>${esc(fields.book||'Not found')}</dd></div><div><dt>Stake</dt><dd>${fields.stake!==''?'$'+Number(fields.stake).toFixed(2):'Not found'}</dd></div><div><dt>Ticket odds</dt><dd>${fields.odds!==''?(fields.oddsFormat==='american'&&fields.odds>0?'+':'')+fields.odds:'Not found'}</dd></div><div><dt>Date placed</dt><dd>${esc(fields.date||'Not found')}</dd></div></dl>${legs.length?`<ol>${legs.map(l=>`<li><strong>${esc(l.label)}</strong><span>${esc(l.market==='moneyline'?'Moneyline':l.side==='at_least'?l.line+'+':l.side==='home'?'Spread '+l.line:l.side+' '+l.line)}</span></li>`).join('')}</ol>`:''}${issues.length?`<div class="slip-review-notes"><strong>Check these details</strong><ul>${issues.map(issue=>`<li>${esc(issue)}</li>`).join('')}</ul></div>`:''}<p>Nothing is saved yet. Confirm every selection, stake and combined price in the ticket form. Results start as open.</p>`;
    this.$('.slip-draft').scrollIntoView({block:'nearest'});
  }
  async readFile(file){
    this.cancel();this.draft=null;this.$('[data-slip-use]').disabled=true;this.$('.slip-draft').hidden=true;this.$('.slip-error').hidden=true;
    this.$('.slip-preview img').removeAttribute('src');this.$('.slip-preview').hidden=true;this.$('.slip-drop').hidden=false;this.$('[data-slip-text]').value='';
    if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)){this.message('Choose a PNG, JPG or WebP screenshot. Convert HEIC or PDF files to an image first.');return;}
    if(file.size>LIMIT){this.message('This image is larger than 12 MB. Crop or resize it and try again.');return;}
    const job=this.job;this.busy=true;this.$('.slip-progress').hidden=false;this.$('progress').removeAttribute('value');
    const status=text=>{if(job===this.job)this.$('[data-slip-status]').textContent=text;};status('Preparing your screenshot…');
    let timer;
    try{
      const dataURL=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
      const image=new Image();image.src=dataURL;await image.decode();
      if(job!==this.job)return;
      if(image.width*image.height>24000000)throw Error('oversized');
      this.$('.slip-preview img').src=dataURL;this.$('[data-slip-filename]').textContent=file.name||'Pasted screenshot';this.$('.slip-preview').hidden=false;this.$('.slip-drop').hidden=true;
      const scale=Math.min(2,2200/Math.max(image.width,image.height));
      const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
      const context=canvas.getContext('2d',{willReadFrequently:true});context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
      const pixels=context.getImageData(0,0,canvas.width,canvas.height);let sum=0,count=0;
      for(let i=0;i<pixels.data.length;i+=64){sum+=(pixels.data[i]+pixels.data[i+1]+pixels.data[i+2])/3;count++;}
      const invert=sum/count<125;
      for(let i=0;i<pixels.data.length;i+=4){const gray=.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2];pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=invert?255-gray:gray;}
      context.putImageData(pixels,0,0);
      status('Loading the on-device text reader…');
      const task=(async()=>{
        const {default:Tesseract}=await import('/vendor/ocr/tesseract.esm.min.js');
        if(job!==this.job)return null;
        const worker=await Tesseract.createWorker('eng',1,{workerPath:'/vendor/ocr/worker.min.js',corePath:'/vendor/ocr',langPath:'/vendor/ocr',workerBlobURL:false,cacheMethod:'none',errorHandler:()=>{},logger:message=>{if(job!==this.job)return;if(message.status==='recognizing text'){status('Reading your slip… '+Math.round(message.progress*100)+'%');this.$('progress').value=message.progress;}}});
        if(job!==this.job){await worker.terminate();return null;}
        this.worker=worker;await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});
        const result=await worker.recognize(canvas);return result.data.text;
      })();
      const text=await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),90000);})]);
      if(job!==this.job||text===null)return;
      this.$('[data-slip-text]').value=text;this.readText(text);
      if(!text.trim()){this.message('No readable text was found. Use a sharper, tightly cropped screenshot, or paste the ticket text.');this.$('.slip-text-entry').open=true;}
    }catch(error){
      if(job===this.job){this.message(error.message==='oversized'?'This image is too large to read safely. Resize it below 24 megapixels.':'The screenshot could not be read. Try a clearer image, or paste the ticket text below.');this.$('.slip-text-entry').open=true;}
    }finally{
      clearTimeout(timer);
      if(job===this.job){this.cancel();this.$('[data-slip-use]').disabled=!this.draft?.recognized;}
    }
  }
}
