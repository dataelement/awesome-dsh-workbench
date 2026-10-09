import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {publish,buildBrief} from '../scripts/publish-reviewed-workbench.mjs'

const brief={repository:'owner/repo',number:'32',sha:'c'.repeat(40),body:'reviewed',model:'gpt-6-luna',evidenceDigest:'digest',record:{name:'更新追踪',description:{zh:'每日变化日报'},url:'https://github.com/owner/project'}}
async function scenario(t,{failed=false,changed=false,duplicate=false,feishuFailure=false}={}){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'brief-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}))
 const file=path.join(dir,'brief.json');await fs.writeFile(file,JSON.stringify(brief))
 const env={SECURITY_BRIEF_FILE:file,REPOSITORY:brief.repository,PR_NUMBER:'32',CANDIDATE_SHA:brief.sha,GITHUB_TOKEN:'test',FEISHU_WORKBENCH_WEBHOOK:'https://open.feishu.cn/open-apis/bot/v2/hook/00000000-0000-0000-0000-000000000000'}
 let merged=false;const events=[]
 const fetchImpl=async(url,opts)=>{
  if(url.startsWith('https://open.feishu.cn/')) {events.push('notify');return Response.json({code:feishuFailure?19001:0})}
  if(opts.method==='POST'){events.push('receipt');return Response.json({})}
  if(url.includes('/pulls/'))return Response.json({state:'open',head:{sha:brief.sha},body:changed?'changed':brief.body,merged})
  const check_runs=['validate','Trusted catalog probe','Workbench security review'].map(name=>({name,status:'completed',conclusion:failed?'failure':'success'}))
  if(duplicate)check_runs.push({name:'Feishu workbench brief',external_id:`feishu:${brief.sha}:digest`,status:'completed',conclusion:'success'})
  return Response.json({total_count:check_runs.length,check_runs})
 }
 return {env,fetchImpl,events,merge:async(repo,number,sha)=>{assert.equal(sha,brief.sha);events.push('merge');merged=true}}
}
test('brief includes factual description and does not claim full security certification',()=>{assert.match(buildBrief(brief),/每日变化日报/);assert.match(buildBrief(brief),/不替代/)} )
test('merge confirmed before webhook, record success only after delivery',async t=>{const s=await scenario(t);await publish(s);assert.deepEqual(s.events,['merge','notify','receipt'])})
test('failed checks or stale reviewed body prohibit merge and notification',async t=>{for(const options of [{failed:true},{changed:true}]){const s=await scenario(t,options);await assert.rejects(publish(s));assert.deepEqual(s.events,[])}})
test('same snapshot successful receipt skips duplicate sends',async t=>{const s=await scenario(t,{duplicate:true});await publish(s);assert.deepEqual(s.events,[])})
test('Feishu application error fails delivery and does not record success',async t=>{const s=await scenario(t,{feishuFailure:true});await assert.rejects(publish(s),/未确认/);assert.deepEqual(s.events,['merge','notify'])})
