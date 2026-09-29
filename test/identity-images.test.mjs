import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareIdentityImages} from '../public/sports-identity.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const flush=()=>new Promise(resolve=>queueMicrotask(resolve));
class ImageStub extends EventTarget {
  tagName='IMG';dataset={identityImage:''};complete=true;naturalWidth=320;srcset='';
  classes=new Set();writes=0;decodeCalls=0;
  classList={add:name=>this.classes.add(name),remove:name=>this.classes.delete(name)};
  constructor(pending){super();this._src='https://example.com/headshot.png';this.pending=pending;}
  get src(){return this._src;}
  set src(value){this._src=value;this.complete=false;this.naturalWidth=0;this.writes++;}
  matches(selector){return selector==='[data-identity-image]';}
  decode(){this.decodeCalls++;return this.pending.promise;}
  loaded(){return this.classes.has('identity-loaded');}
}

test('cached dimensions do not replace initials until the bitmap is decoded',async()=>{
  const pending=deferred(),img=new ImageStub(pending);
  prepareIdentityImages(img);
  prepareIdentityImages(img);
  assert.equal(img.complete,true);
  assert.equal(img.naturalWidth,320);
  assert.equal(img.loaded(),false);
  assert.equal(img.decodeCalls,1,'Revisiting an image must not start duplicate decodes');
  pending.resolve();await flush();
  assert.equal(img.loaded(),true);
});

test('decode rejection leaves initials visible despite available dimensions',async()=>{
  const pending=deferred(),img=new ImageStub(pending);
  prepareIdentityImages(img);
  pending.reject(new Error('Bitmap could not decode'));await flush();
  assert.equal(img.loaded(),false);
  assert.equal(img.naturalWidth,320);
  prepareIdentityImages(img);
  assert.equal(img.decodeCalls,1,'A rejected bitmap is not retried on every DOM mutation');
});

test('an obsolete decode cannot reveal a changed source',async()=>{
  const old=deferred(),img=new ImageStub(old);
  prepareIdentityImages(img);
  img.src='https://example.com/next-player.png';
  old.resolve();await flush();
  assert.equal(img.loaded(),false,'The old decode stays invalid even before the attribute observer runs');
  const next=deferred();img.pending=next;img.complete=true;img.naturalWidth=240;
  prepareIdentityImages(img);
  assert.equal(img.loaded(),false);
  next.resolve();await flush();
  assert.equal(img.loaded(),true);
  img.src='https://example.com/third-player.png';
  prepareIdentityImages(img);
  assert.equal(img.loaded(),false,'Changing an already visible image restores the fallback while loading');
});

test('failed images retry their supplied fallback once and decode it before reveal',async()=>{
  const pending=deferred(),img=new ImageStub(pending);
  img.naturalWidth=0;img.dataset.identityFallback='https://example.com/primary-team.png';
  prepareIdentityImages(img);
  assert.equal(img.src,'https://example.com/primary-team.png');
  assert.equal(img.dataset.identityFallback,undefined);
  assert.equal(img.writes,1);
  assert.equal(img.loaded(),false);
  img.complete=true;img.naturalWidth=40;img.dispatchEvent(new Event('load'));
  assert.equal(img.loaded(),false);
  pending.resolve();await flush();
  assert.equal(img.loaded(),true);
  img.naturalWidth=0;img.dispatchEvent(new Event('error'));
  assert.equal(img.loaded(),false);
  assert.equal(img.writes,1,'An exhausted fallback must not loop');
});

test('images still loading wait for their load event before decoding',async()=>{
  const pending=deferred(),img=new ImageStub(pending);
  img.complete=false;img.naturalWidth=0;
  prepareIdentityImages(img);
  assert.equal(img.decodeCalls,0);
  img.complete=true;img.naturalWidth=320;img.dispatchEvent(new Event('load'));
  assert.equal(img.decodeCalls,1);
  assert.equal(img.loaded(),false);
  pending.resolve();await flush();
  assert.equal(img.loaded(),true);
});
