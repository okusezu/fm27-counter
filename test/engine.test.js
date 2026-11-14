// node --test test
// Runs the <script id="engine"> block of index.html on its own (same idea as moneyball's load-core).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const src=html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
const {recommend,PLANS,TI,SETS,OOPS,TWEAKS}=vm.runInNewContext(src+'\n;({recommend,PLANS,TI,SETS,OOPS,TWEAKS})');
const base={formation:'4-4-2',mentality:'balanced',style:'unknown',press:'mid',line:'standard',strength:'even',dribblers:false,weakPassers:false,canPress:false};
const r=o=>recommend({...base,...o});
const opts=Object.fromEntries(TI.map(t=>[t.name,t.opts]));
const checkSet=s=>{for(const[k,v]of Object.entries(s)){assert.ok(opts[k],`unknown instruction ${k}`);assert.ok(opts[k].includes(v),`${k}: ${v}`);}};

test('possession side -> plan A without pressing legs, B with, never B vs a stronger side', () => {
  assert.equal(r({style:'possession'}).plan,'possessionA');
  assert.equal(r({style:'possession',canPress:true}).plan,'possessionB');
  assert.equal(r({style:'possession',canPress:true,strength:'stronger'}).plan,'possessionA');
});
test('attacking 4-2-4 -> Attacking plan', () => assert.equal(r({formation:'4-2-4',mentality:'attacking'}).plan,'attacking'));
test('defensive 5-4-1 -> Cautious plan', () => assert.equal(r({formation:'5-4-1',mentality:'defensive'}).plan,'cautious'));
test('plays through press -> through plan', () => assert.equal(r({style:'through'}).plan,'through'));
test('count the middle warns when outnumbered', () => {
  const x=r({formation:'3-4-2-1',style:'counter',mentality:'defensive'}); // cautious plan OOP 4-4-2 (2) vs their 4
  assert.ok(x.warns.some(w=>w.includes('4-4-2')));
  assert.equal(r({formation:'4-4-2',mentality:'attacking'}).warns.length,0);
});
test('opponent tweaks fire from inputs', () => {
  const t=r({press:'high',line:'high',weakPassers:true,dribblers:true}).tweaks.map(x=>x.text).join('|');
  for(const s of ['Bypass press','Pass Reception','Short Goalkeeper Distribution','Tackling'])assert.ok(t.includes(s),s);
});
test('every plan has roles, settings, and the force switch works', () => {
  for(const k of Object.keys(PLANS)){assert.ok(PLANS[k].roles.length>=6);assert.ok(SETS[k],k);assert.equal(recommend(base,k).plan,k);}
});
test('wing play -> Wing Play plan with back-five OOP', () => {
  const x=r({style:'wing',formation:'4-4-2'});
  assert.equal(x.plan,'wing');assert.equal(x.oop,'5-4-1');
});
test('every plan, tweak and shape-counter setting names a real instruction and option', () => {
  for(const s of Object.values(SETS))checkSet(s);
  for(const c of Object.values(OOPS))checkSet(c.set);
  checkSet(r({press:'high',line:'high',weakPassers:true,dribblers:true}).set);
});
test('setup sheet follows the plan and tweaks', () => {
  assert.equal(r({style:'possession',canPress:true}).set['Line of Engagement'],'High Press');
  assert.equal(r({style:'possession'}).set['Line of Engagement'],'Mid Block');
  assert.equal(r({style:'wing',dribblers:true}).set['Tackling'],'Ease Off');
});
test('their OOP shape fills gaps in the setup sheet, plan wins clashes', () => {
  const x=r({style:'through',oopShape:'4-1-4-1'}); // plan sets More Direct; leaves Build-Up Strategy alone
  assert.equal(x.set['Build-Up Strategy'],'Play Through Press');
  assert.equal(x.clashes.map(c=>c.split(':')[0]).join(),'Passing Directness');
  assert.equal(r({style:'through',oopShape:'4-1-4-1',press:'high'}).set['Build-Up Strategy'],'Bypass Press'); // tweak wins
  assert.equal(r({style:'through',oopShape:'5-4-1'}).set['Attacking Width'],'Wider');
  assert.equal(r({}).oopC,null);
});
test('Bypass press only when they press (PDF: "if they press you")', () => {
  for(const style of ['possession','through'])for(const canPress of [false,true]){
    assert.equal(r({style,canPress}).set['Build-Up Strategy'],undefined);
    assert.equal(r({style,canPress,press:'high'}).set['Build-Up Strategy'],'Bypass Press');
  }
});
test('scout report: where they score decides crosses vs stepping up', () => {
  const c=r({goalsFrom:'crosses'}).set,m=r({goalsFrom:'middle'}).set;
  assert.equal(c['Cross Engagement'],'Contest');assert.equal(c['Pressing Trap'],'Trap Inside');
  assert.equal(m['Defensive Line Behaviour'],'Step Up');assert.equal(m['Pressing Trap'],'Trap Outside');
  assert.equal(r({}).set['Defensive Line Behaviour'],undefined);
});
test('scout report: set pieces, and overrides of the plan are reported', () => {
  assert.equal(r({setPieces:true}).set['Play for Set Pieces'],'Play for Set Pieces');
  const x=r({mentality:'defensive',formation:'5-4-1',weakAir:true}); // cautious plan says Low Crosses
  assert.equal(x.plan,'cautious');assert.equal(x.set['Crossing Style'],'High Crosses');
  assert.ok(x.clashes.some(c=>c.startsWith('Crossing Style: High Crosses (Weak in the air) replaces Low Crosses (plan)')));
});
test('every scout answer only sets real instructions', () => {
  checkSet(r({goalsFrom:'crosses',setPieces:true,weakAir:true,slowDef:true,counterVuln:true,longShots:true,fouls:true,lateGoals:true}).set);
  checkSet(r({goalsFrom:'middle',strongAir:true}).set);
});
test('scout report: where they concede decides wide vs central attack', () => {
  assert.equal(r({concedeFrom:'crosses'}).set['Attacking Width'],'Wider');
  assert.equal(r({concedeFrom:'middle'}).set['Attacking Width'],'Narrower');
  checkSet(r({concedeFrom:'crosses'}).set);checkSet(r({concedeFrom:'middle'}).set);
});
