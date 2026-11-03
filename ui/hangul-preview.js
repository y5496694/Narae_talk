(()=>{'use strict';
 window.createHangulPreview=({view,mode,slider,ratio,isOpen,previous,next})=>{
  let choice='height',scale=1,drag=null;
  const image=()=>view.querySelector('img');
  function paint({anchor,reset=false}={}){
   const img=image();if(!isOpen()||!img?.naturalWidth||!view.clientHeight)return;
   const before=img.getBoundingClientRect(),style=getComputedStyle(view),height=view.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom),width=view.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
   const point=anchor||null,at=point&&before.width?{x:(point.x-before.left)/before.width,y:(point.y-before.top)/before.height}:null;
   if(choice==='height')scale=Math.max(0.01,height/img.naturalHeight);else if(choice==='width')scale=Math.max(0.01,width/img.naturalWidth);else if(choice!=='custom')scale=Number(choice)/100;
   img.style.width=(img.naturalWidth*scale)+'px';img.style.maxWidth='none';img.draggable=false;
   slider.value=String(Math.round(scale*100));ratio.textContent=Math.round(scale*100)+'%';mode.value=choice;
   if(reset){view.scrollLeft=0;view.scrollTop=0;}
   else if(at){const after=img.getBoundingClientRect();view.scrollLeft+=after.left+at.x*after.width-point.x;view.scrollTop+=after.top+at.y*after.height-point.y;}
  }
  function center(){const rect=view.getBoundingClientRect();return {x:rect.left+view.clientWidth/2,y:rect.top+view.clientHeight/2};}
  function zoom(percent,anchor=center()){choice='custom';scale=Math.max(Number(slider.min),Math.min(Number(slider.max),percent))/100;paint({anchor});}
  mode.value='height';mode.onchange=()=>{choice=mode.value;paint({reset:true});};slider.oninput=()=>zoom(Number(slider.value));
  view.addEventListener('wheel',event=>{if(!isOpen()||!image()||!event.ctrlKey)return;event.preventDefault();zoom(scale*100*Math.exp(-event.deltaY*0.002),{x:event.clientX,y:event.clientY});},{passive:false});
  view.addEventListener('pointerdown',event=>{if(!isOpen()||event.button!==0||!event.target.closest('img'))return;event.preventDefault();drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:view.scrollLeft,top:view.scrollTop};view.setPointerCapture(event.pointerId);view.classList.add('panning');});
  view.addEventListener('pointermove',event=>{if(drag?.id!==event.pointerId)return;view.scrollLeft=drag.left-(event.clientX-drag.x);view.scrollTop=drag.top-(event.clientY-drag.y);});
  const release=event=>{if(drag?.id!==event.pointerId)return;if(view.hasPointerCapture(event.pointerId))view.releasePointerCapture(event.pointerId);drag=null;view.classList.remove('panning');};
  view.addEventListener('pointerup',release);view.addEventListener('pointercancel',release);view.addEventListener('lostpointercapture',()=>{drag=null;view.classList.remove('panning');});
  document.addEventListener('keydown',event=>{if(!isOpen()||!image()||event.ctrlKey||event.altKey||event.metaKey||document.querySelector('dialog[open]')||event.target.closest('input,textarea,select,[contenteditable=true]'))return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();(event.key==='ArrowLeft'?previous:next)();}});
  const observer=new ResizeObserver(()=>paint());observer.observe(view);
  return {changed:()=>{const img=image();if(!img)return;img.onload=()=>paint({reset:true});if(img.complete)paint({reset:true});},resize:()=>paint()};
 };
})();
