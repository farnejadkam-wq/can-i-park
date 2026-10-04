// Parking rules: turns a bay's restriction type + hours into a verdict for you.
// Change the wording or rules here; app.js handles the map and screen.
const DAYN=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const DAYS={mon:0,tue:1,tues:1,wed:2,thu:3,thur:3,thurs:3,fri:4,sat:5,sun:6};
const DRE='(mon|tues|tue|wed|thurs|thur|thu|fri|sat|sun)';
const ALL=new Set([0,1,2,3,4,5,6]);
function parseTimes(s){
  const re=new RegExp(DRE+'\\s*-\\s*'+DRE+'|(\\d{1,2}):(\\d{2})\\s*-\\s*(\\d{1,2}):(\\d{2})|at any time|'+DRE,'g');
  s=(s||'').toLowerCase();
  const w=[];let days=null,lastTime=false,m;
  while((m=re.exec(s))){
    if(m[1]){ if(lastTime||!days)days=new Set(); for(let d=DAYS[m[1]];;d=(d+1)%7){days.add(d);if(d===DAYS[m[2]])break;} lastTime=false; }
    else if(m[3]){ w.push({days:days||ALL,st:+m[3]*60+ +m[4],en:+m[5]*60+ +m[6]}); lastTime=true; }
    else if(m[0]==='at any time'){ w.push({days:days||ALL,st:0,en:1440}); lastTime=true; }
    else { if(lastTime||!days)days=new Set(); days.add(DAYS[m[7]]); lastTime=false; }
  }
  return w;
}
function isActive(w,d,m){
  for(const x of w){
    if(x.en>x.st){ if(x.days.has(d)&&m>=x.st&&m<x.en) return true; }
    else { if(x.days.has(d)&&m>=x.st) return true; if(x.en>0&&x.days.has((d+6)%7)&&m<x.en) return true; }
  }
  return false;
}
function nextChange(w,d,m){
  const s0=isActive(w,d,m); let t=d*1440+m;
  for(let i=1;i<=10080;i++){ const u=(t+i)%10080; if(isActive(w,Math.floor(u/1440),u%1440)!==s0) return u; }
  return null;
}
function fmtTime(u,d,m){
  const dd=Math.floor(u/1440),mm=u%1440;
  const hh=String(Math.floor(mm/60)).padStart(2,'0')+':'+String(mm%60).padStart(2,'0');
  const now=d*1440+m; let diff=(u-now+10080)%10080;
  if(dd===d&&diff<1440) return hh;
  if(dd===(d+1)%7&&diff<2880) return hh+' tomorrow';
  return DAYN[dd]+' '+hh;
}
function parsePermits(s){
  return (s||'').toUpperCase().replace(/_/g,'-').split(/[;,\/\s]+/).filter(Boolean).map(t=>/^[A-Z]$/.test(t)?'CA-'+t:t);
}
const PERMIT=new Set(['permit holders only','resident permit holders only','resident permit holders','permit holders','(off-street) permit holders only','(off-street) protected permit holders only']);
const GENERAL=new Set([...PERMIT,'paid-for','loading','trader','free','parking','business permit holders','single yellow line']);
const LABEL={
 'loading':'Loading only','trader':'Trader permits only','car club':'Car club cars only','cycle hire':'Cycle hire docks',
 'dockless bike hire':'Dockless bike bay','taxi rank':'Taxi rank','doctor':'Doctors only','ambulance':'Ambulances only',
 'police':'Police only','diplomatic':'Diplomatic vehicles only','free (bicycles)':'Bicycles only','free (buses)':'Buses only',
 'paid-for (buses)':'Buses and coaches only','disabled (dedicated)':'Reserved for one Blue Badge holder','disabled (green permit)':'Camden Green Badge holders only',
 'disabled (blue badge)':'Blue Badge holders only','electric vehicle recharging':'Electric cars while charging',
 'permit holders ev charging only':'Electric cars with a permit, while charging','paid-for (solo motorcycles only)':'Motorbikes only',
 'solo motorcycles':'Motorbikes only','paid-for':'Pay to park','free':'Free','parking':'Parking',
 'business permit holders':'Business permits only','single yellow line':'No waiting (single yellow line)','double yellow line':'No waiting at any time (double yellow line)',
 'zig zag':'Zig-zag markings, no stopping','red route':'Red route, no stopping','bike hangar':'Bike hangar','parklet':'Parklet'
};
const fmtZone=z=>z.startsWith('IS-')?`Zone ${z.slice(3)}`:z;
const NOONLY=new Set(['single yellow line','double yellow line','zig zag','red route','parklet','bike hangar']);
function comps(t){return t.split('/').map(s=>s.trim().replace(/\s+/g,' ')).filter(Boolean);}
const RANK={no:0,check:1,pay:2,yes:3};
function verdict(b,ctx){
  const {d,m,zone,veh,badge}=ctx; const cs=b.comps;
  if(ctx.match&&b.matchNote) return {s:'no',h:b.matchNote,sub:'Arsenal match day rules apply here.'};
  const W=(ctx.match&&b.mwins)||b.wins; const active=isActive(W,d,m);
  const general=cs.every(c=>GENERAL.has(c));
  const nx=nextChange(W,d,m); const when=nx==null?null:fmtTime(nx,d,m);
  if(!active&&general) return {s:'yes',h:cs.includes('single yellow line')?'Free to park now on the single yellow':'Free to park now',sub:when?`Restrictions start again ${when}. ${cs.includes('paid-for')?'Move or pay':'Move'} by then.`:'No restrictions apply.'};
  const permitOK=zone&&b.permits.includes(zone);
  let best=null;
  const take=r=>{ if(r&&(!best||RANK[r.s]>RANK[best.s])) best=r; };
  for(const c of cs){
    if(PERMIT.has(c)) take(permitOK?{s:'yes',h:`Yes, with your ${fmtZone(zone)} permit`}:null);
    else if(c==='permit holders ev charging only') take(permitOK&&veh==='ev'?{s:'yes',h:'Yes, while charging, with your permit'}:null);
    else if(c==='paid-for') take({s:'pay',h:'Pay to park'});
    else if(c==='paid-for (solo motorcycles only)') take(veh==='moto'?{s:'pay',h:'Pay to park your motorbike'}:null);
    else if(c==='solo motorcycles') take(veh==='moto'?{s:'yes',h:'Yes, motorbike bay'}:null);
    else if(c==='disabled (blue badge)') take(badge?{s:'yes',h:'Yes, with your Blue Badge'}:null);
    else if(c==='electric vehicle recharging') take(veh==='ev'?{s:'yes',h:'Yes, while charging'}:null);
    else if(c==='free') take({s:'yes',h:b.stay?`Free for up to ${b.stay}`:'Free bay'});
    else if(c==='parking') take({s:'check',h:'Parking allowed, check the sign'});
  }
  if(!active){
    if(best&&best.s==='yes') return {...best,sub:'Restrictions are not in force right now.'};
    return {s:'check',h:'Restrictions not in force',sub:`Normally for: ${(LABEL[cs[0]]||cs[0]).toLowerCase()}. Check the sign before parking.`};
  }
  const endTxt=when?(general?`Free for anyone from ${when}.`:`Restriction changes ${when}.`):'Applies at all times.';
  if(best&&best.s==='yes') return {...best,sub:(when?`Restrictions end ${when}, then it's free for anyone.`:'Valid at all times.')+(b.stay&&!best.h.includes(b.stay)?` Maximum stay ${b.stay}.`:'')};
  if(best&&best.s==='pay'){
    const stay=(b.stay?` Maximum stay ${b.stay}.`:'')+(b.noret?` No return within ${b.noret}.`:'');
    return {...best,sub:(when?`Pay until ${when}, then it's free.`:'Pay at all times.')+stay};
  }
  if(best) return {...best,sub:endTxt};
  const parts=[];
  for(const c of cs){
    let l=PERMIT.has(c)?(b.permits.length?`${[...new Set(b.permits)].map(fmtZone).join(', ')} permit holders`:'Permit holders'):(LABEL[c]||c);
    l=l.replace(/ only$/,''); if(!parts.includes(l)) parts.push(l);
  }
  return {s:'no',h:parts.join(' or ')+(cs.every(c=>NOONLY.has(c))?'':' only'),sub:endTxt};
}
if(typeof module!=="undefined") module.exports={parseTimes,isActive,nextChange,fmtTime,parsePermits,verdict,comps};
