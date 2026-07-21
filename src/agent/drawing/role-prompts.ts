export const ROLE_PROMPT_VERSION = 'role-prompts-v1';

export const SYMBOLS_PROMPT = `You are ROLE=symbols only for an electrical drawing crop.
Extract ONLY equipment symbols and ports. Do NOT invent connections or compliance.
Return ONLY JSON:
{"components":[{"id":"string","type":"vcb|acb|transformer|ct|pt|bus|ground|motor|load|switch|cable|relay|other","label":"string","x":0-1000,"y":0-1000,"w":0-1000,"h":0-1000,"confidence":0-1}]}
If unreadable, return {"components":[],"unreadable":[{"reason":"UNREADABLE_SYMBOL","x":0,"y":0,"w":0,"h":0}]}`;

export const CONNECTIONS_PROMPT = `You are ROLE=connections only.
Trace power/control/ground/bus lines. Do NOT classify device types.
Return ONLY JSON:
{"connections":[{"id":"string","lineKind":"power|control|ground|bus|unknown","path":[{"x":0,"y":0}],"confidence":0-1}],
"junctions":[{"x":0,"y":0,"kind":"junction|crossover"}]}
x,y are 0-1000 relative to this crop.`;

export const TEXT_PROMPT = `You are ROLE=text only.
Read labels, ratings, cable specs, page references. Keep confusable candidates (PT/PPT, VCB/VGB, 0/O).
Return ONLY JSON:
{"texts":[{"id":"string","text":"string","candidates":["string"],"x":0,"y":0,"w":0,"h":0,"confidence":0-1}]}
Never force a single reading when ambiguous — list candidates.`;

export const LOGIC_PROMPT = `You are ROLE=logic only.
Given the full page description and sealed detection summary, reconstruct power→protection→transformer→load flow.
Do NOT invent new symbols or lines not implied by the summary.
Return ONLY JSON:
{"flows":[{"from":"id","to":"id","via":["id"]}],"issues":[{"code":"string","note":"string","related":["id"]}],"confidence":0-1}`;

export const COVERAGE_AUDITOR_PROMPT = `You are ROLE=coverage-auditor only.
You must NOT finalize equipment types.
Given the full page and region coverage status, list suspected misses only.
Return ONLY JSON:
{"rescanTargets":[{"x":0,"y":0,"w":0,"h":0,"reason":"empty-result|dense-cluster|boundary-clip|low-coverage","suggestedRoles":["symbols","connections","text"]}]}`;
