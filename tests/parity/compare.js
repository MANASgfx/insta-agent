// Usage: node tests/parity/compare.js tests/parity skills   (set IGTOOLS=path/to/igtools.js after porting)
const fs=require('fs'),p=require('path');const T=process.argv[2],R=process.argv[3];
const I=require(process.env.IGTOOLS||require('path').join(__dirname,'../../frontend/src/igtools.js'));const rd=f=>fs.readFileSync(p.join(T,f),'utf8');const pj=f=>JSON.parse(rd(f));
const lex=JSON.parse(fs.readFileSync(p.join(R,'ig-human/slop.json'),'utf8'));const hk=JSON.parse(fs.readFileSync(p.join(R,'ig-reel/hooks.json'),'utf8'));
let bad=0;const eq=(name,a,b,tol=0.15)=>{const ok=typeof a==='number'&&typeof b==='number'?Math.abs(a-b)<=tol:JSON.stringify(a)===JSON.stringify(b);if(!ok){bad++;console.log('DIFF',name,'\n  py:',JSON.stringify(b),'\n  js:',JSON.stringify(a));}};
// hooks
const ph=pj('py_hooks.json');const lines=rd('hooks.txt').split('\n').filter(l=>l.trim());
ph.forEach((h,i)=>{const j=I.scoreHook(lines[i]);eq('hook'+i+' overall',j.overall,h.score);eq('hook'+i+' verdict',j.verdict,h.verdict);eq('hook'+i+' flags',j.flags,h.flags);for(const c in h.checks){eq(`hook${i} ${c}`,j.checks[c].score,h.checks[c].score);eq(`hook${i} ${c} detail`,j.checks[c].detail,h.checks[c].detail);}});
// beats
const pb=pj('py_beats.json'),jb=I.beatSheet(rd('script.txt'),165,30);eq('beats total',jb.total,pb.total_seconds,0.02);eq('beats n',jb.beats.length,pb.beats.length);
pb.beats.forEach((b,i)=>{eq('beat'+i+' label',jb.beats[i].label,b.label);eq('beat'+i+' text',jb.beats[i].text,b.text);eq('beat'+i+' concrete',jb.beats[i].concrete,b.concrete);eq('beat'+i+' flags',jb.beats[i].flags,b.flags);});
eq('beats notes',jb.notes.map(n=>n.text),pb.notes);
// caption
for(const [f,kw] of [['cap1',['client contracts','freelance pricing']],['cap2',[]]]){const pc=pj('py_'+f+'.json'),jc=I.lintCaption(rd(f+'.txt'),kw);eq(f+' verdict',jc.verdict,pc.verdict);eq(f+' visible',jc.visible,pc.visible);eq(f+' checks',jc.checks,pc.checks);}
// humanize
const phu=pj('py_hum.json'),jhu=I.humanize(rd('draft.txt'),lex);eq('hum text',jhu.text,phu.text);for(const k of ['invisible','typographic','lexical','structures'])eq('hum '+k,jhu.report[k],phu.report[k]);
// detect
for(const [f,pf] of [['draft.txt','py_det.json'],['clean.txt','py_det2.json']]){const pd=pj(pf),jd=I.detect(rd(f),lex);eq(f+' overall',jd.overall,pd.human_score);eq(f+' verdict',jd.verdict,pd.verdict);for(const c in pd.checks){eq(`${f} ${c}`,jd.checks[c].score,pd.checks[c].score);eq(`${f} ${c} detail`,jd.checks[c].detail,pd.checks[c].detail);}}
// swipe
const ps=pj('py_swipe.json'),js=I.swipe(I.parseRows(rd('swipe.tsv')),hk);eq('swipe order',js.reels.map(r=>r.account),ps.reels.map(r=>r.account));eq('swipe formula',js.reels.map(r=>r.formula),ps.reels.map(r=>r.formula));eq('swipe outlier',js.reels.map(r=>r.outlier),ps.reels.map(r=>r.outlier));eq('swipe topFormulas',js.topFormulas,ps.top_formulas);eq('swipe unclassified',js.unclassified,ps.unclassified);
js.reels.forEach((r,i)=>eq('swipe hookscore'+i,r.hook_score,ps.reels[i].hook_score));
console.log(bad?`${bad} differences`:'ALL MATCH');
