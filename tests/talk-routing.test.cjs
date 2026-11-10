'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{portalFriend}=require('../src/talk-routing.cjs'),flow=require('../src/portal-workflow.cjs'),store=require('../src/talk-store.cjs'),school=require('../src/school-region.cjs'),{memberFor}=require('../src/talk-personal.cjs');
const all=store.definitions.filter(f=>f.kind==='portal');
test('unified Narae routes every school keyword through the profile region across all 17 education offices',()=>{
 for(const region of school.regions)for(const keyword of ['나이스','NEIS','에듀파인','공문','복무','조퇴','연가','기안','결재','공람','포털','업무포털']){const route=portalFriend(keyword+' 확인해줘',{profile:{region:region.region},friends:all});assert.equal(route.id,'portal_'+region.id);assert.equal(route.region,region.region);assert.equal(memberFor([route.id,'narae'],'gyomu_portal_login',{}),route.id);assert.equal(memberFor([route.id,'narae'],'gyomu_browser',{}),route.id);assert(flow.plan(keyword,null,true));}
});
test('the default portal alias resolves to the profile region while explicit regional friends override it only on request',()=>{
 const friends=[{...store.definition('portal'),region:'경기'},store.definition('portal_cbe')];assert.equal(portalFriend('나이스 사이트 들어가',{profile:{region:'경기'},friends}).id,'portal_goe');assert.equal(portalFriend('충청북도교육청 나이스 들어가',{profile:{region:'경기'},friends}).id,'portal_cbe');assert.equal(portalFriend('공람 확인',{friends:[store.definition('portal_jje')]}).id,'portal_jje');
 assert.throws(()=>portalFriend('나이스 들어가',{profile:{region:'경기'},friends:[store.definition('portal_cbe')]}),/포탈\(경기\)/);assert.throws(()=>portalFriend('나이스 들어가',{friends:all}),/지역을 프로필/);
});
test('unified login follow-ups keep the portal workflow and generic or quoted message content cannot start school work',()=>{
 const options={profile:{region:'경기'},friends:all,history:[{role:'user',content:'나이스 메뉴 알려줘'},{role:'assistant',content:flow.waiting}]};assert.equal(portalFriend('로그인 완료',options).id,'portal_goe');assert.equal(portalFriend('계속',options).id,'portal_goe');
 for(const prompt of ['네이버 뉴스 요약해줘','소통 쪽지 내용 알려줘','이지에듀 일정 확인해봐','김가상에게 쪽지 보내줘. 본문은 "나이스 복무 확인"'])assert.equal(portalFriend(prompt,options),null);
 for(const friendId of ['browser','hangul','portal_cbe'])assert.equal(portalFriend('나이스 들어가',{...options,friendId}),null);
 assert.deepEqual(flow.plan('결재 확인해줘',null,true).systems,['edufine']);assert.deepEqual(flow.plan('나이스 개인결재선 확인해줘',null,true).systems,['neis']);
});
