'use strict';
const labels=new Map([['과목','subject'],['교과','subject'],['주제','topic'],['주제(단원)','topic'],['단원명','topic'],['영역','area'],['단원목표','goal'],['학습목표','goal'],['수업목표','goal'],['핵심아이디어','idea']]);
function pageFields(paragraphs,prompt){
 const fields=[],counts={};let kind;const add=(kind,text)=>{counts[kind]=(counts[kind]||0)+1;fields.push({id:kind+'_'+counts[kind],kind,text});};
 for(const text of paragraphs){const line=text.trim(),label=labels.get(line.replace(/\s/g,''));if(label){kind=label;continue;}if(/^\d+$/.test(line)){kind=null;continue;}if(/학년.*(?:교수[\s·ㆍ]*학습\s*과정안|수업\s*(?:계획안|지도안))/.test(line)){add('title',text);kind=null;continue;}if(kind)add(kind,text);}
 if(!fields.some(field=>field.kind==='topic')||!fields.some(field=>field.kind==='goal'))return [];
 const grade=[...prompt.matchAll(/(\d+)\s*학년/g)].at(-1)?.[1],subject=[...prompt.matchAll(/국어|수학|사회|과학|영어|도덕|음악|미술|체육|실과/g)].at(-1)?.[0],oldSubject=fields.find(field=>field.kind==='subject')?.text.trim();
 for(const field of fields){if(subject&&field.kind==='subject')field.fixed=subject;if(field.kind==='title'){let title=field.text;if(grade)title=title.replace(/\(?\d+\)?\s*학년/,match=>match.replace(/\d+/,grade));if(subject&&oldSubject)title=title.replace(oldSubject,subject);if(title!==field.text)field.fixed=title;}}
 // An unspecified unit has no single correct lesson. Use a concrete, reviewable
 // arithmetic starter instead of letting a small model fill labels as content.
 if(grade==='3'&&subject==='수학'&&!/["“‘']/.test(prompt)&&!/덧셈|뺄셈|곱셈|나눗셈|분수|소수|도형|길이|시간|들이|무게|규칙|각도|수의\s*크기|단원\s*[:：]/.test(prompt)){
  const defaults={topic:'수 모형을 활용하여 세 자리 수의 덧셈과 뺄셈 원리 이해하기',area:'수와 연산',goal:'수 모형과 자릿값 표를 활용하여 세 자리 수의 덧셈과 뺄셈을 계산하고, 계산 과정을 말이나 식으로 설명할 수 있다.'},ideas=['덧셈과 뺄셈은 같은 자리의 수끼리 계산하며, 받아올림과 받아내림은 자릿값에 따라 수를 묶거나 풀어 나타내는 과정이다. 학생은 수 모형을 직접 조작한 뒤 세로셈과 연결하여 계산하고 자신의 방법을 설명한다.','학생별 수준에 따라 수의 범위와 받아올림·받아내림 여부를 조정한다. 계산이 어려운 학생에게는 수 모형, 색으로 구분한 자릿값 표와 단계별 문장 틀을 제공하며, 교사는 독립 수행과 제공한 도움을 구분해 기록한다.'];let idea=0;
  for(const field of fields){if(defaults[field.kind])field.fixed=defaults[field.kind];if(field.kind==='idea')field.fixed=ideas[Math.min(idea++,ideas.length-1)];if(field.kind==='topic')field.assumedTopic='세 자리 수의 덧셈과 뺄셈';}
 }
 return fields;
}
const fieldLabel=kind=>({title:'수업안 제목',subject:'과목',topic:'단원 주제',area:'교육과정 영역',goal:'수업 목표',idea:'핵심 아이디어와 학생 지원'}[kind]||kind);
async function writePageField({request,plan,context,prompt}){
 const field=plan.currentField,directions={topic:'배울 개념이나 활동이 드러나는 10~40자 정도의 구체적인 단원 주제명 하나만 쓰세요. 학년과 과목 이름만 반복하지 마세요.',area:'앞서 정한 단원 주제에 맞는 교과 영역명 하나만 쓰세요. 학년이나 수업안 제목을 쓰지 마세요.',goal:'학생이 배운 뒤 할 수 있는 행동을 25~120자 정도로 구체적인 한 문장으로 쓰세요. 어떤 내용을 어떻게 할 수 있는지 드러내세요.',idea:field.id.endsWith('_1')?'단원 주제의 핵심 개념과 학생이 직접 수행할 구체물 활동을 60~180자 정도의 두 문장으로 설명하세요.':'학생별 수준에 맞춰 활동과 교사의 도움을 어떻게 조정하는지 두 문장으로 설명하세요.'};
 const planned=context.planned||{},title=planned.title_1||prompt,topic=planned.topic_1,goal=planned.goal_1;
 const input=title+(topic?'\n배울 단원: '+topic:'')+(goal&&field.kind==='idea'?'\n학습 목표: '+goal:'')+'\n'+(directions[field.kind]||'요청한 학년과 과목에 맞는 내용을 쓰세요.')+(context.correction?'\n다시 작성할 때 고칠 점: '+context.correction:'');
 const result=await request({instructions:'초등학교 교사의 수업안 원고를 한국어로 작성하세요. 요청한 문구만 바로 쓰고 항목명·번호·지시문·JSON은 출력하지 마세요.',input:[{role:'user',content:input}],tools:[],documentProse:true,documentField:true,evidenceReport:true,max_output_tokens:500,parallel_tool_calls:false,store:false});
 const replacement=require('./provider.cjs').responseText(result).trim().replace(/^```[^\n]*\n|\n```$/g,'').replace(/\s*\n\s*/g,' ').replace(/^["“]([\s\S]+)["”]$/,'$1');return {path:plan.path,liveRevision:plan.liveRevision,page:plan.page,changes:{[field.id]:replacement}};
}
function draftTool({path,liveRevision,page,currentField}){return {type:'function',name:'plan_live_page_edit',description:'요청한 학년·과목에 맞춰 '+fieldLabel(currentField.kind)+' 한 항목의 새 내용을 작성합니다.',parameters:{type:'object',properties:{path:{type:'string',enum:[path]},liveRevision:{type:'string',enum:[liveRevision]},page:{type:'integer',enum:[page]},changes:{type:'object',properties:{[currentField.id]:{type:'string',minLength:1,maxLength:1200}},required:[currentField.id],additionalProperties:false}},required:['path','liveRevision','page','changes'],additionalProperties:false}};}
function compilePageField(args,plan){
 if(!plan?.currentField||args.path!==plan.path||args.liveRevision!==plan.liveRevision||args.page!==plan.page)throw Error('읽은 쪽의 편집 항목과 다릅니다.');
 const field=plan.currentField,replacement=args.changes?.[field.id];if(typeof replacement!=='string'||!replacement.trim()||replacement.length>1200||/[\r\n]/.test(replacement))throw Error(fieldLabel(field.kind)+'을 새 내용의 한 문단으로 작성하세요.');if(replacement.trim()===field.text.trim())throw Error(fieldLabel(field.kind)+'을 원문 그대로 복사하지 말고 요청한 과목 내용으로 새로 작성하세요.');if(/쓰세요|작성하세요|한국어로 쓰|실제 문구만/.test(replacement))throw Error('작성 지시문을 복사하지 말고 수업안에 들어갈 실제 내용을 쓰세요.');const math=plan.fields.some(item=>item.kind==='subject'&&item.fixed==='수학'),concept=/덧셈|뺄셈|곱셈|나눗셈|분수|소수|계산|자릿값|수의|수\s*모형|도형|길이|시간|각도|규칙|측정|그래프|비교|수량|세기/;if(math&&['topic','goal'].includes(field.kind)&&!concept.test(replacement))throw Error('학년이나 과목 이름만 반복하지 말고 실제 수학 개념이나 계산 활동을 구체적으로 쓰세요.');if(math&&field.kind==='area'&&!/수와\s*연산|도형|측정|변화와\s*관계|자료와\s*가능성|규칙성|확률|통계/.test(replacement))throw Error('수학 단원에 맞는 교과 영역명을 짧게 쓰세요.');if(field.kind==='topic'&&(replacement.length<6||replacement.length>80||/^(?:\(?\d+\)?\s*학년\s*)?(?:국어|수학|사회|과학|영어|도덕|음악|미술|체육|실과)$/.test(replacement)))throw Error('단원 주제를 배울 개념이나 활동이 드러나는 구체적인 이름으로 작성하세요.');if(field.kind==='area'&&(replacement.length>40||/학년|과정안|아이디어|학생 지원/.test(replacement)))throw Error('단원 주제에 맞는 교과 영역명만 작성하세요.');if(field.kind==='goal'&&(replacement.length<20||!/다[.!。]?$/.test(replacement)))throw Error('수업 목표를 학생이 할 수 있는 행동이 드러나는 완전한 문장으로 작성하세요.');if(field.kind==='idea'&&replacement.length<35)throw Error('항목명 대신 구체적인 수학 개념·활동·지원 방법을 두 문장으로 작성하세요.');return {field:field.id,replacement};
}
function compilePageEdit(args,plan){
 if(!plan||args.path!==plan.path||args.liveRevision!==plan.liveRevision||args.page!==plan.page)throw Error('편집 계획과 읽은 쪽의 정보가 다릅니다.');
 const changedSubject=plan.fields.some(field=>field.kind==='subject'&&field.fixed!==undefined&&field.fixed!==field.text.trim()),operations=[];for(const field of plan.fields){const replacement=args.changes?.[field.id];if(typeof replacement!=='string'||!replacement.trim()||replacement.length>1200||/[\r\n]/.test(replacement))throw Error('각 수업 항목에 수정한 내용을 한 문단으로 작성하세요.');if(field.fixed!==undefined&&replacement!==field.fixed)throw Error('요청한 학년·과목을 제목과 과목에 반영하세요.');if(changedSubject&&['topic','area','goal','idea'].includes(field.kind)&&replacement.trim()===field.text.trim())throw Error('제목만 바꾸지 말고 주제·영역·목표·핵심 설명도 새 과목 내용으로 수정하세요.');if(replacement!==field.text)operations.push({op:'replace_text',text:field.text,replacement});}
 if(!operations.length)throw Error('원문과 다른 수정 내용을 작성하지 않았습니다.');
 return {path:plan.path,liveRevision:plan.liveRevision,page:plan.page,operations};
}
module.exports={pageFields,draftTool,compilePageField,compilePageEdit,fieldLabel,writePageField};
