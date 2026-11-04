'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{schoolInput}=require('../src/school-input.cjs'),{taskFor}=require('../src/agent-task.cjs');
const now=new Date('2026-11-04T03:00:00Z');
test('a natural weekday, Korean time range, requested approver order and reason form one submission request',()=>{
 const task=taskFor('복무 올려 연가 조퇴 금요일 가상검토 가상결재 결재로 해서 14시30분 부터 15시 30분 해가지고. 사유는 개인 사유',[],now);
 assert.equal(task.area,'school-final');assert.equal(task.operation,'submit');assert.deepEqual(task.requestedApprovers,['가상검토','가상결재']);const p=task.preparation.plan;assert.deepEqual(p,{date:'2026-11-06',endDate:'2026-11-06',start:'14:30',end:'15:30',reason:'개인 사유',type:'조퇴'});
});
test('weekday dates use KST and explicit week scopes while ISO and Korean dates retain their range',()=>{
 for(const [text,date]of [['금요일','2026-11-06'],['이번 주 월요일','2026-11-02'],['다음주 금요일','2026-11-13'],['지난주 금요일','2026-10-30'],['다다음 주 금요일','2026-11-20']])assert.equal(schoolInput(text,now).date,date);
 assert.equal(schoolInput('오늘',new Date('2026-11-04T16:00:00Z')).date,'2026-11-05');assert.deepEqual(schoolInput('2026년 11월 6일~2026년 11월 7일 09:00~17:00',now),{today:'2026-11-04',date:'2026-11-06',endDate:'2026-11-07',start:'09:00',end:'17:00'});
});
test('AM and PM and invalid or ambiguous clock values do not silently produce a different request',()=>{
 assert.equal(schoolInput('오후 2시30분~3시30분',now).end,'15:30');assert.equal(schoolInput('오전 11시~오후 1시',now).end,'13:00');assert.equal(schoolInput('25시~15시',now).start,null);assert.equal(schoolInput('14시70분~15시30분',now).start,null);assert.equal(schoolInput('14:00 15:00 16:00',now).start,null);assert.equal(schoolInput('2026-02-30~2026-03-01',now).date,null);
});
test('draft and negative requests stay unsubmitted, and missing reasons are not invented',()=>{
 for(const prompt of ['나이스 연가 신청해 초안만','나이스 조퇴 올리지 마','나이스 복무 상신하지 말고 준비해'])assert.notEqual(taskFor(prompt,[],now)?.area,'school-final');const t=taskFor('복무 올려 연가 조퇴 금요일 14시30분~15시30분',[],now);assert.equal(t.preparation.plan.reason,undefined);
});
