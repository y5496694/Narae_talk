'use strict';
const fs=require('node:fs'),path=require('node:path');
const appId='Inhow.NaraeHangulOffice';
const talkAppId='Inhow.NaraeTalk';
function apply({app,window,shell,root,executable=process.execPath,platform=process.platform,product='office',shortcuts=true}){
 if(platform!=='win32')return {updated:0};
 const talk=product==='talk',id=talk?talkAppId:appId,name=talk?'나래톡':'나래 한글 오피스',icon=path.join(root,talk?'ui/assets/narae-talk.ico':'ui/assets/narae-office.ico'),launchArgs=talk?' --talk':'';
 app.setAppUserModelId(id);if(window){window.setIcon(icon);window.setAppDetails({appId:id,appIconPath:icon,appIconIndex:0,relaunchCommand:'"'+executable+'" "'+root+'"'+launchArgs,relaunchDisplayName:name});}
 if(!shortcuts)return {appId:id,icon,updated:0};
 const ownedArgs=[root,'"'+root+'"'].flatMap(args=>talk?[args,args+' --talk']:[args]);
 const folders=[app.getPath('desktop'),path.join(app.getPath('appData'),'Microsoft/Windows/Start Menu/Programs'),path.join(app.getPath('appData'),'Microsoft/Internet Explorer/Quick Launch/User Pinned/TaskBar')];let updated=0;
 for(const folder of folders){if(!fs.existsSync(folder))continue;for(const fileName of fs.readdirSync(folder).filter(name=>name.toLowerCase().endsWith('.lnk'))){const file=path.join(folder,fileName);try{const link=shell.readShortcutLink(file),args=link.args?.trim();if(path.resolve(link.target).toLowerCase()!==path.resolve(executable).toLowerCase()||!ownedArgs.some(owned=>owned.toLowerCase()===args?.toLowerCase()))continue;if(shell.writeShortcutLink(file,'update',{icon,iconIndex:0,appUserModelId:id,description:talk?name:'나래 한글 오피스 · 나래한글 엔진 기반'}))updated++;}catch{}}}
 return {appId:id,icon,updated};
}
module.exports={apply,appId,talkAppId};
