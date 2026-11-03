'use strict';
function setHangulPane(win,expanded,screen){
 if(typeof expanded!=='boolean')throw Error('한글 화면 표시 상태를 확인하세요.');
 if(Boolean(win.hangulPaneExpanded)===expanded)return {expanded};
 const bounds=win.getBounds(),area=screen.getDisplayMatching(bounds).workArea;
 if(expanded)win.hangulCollapsedBounds={width:bounds.width,height:bounds.height};
 else win.hangulExpandedBounds={width:bounds.width,height:bounds.height};
 win.hangulPaneExpanded=expanded;
 win.setMinimumSize(Math.min(expanded?720:320,area.width),Math.min(expanded?540:480,area.height));
 if(!win.isMaximized()){
  const size=expanded?(win.hangulExpandedBounds||{width:1040,height:Math.max(bounds.height,780)}):(win.hangulCollapsedBounds||{width:394,height:715});
  const width=Math.min(size.width,area.width),height=Math.min(size.height,area.height);
  win.setBounds({x:Math.max(area.x,Math.min(bounds.x,area.x+area.width-width)),y:Math.max(area.y,Math.min(bounds.y,area.y+area.height-height)),width,height},false);
 }
 return {expanded};
}
module.exports={setHangulPane};
