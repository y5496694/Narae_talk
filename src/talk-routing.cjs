'use strict';
const flow=require('./portal-workflow.cjs'),school=require('./school-region.cjs'),store=require('./talk-store.cjs');
function portalFriend(prompt,{friendId='narae',profile={},friends=[],history=[]}={}){
 if(friendId!=='narae')return null;
 const text=flow.requestText(flow.resume(prompt,history,true));if(!flow.schoolRequest(text))return null;
 const portals=friends.filter(f=>f.id==='portal'||store.definition(f.id)?.kind==='portal'),regionOf=f=>school.regions.find(r=>[r.region,r.label,r.label.replace(/교육청$/,'')].includes(f.region||store.definition(f.id)?.region||profile?.region));
 const mentioned=school.regions.filter(r=>[r.region,r.label,r.label.replace(/교육청$/,'')].some(name=>text.includes(name)));
 if(mentioned.length>1)throw Error('학교 업무에 사용할 교육청을 한 곳 지정해 주세요.');
 const region=mentioned[0]||school.regions.find(r=>[r.region,r.label,r.label.replace(/교육청$/,'')].includes(profile?.region))||(portals.length===1?regionOf(portals[0]):null);
 if(!region)throw Error('학교 업무를 사용할 지역을 프로필에서 선택하고 해당 지역 나래교무 포탈 친구를 추가해 주세요.');
 const friend=portals.find(f=>regionOf(f)?.id===region.id);if(!friend)throw Error('친구 추가에서 나래교무 포탈('+region.region+')을 추가해 주세요.');
 return {...friend,...store.definition('portal_'+region.id)};
}
module.exports={portalFriend};
