'use strict';
const fail=message=>Object.assign(Error(message),{code:'DOCUMENT_SUMMARY_INCOMPLETE'});
function checkboxGroups(body){
 const lines=String(body).split(/\r?\n/),groups=[];let items=[],context='';
 const finish=()=>{if(items.length>1&&items.some(item=>item.checked))groups.push({label:/평가\s*방법/.test(context)?'평가방법':'선택 항목',selected:[...new Set(items.filter(item=>item.checked).map(item=>item.label))],unselected:[...new Set(items.filter(item=>!item.checked).map(item=>item.label))]});items=[];};
 for(const [index,line]of lines.entries()){
  const found=[...line.matchAll(/([☑☒□☐])\s*([^☑☒□☐\r\n]+)/g)].map(match=>({checked:/[☑☒]/.test(match[1]),label:match[2].trim()})).filter(item=>item.label&&item.label.length<40);
  if(found.length){if(!items.length)context=lines.slice(Math.max(0,index-2),index).join(' ');items.push(...found);}else finish();
 }
 finish();return groups.filter((group,index)=>groups.findIndex(other=>JSON.stringify(other)===JSON.stringify(group))===index);
}
function summaryPolicy(document){
 const body=String(document.body||''),lead=String(document.title||'')+'\n'+body.slice(0,2200),groups=checkboxGroups(body),lessonPlan=/교수[\s·ㆍ‧・-]*학습\s*과정안|수업\s*(?:지도안|계획안)|단원목표[\s\S]{0,1000}평가계획/.test(lead),planOnly=lessonPlan&&!/실시\s*결과|수업\s*결과\s*(?:보고|분석)|사후\s*검사\s*결과/.test(body);
 const facts=groups.map(group=>({kind:'체크 항목 확인',text:group.label+'에서 실제 선택된 항목: '+group.selected.join(', ')+'.'+(group.unselected.length?' 선택되지 않은 항목: '+group.unselected.join(', ')+'.':'')}));
 const instructions=(lessonPlan?'\n이 문서는 교수·학습 및 평가 계획안입니다. 소프트웨어의 기능이나 연구 성과 형식으로 바꾸지 마세요. 수업 주제와 목표·대상, 실제로 계획한 수업의 순서, 평가방법·기준, 학생별 지원과 유의점을 중심으로 요약하세요. 핵심 기능·실험 결과라는 제목을 강제로 붙이지 마세요. 수업 흐름과 교사의 지원을 점수표보다 우선해 설명하세요.':'\n문서 종류에 맞는 항목 제목을 고르세요. 모든 문서를 목적·대상·기능·결과의 고정 양식으로 바꾸지 마세요.')+(planOnly?' 실제 수업의 실시 결과나 학습 효과가 입증된 문서로 서술하지 마세요. 목표·의도·기대와 이미 관찰한 성과를 구분하세요.':'')+(facts.length?'\n체크된 선택지와 빈 선택지를 구분하세요. □로 시작하는 일반 설명 문장을 선택지로 오해하지 마세요. 아래 항목은 원문 체크 표시에서 직접 확인한 값입니다:\n'+facts.map(fact=>fact.text).join('\n'):'');
 function check(points){
  for(const point of points){
   const text=String(point.text||''),kind=String(point.kind||point.heading||'');
   if(/평가\s*(?:방법|방식)|(?:방법|유형)(?:은|으로)|수행평가|평가는|평가에/.test(text)||/^평가/.test(kind))for(const group of groups.filter(group=>group.label==='평가방법'))for(const label of group.unselected){
    for(const sentence of text.split(/[.!?\n]+/))if(sentence.replace(/\s/g,'').includes(label.replace(/\s/g,''))&&!/미선택|선택(?:되지|하지)\s*않|사용하지\s*않|포함하지\s*않|제외|아닌/.test(sentence))throw fail('원문에서 선택되지 않은 평가방법 "'+label+'"을 적용한 것으로 요약할 수 없습니다. 실제 체크된 '+group.selected.join(', ')+'만 반영하세요.');
   }
   if(planOnly)for(const sentence of text.split(/[.!?\n]+/)){
    const compact=sentence.replace(/\s/g,'');
    if(/(?:향상|증진|개선|증가|감소)(?:되었|됐다|되었다|됨|하였다|했다)|(?:효과|성과)(?:가|를)?(?:확인|입증|검증)(?:되|됐|하)|(?:향상|증진|개선|사고력).{0,25}기여(?:했다|하였다|함)/.test(compact)&&!/목표|계획|기대|의도|예상|가능성|확인되지않|검증되지않/.test(compact))throw fail('수업 계획의 목표와 의도를 이미 확인된 학습 효과나 실행 결과로 바꾸지 마세요. 계획·평가 기준으로 서술하세요.');
   }
  }
  return points;
 }
 function evidence(units){
  if(!lessonPlan)return [];
  const categories=[['수업 흐름',/수업[은는][\s\S]{0,400}(?:순으로|순서|진행)|수업\s*흐름|교수[\s·]*학습\s*(?:절차|활동)/],['학생 지원과 유의점',/학생별[\s\S]{0,150}(?:조정|지원)|보완대체의사소통|개인정보.{0,20}입력|AI.{0,30}교사.{0,30}(?:검토|보조)/],['평가 방법과 기준',/채점\s*기준|채점기준점|배점/]];
  const sentences=text=>(text.match(/[\s\S]+?(?:[.!?。](?=\s|$)|$)/g)||[]).map(sentence=>sentence.trim());
  return categories.flatMap(([kind,pattern])=>{
   const sentencePattern=kind==='수업 흐름'?pattern:kind==='학생 지원과 유의점'?/학생별|언어\s*표현이\s*어려|의사소통|개인정보|교사.{0,25}(?:검토|기록)|AI.{0,30}(?:검토|보조)|비계/:/평가에서는|과정을\s*종합\s*평가|중심으로\s*평가|평가하며|평가한다/;
   let matches=units.map(unit=>({...unit,text:sentences(unit.text).filter(sentence=>sentencePattern.test(sentence)).join(' ')})).filter(unit=>unit.text);
   if(!matches.length&&kind==='평가 방법과 기준')matches=units.filter(unit=>pattern.test(unit.text));
   const selected=kind==='학생 지원과 유의점'?matches.slice(-3):kind==='평가 방법과 기준'?matches.slice(-2):matches.slice(0,2);return selected.map(unit=>({kind,text:unit.text,roots:[unit.id]}));
  });
 }
 return {lessonPlan,planOnly,groups,facts,instructions,check,evidence};
}
module.exports={summaryPolicy,checkboxGroups};
