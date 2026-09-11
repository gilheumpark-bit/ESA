from pathlib import Path
import json, os, subprocess, time, re

repo='gilheumpark-bit/ESA'
run_id=int(os.environ['SYMBOL_PR_RUN_ID'])
head=os.environ['SYMBOL_PRODUCT_SHA']
assert re.fullmatch(r'[a-f0-9]{40}',head)
def get(path):
    return json.loads(subprocess.check_output(['gh','api',f'repos/{repo}/{path}'],text=True))
for attempt in range(90):
    run=get(f'actions/runs/{run_id}')
    assert run['event']=='pull_request' and run['head_sha']==head
    if run['status']=='completed':break
    time.sleep(10)
assert run['status']=='completed','regular PR CI has not completed'
jobs=get(f'actions/runs/{run_id}/jobs?filter=latest&per_page=100')['jobs']
report={'runId':run_id,'productHead':head,'status':run['status'],'conclusion':run['conclusion'],
    'scope':'Original regular PR CI only; no tests rerun by this collection',
    'jobs':[{k:j.get(k) for k in ['id','name','status','conclusion','started_at','completed_at']} for j in jobs],
    'steps':{j['name']:[{k:s.get(k) for k in ['name','status','conclusion']} for s in j.get('steps',[])] for j in jobs}}
artifacts=get(f'actions/runs/{run_id}/artifacts')['artifacts']
report['artifacts']=[{k:a.get(k) for k in ['id','name','digest','size_in_bytes','expired']} for a in artifacts]
root=Path('/tmp/symbol-pr-evidence')
result=subprocess.run(['gh','run','download',str(run_id),'--repo',repo,'--name','browser-execution-evidence','--dir',str(root)],capture_output=True,text=True)
if result.returncode:
    report['browser']={'available':False,'collectionExit':result.returncode}
else:
    candidates=list(root.rglob('esa-playwright-results.json'))
    if len(candidates)!=1:report['browser']={'available':False,'jsonMatches':len(candidates)}
    else:
        value=json.loads(candidates[0].read_text());executions=[];failures=[]
        def visit(suite):
            for spec in suite.get('specs',[]):
                for test in spec.get('tests',[]):
                    results=test.get('results',[])
                    row={'title':spec['title'],'status':test.get('status'),'attempts':[r.get('status') for r in results]}
                    executions.append(row)
                    if row['status']!='expected':failures.append({**row,'errors':[r.get('errors',[]) for r in results]})
            for child in suite.get('suites',[]):visit(child)
        for suite in value.get('suites',[]):visit(suite)
        report['browser']={'available':True,'stats':value.get('stats'),'executions':len(executions),
            'everyFirstAttemptPassed':bool(executions) and all(e['status']=='expected' and e['attempts']==['passed'] for e in executions),
            'failures':failures,'errors':value.get('errors',[])}
report['logSummaries']={}
for job in jobs:
    result=subprocess.run(['gh','api',f'repos/{repo}/actions/jobs/{job["id"]}/logs'],capture_output=True)
    if result.returncode:
        report['logSummaries'][job['name']]={'available':False,'collectionExit':result.returncode};continue
    log=result.stdout.decode('utf-8',errors='replace')
    relevant=[line for line in log.splitlines() if re.search(r'Tests:|Test Suites:|audit-gate (?:PASS|FAIL|INDETERMINATE)|GATE PASS|[0-9]+ passed|repository-hygiene:|snapshot-freshness',line)]
    report['logSummaries'][job['name']]={'available':True,'summaryLines':relevant[-45:]}
target=Path('.review-patches/symbol-pr-verified.json')
target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(target.read_text())
