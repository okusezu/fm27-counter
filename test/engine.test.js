// node --test test
// Runs the <script id="engine"> block of index.html on its own (same idea as moneyball's load-core).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const src=html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
const {recommend,PLANS,TI,SETS,OOPS,TWEAKS,TABS}=vm.runInNewContext(src+'\n;({recommend,PLANS,TI,SETS,OOPS,TWEAKS,TABS})');
const base={formation:'4-4-2',mentality:'balanced',style:'unknown',line:'standard',strength:'even',dribblers:false,weakPassers:false,canPress:false};
const r=o=>recommend({...base,...o});
const opts=Object.fromEntries(TI.map(t=>[t.name,t.opts]));
const checkSet=s=>{for(const[k,v]of Object.entries(s)){assert.ok(opts[k],`unknown instruction ${k}`);assert.ok(opts[k].includes(v),`${k}: ${v}`);}};

test('possession side -> plan A without pressing legs, B with, never B vs a stronger side', () => {
  assert.equal(r({style:'possession'}).plan,'possessionA');
  assert.equal(r({style:'possession',canPress:true}).plan,'possessionB');
  assert.equal(r({style:'possession',canPress:true,strength:'stronger'}).plan,'possessionA');
});
test('attacking 4-2-4 -> Route One plan', () => assert.equal(r({formation:'4-2-4',mentality:'attacking'}).plan,'route'));
test('defensive 5-4-1 -> Park the Bus plan', () => assert.equal(r({formation:'5-4-1',mentality:'defensive'}).plan,'busA'));
test('every playstyle picks its own tab', () => {
  for(const k of TABS)assert.ok(recommend({...base,style:k}).plan.startsWith(k),k);
  assert.equal(recommend(base,'possession').plan,'possessionA');assert.equal(recommend({...base,canPress:true},'possession').plan,'possessionB');
});
test('count the middle warns when outnumbered', () => {
  const x=r({formation:'3-4-2-1',style:'bus',mentality:'defensive',canPress:true}); // bus plan B OOP 4-4-2 (2) vs their 4
  assert.ok(x.warns.some(w=>w.includes('4-4-2')));
  assert.equal(r({formation:'4-4-2',mentality:'attacking'}).warns.length,0);
});
test('opponent tweaks fire from inputs', () => {
  const t=r({trigger:'more',line:'higher',weakPassers:true,dribblers:true}).tweaks.map(x=>x.text).join('|');
  for(const s of ['Bypass Press','Pass Reception','Short Goalkeeper Distribution','Tackling'])assert.ok(t.includes(s),s);
});
test('every plan has a shape, settings, and the force switch works', () => {
  for(const k of Object.keys(PLANS)){assert.ok(PLANS[k].ipShape&&PLANS[k].oop&&PLANS[k].tab,k);assert.ok(SETS[k],k);assert.equal(recommend(base,k).plan,k);}
});
test('wing play -> Wing Play plan with back-five OOP', () => {
  const x=r({style:'wing',formation:'4-4-2'});
  assert.equal(x.plan,'wing');assert.equal(x.oop,'5-4-1');
  assert.equal(x.set['Progress Through'],'Middle'); // they Trap Outside
});
test('every plan, tweak and shape-counter setting names a real instruction and option', () => {
  for(const s of Object.values(SETS))checkSet(s);
  for(const c of Object.values(OOPS))checkSet(c.set);
  checkSet(r({trigger:'more',line:'higher',weakPassers:true,dribblers:true}).set);
});
test('setup sheet follows the plan and tweaks', () => {
  assert.equal(r({style:'possession',canPress:true}).set['Line of Engagement'],'High Press');
  assert.equal(r({style:'possession'}).set['Line of Engagement'],'Mid Block');
  assert.equal(r({style:'wing',dribblers:true}).set['Tackling'],'Stay On Feet');
});
test('their OOP shape fills gaps in the setup sheet, plan wins clashes', () => {
  const x=r({style:'vtiki',oopShape:'4-1-4-1'}); // plan sets More Direct; leaves Build-Up Strategy alone
  assert.equal(x.set['Build-Up Strategy'],'Play Through Press');
  assert.equal(x.clashes.map(c=>c.split(':')[0]).join(),'Passing Directness');
  assert.equal(r({style:'vtiki',oopShape:'4-1-4-1',trigger:'more'}).set['Build-Up Strategy'],'Bypass Press'); // tweak wins
  assert.equal(r({style:'vtiki',oopShape:'5-4-1'}).set['Attacking Width'],'Wider');
  assert.equal(r({}).oopC,null);
});
test('Bypass press only when they press (PDF: "if they press you")', () => {
  for(const style of ['possession','vtiki'])for(const canPress of [false,true]){
    assert.equal(r({style,canPress}).set['Build-Up Strategy'],undefined);
    assert.equal(r({style,canPress,trigger:'more'}).set['Build-Up Strategy'],'Bypass Press');
  }
});
test('scout report: where they score decides crosses vs stepping up', () => {
  const c=r({goalsFrom:'crosses'}).set,m=r({goalsFrom:'middle'}).set;
  assert.equal(c['Cross Engagement'],'Stop Crosses');assert.equal(c['Pressing Trap'],'Trap Inside');
  assert.equal(m['Defensive Line Behaviour'],'Step Up More');assert.equal(m['Pressing Trap'],'Trap Outside');
  assert.equal(r({}).set['Defensive Line Behaviour'],undefined);
});
test('scout report: set pieces, and overrides of the plan are reported', () => {
  assert.equal(r({setPieces:true}).set['Play for Set Pieces'],'Play for Set Pieces');
  const x=r({mentality:'defensive',formation:'5-4-1',weakAir:true}); // bus plan says Low Crosses
  assert.equal(x.plan,'busA');assert.equal(x.set['Crossing Style'],'Floated Crosses');
  assert.ok(x.clashes.some(c=>c.startsWith('Crossing Style: Floated Crosses (Weak in the air) replaces Low Crosses (plan)')));
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
test('5-2-3 Wide (2 DM, wing-backs + wingers): two strikers vs the back three, wing-play pointer', () => {
  const x=r({formation:'5-2-3 Wide'});
  assert.equal(x.shape.ip,'4-4-2');assert.ok(x.shape.why.includes('Wing play'));
  assert.equal(x.warns.length,0); // 4-1-4-1 / 4-4-2 OOP have >= their 2 central players
});
test('your shapes: OOP beats their IP shape, IP beats their OOP shape (falls back to their IP shape)', () => {
  const a=r({formation:'4-4-2'});
  assert.equal(a.mine.oop,'4-1-4-1');assert.equal(a.mine.ip,'4-3-3');
  const b=r({formation:'4-4-2',oopShape:'5-4-1'});
  assert.equal(b.mine.oop,'4-1-4-1');assert.equal(b.mine.ip,'2-3-5 / 3-2-5');
  assert.equal(b.mine.ipWhy[0],'vs their 5-4-1 out of possession');
});
test('Tiki-Taka -> its own counter: go long over the press, compact mid block', () => {
  const x=r({style:'tiki'});
  assert.equal(x.plan,'tiki');
  assert.equal(x.set['Goal Kicks'],'Long');assert.equal(x.set['Build-Up Strategy'],'Bypass Press');
  assert.equal(x.set['Line of Engagement'],'Mid Block');assert.equal(x.set['Trigger Press'],'Less Often');
});
test('home/away: drop a notch away unless they are weaker', () => {
  const away=r({venue:'away'}),awayWeak=r({venue:'away',strength:'weaker'}),home=r({venue:'home'});
  assert.ok(away.tweaks.some(t=>t.text.startsWith('Mentality one notch lower')));assert.equal(away.set['Tackling'],'Stay On Feet');
  assert.ok(awayWeak.tweaks.some(t=>t.text.startsWith('Away to a weaker side')));assert.ok(!awayWeak.tweaks.some(t=>t.text.startsWith('Mentality one notch lower than at home')));
  assert.ok(home.tweaks.some(t=>t.why==='Home'));
});
test('5-2-1-2 DM AM: attack the lone wing-backs, 4-1-4-1 matches their three central players', () => {
  const x=r({formation:'5-2-1-2 DM AM'});
  assert.equal(x.mine.ip,'4-3-3');assert.equal(x.mine.oop,'4-1-4-1');assert.equal(x.warns.length,0);
  assert.equal(x.shape.weak,'Wing-backs carry the whole flank alone');
});
test('team mentality: plan start point, one notch per strength/away tweak, clamped to the scale', () => {
  assert.equal(r({style:'vtiki'}).mine.mood,'Balanced');
  assert.equal(r({formation:'5-4-1',mentality:'defensive'}).mine.mood,'Positive');
  assert.equal(r({style:'vtiki',strength:'stronger',venue:'away'}).mine.mood,'Defensive');
  assert.equal(r({style:'vtiki',strength:'weaker',venue:'away'}).mine.mood,'Positive');
  for(const k of Object.keys(PLANS))assert.notEqual(r({style:k.replace(/[AB]$/,''),strength:'stronger',venue:'away'}).mine.mood,'Very Defensive',k); // never pre-match
  for(const m of ['veryDefensive','cautious'])assert.equal(r({formation:'5-4-1',mentality:m}).plan,'busA');
  assert.equal(r({formation:'4-2-4',mentality:'veryAttacking'}).plan,'route');
  for(const k of Object.keys(PLANS))assert.ok(recommend(base,k).mine.mood,k);
});

test('their 4-2-4 out of possession -> three central players and counter settings', () => {
  const x=recommend({...base,oopShape:'4-2-4'});
  assert.equal(x.mine.ip,'4-3-3 or 4-2-3-1');assert.equal(x.set['Attacking Transition'],'Counter-Attack');
});

test('a chosen playstyle wins even when everything else points elsewhere', () => {
  const deep={formation:'5-4-1',mentality:'defensive',line:'lower',trigger:'more'};
  for(const k of TABS)assert.ok(r({...deep,style:k}).plan.startsWith(k),k);
  for(const k of TABS)assert.ok(r({formation:'4-2-4',mentality:'attacking',line:'higher',style:k}).plan.startsWith(k),k);
});

test('how often they trigger the press', () => {
  const m=r({trigger:'more'});assert.equal(m.set['Build-Up Strategy'],'Bypass Press');assert.equal(m.set['GK Distribution (Speed)'],'Distribute Quickly');
  assert.ok(r({trigger:'muchMore'}).tweaks.some(t=>t.text.startsWith('Pressing that hard')));
  assert.equal(r({trigger:'less'}).set['Build-Up Strategy'],'Play Through Press');
  assert.equal(r({trigger:'balanced'}).set['Build-Up Strategy'],undefined);
  checkSet(m.set);checkSet(r({trigger:'less'}).set);
});

test('their defensive line: through balls vs a high line, to feet vs a deep one', () => {
  for(const line of ['higher','muchHigher']){const x=r({line}).set;assert.equal(x['Pass Reception'],'Pass Into Space');assert.equal(x['Passing Directness'],'More Direct');}
  for(const line of ['lower','muchLower'])assert.equal(r({line}).set['Pass Reception'],'Pass To Feet');
  assert.ok(!r({line:'standard'}).tweaks.some(t=>/line$/.test(t.why)));
});

test('their defensive line behaviour', () => {
  assert.equal(r({lineBehaviour:'dropOff'}).set['Pass Reception'],'Pass To Feet');
  assert.ok(r({lineBehaviour:'stepUp'}).tweaks.some(t=>t.why==='Their line steps up'));
  assert.ok(!r({lineBehaviour:'balanced'}).tweaks.some(t=>t.why.startsWith('Their line')));
  assert.equal(r({style:'direct'}).set['Defensive Line Behaviour'],'Drop Off More');
});

test('their line of engagement', () => {
  assert.equal(r({engage:'high'}).set['Build-Up Strategy'],'Bypass Press');
  assert.equal(r({engage:'mid',style:'tiki'}).set['Build-Up Strategy'],'Bypass Press'); // default Mid Block leaves the plan alone
  const l=r({engage:'low'}).set;assert.equal(l['Attacking Width'],'Wider');assert.equal(l['Patience'],'Work Ball Into Box');
  assert.ok(!r({engage:'mid'}).tweaks.some(t=>/Block|High Press/.test(t.why)));
  for(const engage of ['low','mid','high'])checkSet(r({engage}).set);
});

test('their tempo', () => {
  for(const tempo of ['lower','muchLower'])assert.equal(r({tempo}).set['Trigger Press'],'More Often');
  for(const tempo of ['higher','muchHigher'])assert.equal(r({tempo}).set['Defensive Transition'],'Regroup');
  assert.ok(!r({tempo:'standard'}).tweaks.some(t=>/tempo/.test(t.why)));
  checkSet(r({tempo:'lower'}).set);checkSet(r({tempo:'higher'}).set);
});

test('their passing directness', () => {
  for(const directness of ['shorter','muchShorter'])assert.equal(r({directness}).set['Trigger Press'],'More Often');
  for(const directness of ['moreDirect','muchMoreDirect'])assert.equal(r({directness}).set['Defensive Line Behaviour'],'Drop Off More');
  assert.ok(!r({directness:'standard'}).tweaks.some(t=>/pass short|play direct/.test(t.why)));
  checkSet(r({directness:'shorter'}).set);checkSet(r({directness:'moreDirect'}).set);
});

test('4-4-1-1 OOP warns about Work Rate unless the squad has pressing legs', () => {
  const w=x=>x.warns.some(t=>t.includes('4-4-1-1'));
  assert.equal(r({formation:'4-3-3'}).mine.oop,'4-4-1-1');
  assert.ok(w(r({formation:'4-3-3'})));assert.ok(!w(r({formation:'4-3-3',canPress:true})));
  assert.ok(!w(r({formation:'4-4-2'})));
});

test('Park the Bus and Catenaccio: Plan B (press) only with pressing legs, never vs a stronger side', () => {
  for(const k of ['bus','catenaccio']){
    const a=r({style:k}),b=r({style:k,canPress:true});
    assert.equal(a.plan,k+'A');assert.equal(b.plan,k+'B');assert.equal(r({style:k,canPress:true,strength:'stronger'}).plan,k+'A');
    assert.equal(a.set['Line of Engagement'],'Mid Block');assert.equal(a.set['Defensive Transition'],'Regroup');assert.equal(a.set['Trigger Press'],undefined);
    assert.equal(b.set['Line of Engagement'],'High Press');assert.equal(b.set['Defensive Transition'],'Counter-Press');
    assert.equal(a.set['Attacking Width'],b.set['Attacking Width']); // same attack
    assert.equal(recommend({...base,style:k},k+'B').plan,k+'B'); // tab click
  }
});
test('5-3-2 DM WB in possession + 5-2-1-2 DM AM out of possession', () => {
  const x=r({formation:'5-3-2 DM WB',oopShape:'5-2-1-2 DM AM'});
  assert.equal(x.mine.ip,'4-3-3');assert.equal(x.mine.oop,'4-1-4-1');assert.equal(x.warns.length,0);
  assert.equal(x.shape.weak,'Wing-backs carry the whole flank alone');
  assert.equal(r({formation:'5-3-2 DM WB',mentality:'defensive'}).ranked.find(p=>p.key.startsWith('catenaccio')).reasons.some(w=>w.includes('5-3-2 DM WB')),true);
});
test('4-1-2-1-2 DM WB in possession: no count-the-middle warning from its own counter', () => {
  const x=r({formation:'4-1-2-1-2 DM WB'});
  assert.equal(x.shape.oop,'3-4-2-1');assert.equal(x.warns.some(w=>w.includes('shape counter')),false);
});
