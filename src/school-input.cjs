'use strict';
const pad=n=>String(n).padStart(2,'0');
function schoolInput(text,now=new Date()){
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now),base=new Date(today+'T00:00:00Z');
 const valid=(y,m,d)=>{const value=new Date(Date.UTC(+y,+m-1,+d));return value.getUTCFullYear()===+y&&value.getUTCMonth()===+m-1&&value.getUTCDate()===+d?`${y}-${pad(m)}-${pad(d)}`:null;};
 const explicit=[...text.matchAll(/\b(20\d{2})[-.]\s*(\d{1,2})[-.]\s*(\d{1,2})\b|\b(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/g)].map(m=>valid(...(m[1]?m.slice(1,4):m.slice(4,7))));
 const dateText=text.replace(/"[^"]*"|“[^”]*”/g,''),relative=dateText.match(/오늘|내일|모레/),weekday=dateText.match(/(?:(다다음|다음|이번|지난)\s*주?\s*)?([월화수목금토일])요일/);
 let day=explicit[0];
 if(!explicit.length){let offset;if(relative)offset={오늘:0,내일:1,모레:2}[relative[0]];else if(weekday){const wanted='일월화수목금토'.indexOf(weekday[2]),current=base.getUTCDay();offset=weekday[1]?(({이번:0,다음:1,다다음:2,지난:-1}[weekday[1]])*7-(current+6)%7+(wanted+6)%7):(wanted-current+7)%7;}if(offset!==undefined)day=new Date(base.getTime()+offset*86400000).toISOString().slice(0,10);}
 let period,invalid=false;const times=[...text.matchAll(/(?<!\d)(?:(오전|오후)\s*)?(\d{1,2})\s*(?::\s*(\d{1,2})|시(?:\s*(\d{1,2})\s*분?)?)(?!\d)/g)].map(m=>{let h=+m[2],minute=+(m[3]??m[4]??0);if(m[1])period=m[1];if(h>23||minute>59||m[1]&&(h<1||h>12)){invalid=true;return null;}if(period&&h>=1&&h<=12)h=h%12+(period==='오후'?12:0);return pad(h)+':'+pad(minute);});
 const datesValid=explicit.every(Boolean);return {today,date:datesValid?day||null:null,endDate:datesValid?(explicit.length>1?explicit[1]:day)||null:null,start:!invalid&&times.length===2?times[0]:null,end:!invalid&&times.length===2?times[1]:null};
}
module.exports={schoolInput};
