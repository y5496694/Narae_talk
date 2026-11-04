'use strict';
const fs=require('node:fs'),path=require('node:path');
const usage='narae-talk live status | conversation --friend portal [--last 10] | send --friend portal --prompt-file 요청.txt | job ID | stop\nnarae-talk live tools --friend portal | tool --friend portal --name gyomu_browser --args-file 명령.json\nnarae-talk live update-check | update --commit 확인한커밋\n실행 중인 앱의 동일 세션을 사용합니다. --result 새결과.json, --timeout-ms 120000을 사용할 수 있습니다.';
async function main(argv,{home=process.env.NARAE_OFFICE_HOME,store,request=require('./talk-control.cjs').request}={}){
 let outputHandle;
 try{const args=[...argv],command=args.shift();if(!command||['help','--help'].includes(command)){process.stdout.write(usage+'\n');return 0;}const take=name=>{const i=args.indexOf(name);if(i<0)return undefined;if(!args[i+1])throw Error(name+' 값이 필요합니다.');return args.splice(i,2)[1];},result=take('--result'),friend=take('--friend')||'portal',timeout=Number(take('--timeout-ms')||120000);if(!Number.isSafeInteger(timeout)||timeout<100||timeout>300000)throw Error('CLI 제한 시간은 100~300000ms입니다.');let method=command,body={};const json=file=>JSON.parse(fs.readFileSync(file==='-'?0:path.resolve(file),'utf8').replace(/^\uFEFF/,''));
 if(command==='conversation')body={friend,last:Number(take('--last')||10)};
 else if(command==='send'){const file=take('--prompt-file');if(!file)throw Error('--prompt-file 요청.txt를 지정하세요.');body={friend,prompt:fs.readFileSync(file==='-'?0:path.resolve(file),'utf8').replace(/^\uFEFF/,'')};}
 else if(command==='tool'){const name=take('--name'),file=take('--args-file');if(!name||!file)throw Error('--name 도구이름 --args-file 명령.json을 지정하세요.');body={friend,name,args:json(file)};}
 else if(command==='tools')body={friend};
 else if(command==='job')body={id:args.shift()};
 else if(command==='update')body={commit:take('--commit')};
 else if(!['status','stop','quit','update-check'].includes(command))throw Error(usage);
 if(args.length)throw Error('알 수 없는 CLI 인자: '+args.join(' '));if(result){const output=path.resolve(result);fs.mkdirSync(path.dirname(output),{recursive:true});outputHandle=fs.openSync(output,'wx',0o600);}store||=new (require('./key-store.cjs').KeyStore)(home,require('./runtime-python.cjs').resolvePython(path.resolve(__dirname,'..')),'talk-control');const value=await request({home,store,method,args:body,timeout}),response={success:true,result:value};if(outputHandle!==undefined)fs.writeFileSync(outputHandle,JSON.stringify(response,null,2));process.stdout.write(JSON.stringify(response,null,2)+'\n');return 0;
 }catch(error){const response={success:false,code:error.code||'LOCAL_CONTROL_FAILED',error:error.message};if(outputHandle!==undefined)fs.writeFileSync(outputHandle,JSON.stringify(response,null,2));process.stdout.write(JSON.stringify(response,null,2)+'\n');return 1;}finally{if(outputHandle!==undefined)fs.closeSync(outputHandle);}
}
module.exports={main,usage};
