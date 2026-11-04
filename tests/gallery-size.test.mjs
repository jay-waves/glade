import test from 'node:test';
import assert from 'node:assert/strict';
import {resizeGallery,gallerySizeLevels} from '../web/gallery/gallery-zoom.mjs';
import {galleryColumns,galleryLayout} from '../web/gallery/gallery-layout.mjs';

test('masonry size buttons change exactly one column and reverse without visual drift',()=>{
 for(const width of [280,540,700,720,960,1440,1800]){
  for(const size of [140,175,220,275,340,420]){
   for(const direction of [-1,1]){
    const next=resizeGallery(size,direction,false,width,false);
    if(next===size) continue;
    assert.equal(galleryColumns(width,next),galleryColumns(width,size)-direction);
    const back=resizeGallery(next,-direction,false,width,false);
    assert.equal(galleryColumns(width,back),galleryColumns(width,size));
    assert.deepEqual(galleryLayout([1,1.5,.6],width,back),galleryLayout([1,1.5,.6],width,size));
   }
  }
 }
});
test('size levels are balanced and one-column cards preserve media proportions',()=>{
 for(let i=1;i<gallerySizeLevels.length;i++){
  const ratio=gallerySizeLevels[i]/gallerySizeLevels[i-1];
  assert.ok(ratio>1.2 && ratio<1.3);
 }
 assert.equal(resizeGallery(220,1,false,0,true),275);
 assert.equal(resizeGallery(275,-1,false,0,true),220);
 for(const size of [140,220,420]){
  const {items:[card]}=galleryLayout([1.5],160,size);
  assert.ok(Math.abs((card.width-2)/(card.height-2)-1.5)<1e-9);
 }
 assert.equal(resizeGallery(220,1,false,160,false),220);
});
