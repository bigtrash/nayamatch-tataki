/* =========================================================
   なやまっち一斉たたき（モニタ＝司会）
   ---------------------------------------------------------
   ・部屋を作り、QR と部屋コードを表示
   ・各ラウンドの合図（出るタイミング・キャラ）を全員へ配信
   ・スマホから届く反応結果を集計してランキング表示
   ・団体戦（綱引き）は連打回数の合計で勝負
========================================================= */
bindMuteButton();
const $ = id => document.getElementById(id);
const PARAMS = new URLSearchParams(location.search);
$('setup-naya').innerHTML = imgTag('naya_full','なやまっち');
$('tug-naya').innerHTML = imgTag('naya_full','なやまっち');

const G = { net:null, code:null, me:null, phase:'setup', round:0, total:10, players:new Map(),
            cur:null, timers:[], syncTimer:null, tug:null };

function view(id){ document.querySelectorAll('.view').forEach(v=>v.classList.remove('active')); $(id).classList.add('active'); }
function send(m){ G.net && G.net.send(m); }
function later(fn, ms){ const t = setTimeout(fn, ms); G.timers.push(t); return t; }
function clearTimers(){ G.timers.forEach(clearTimeout); G.timers = []; }
function teamOf(id){ return parseInt(id.slice(-1), 36) % 2 === 0 ? 'red' : 'blue'; }

/* ---- 部屋 ---- */
function joinUrl(code){
  const base = location.href.replace(/[^/]*$/, '');
  return base + '?room=' + code + (NET_FORCE_LOCAL ? '&local=1' : '');
}
async function openRoom(){
  const code = /^\d{4}$/.test(PARAMS.get('room')||'') ? PARAMS.get('room') : String(Math.floor(1000 + Math.random()*9000));
  G.code = code;
  G.me = { id: netId(), role:'screen', name:'モニタ', joined: Date.now() };
  $('chip-code').textContent = code; $('setup-code').textContent = code;
  const url = joinUrl(code);
  $('join-url').textContent = url;
  try{
    if(window.QRCode){ new QRCode($('qr'), { text:url, width:512, height:512, correctLevel: QRCode.CorrectLevel.M }); }
    else throw new Error('no qr lib');
  }catch(e){ $('qr').innerHTML = '<div class="noqr">QR を表示できません。下の URL か部屋コードで参加してください</div>'; }
  $('setup-note').textContent = (NET_FORCE_LOCAL || !useSupabase()) ? '※ 同一ブラウザ内モード（別タブで参加）' : '';
  G.net = createNet(code);
  await G.net.join(G.me, {
    onMsg: handleMsg,
    onPresence: onPresence,
    onStatus: st => { if(st==='error') $('setup-note').textContent = '接続に失敗しました。通信環境を確認してください。'; }
  });
  G.syncTimer = setInterval(()=> send({ t:'sync', phase:G.phase, round:G.round, total:G.total, count:G.players.size }), 2000);
}

function onPresence(list){
  const seen = new Set();
  list.filter(m=>m.role==='player').forEach(m=>{
    seen.add(m.id);
    if(!G.players.has(m.id)) G.players.set(m.id, { id:m.id, name:m.name, score:0, online:true, rounds:0 });
    G.players.get(m.id).online = true;
    G.players.get(m.id).name = m.name;
  });
  G.players.forEach(p=>{ p.online = seen.has(p.id); });
  const online = Array.from(G.players.values()).filter(p=>p.online);
  $('chip-count').textContent = online.length;
  if(G.phase === 'setup'){
    const box = $('names'); box.innerHTML = '';
    online.slice(-60).forEach(p=>{ const s = document.createElement('span'); s.textContent = p.name; box.appendChild(s); });
    $('btn-start').disabled = online.length === 0;
  }
}

/* ---- メッセージ ---- */
function handleMsg(m){
  if(m.t === 'rt') onResult(m);
  else if(m.t === 'taps') onTaps(m);
}

/* ---- ラウンド進行 ---- */
function pickKind(n){
  if(n === 1) return { kind:'naya' };
  const r = Math.random();
  if(r < 0.62) return { kind:'naya' };
  if(r < 0.88) return { kind:'resident', who: RESIDENTS[Math.floor(Math.random()*RESIDENTS.length)].id };
  return { kind:'hiro' };
}

function startGame(){
  G.total = parseInt($('rounds-sel').value, 10) || 10;
  G.round = 0;
  G.players.forEach(p=>{ p.score = 0; p.rounds = 0; });
  G.phase = 'play';
  view('scr-round');
  renderTotal();
  countdown(()=> nextRound());
}

function countdown(done){
  const cd = $('countdown'); cd.style.display = 'flex';
  let n = 3; cd.textContent = n; sndTick();
  const iv = setInterval(()=>{
    n--;
    if(n > 0){ cd.textContent = n; sndTick(); }
    else { clearInterval(iv); cd.textContent = 'GO!'; beep(1320,.15,'square',.07); setTimeout(()=>{ cd.style.display='none'; done(); }, 500); }
  }, 700);
}

function nextRound(){
  clearTimers();
  G.round++;
  const k = pickKind(G.round);
  const delay = 1500 + Math.round(Math.random()*2500);
  const limit = 1500;
  G.cur = { n:G.round, kind:k.kind, who:k.who||null, delay, limit, results:new Map(), revealed:false };
  send({ t:'round', n:G.round, total:G.total, kind:k.kind, who:k.who||null, delay, limit });
  G.net.flush();
  $('round-no').textContent = 'ラウンド ' + G.round + ' / ' + G.total;
  $('round-kind').textContent = '';
  $('rt-title').textContent = 'この回の最速';
  $('rt-list').innerHTML = ''; $('rt-stat').textContent = '';
  const st = $('stage'); st.className = 'stage wait';
  $('stage-msg').textContent = 'まて…'; $('stage-sub').textContent = '';
  $('stage-img').src = IMG.hole;
  later(()=>{
    st.className = 'stage' + (k.kind==='hiro' ? ' fever' : '');
    $('stage-msg').textContent = k.kind==='naya' ? 'たたけ！' : k.kind==='hiro' ? 'ヒロ！2倍！' : 'たたくな！';
    $('stage-img').src = IMG[(k.kind==='naya' ? 'naya' : k.kind==='hiro' ? 'hiro' : k.who) + '_half'];
    $('round-kind').textContent = k.kind==='naya' ? 'なやまっち' : k.kind==='hiro' ? 'ドクター・ヒロ（2倍）' : RESIDENT_BY_ID[k.who].name + '（たたくな）';
    sndTick();
    later(()=>{ $('stage-img').src = IMG.hole; $('stage-msg').textContent = '…'; }, limit + 300);
    later(reveal, limit + 1400);
  }, delay);
}

function onResult(m){
  const cur = G.cur; if(!cur || m.n !== cur.n) return;
  const p = G.players.get(m.p); if(!p) return;
  if(cur.results.has(m.p)) return;
  // 得点はモニタ側で再計算（スマホの申告値は使わない）
  let pts = 0;
  if(m.r === 'early') pts = -100;
  else if(cur.kind === 'resident') pts = m.r === 'hit' ? -300 : 150;
  else if(m.r === 'hit') pts = Math.max(100, 1000 - Math.max(0, m.ms|0)) * (cur.kind==='hiro' ? 2 : 1);
  cur.results.set(m.p, { p:m.p, name:p.name, r:m.r, ms:m.ms, pts });
  p.score += pts; p.rounds++;
  if(!cur.revealed) renderRound();
  renderTotal();
}

function renderRound(){
  const cur = G.cur;
  const list = Array.from(cur.results.values());
  const ol = $('rt-list'); ol.innerHTML = '';
  if(cur.kind === 'resident'){
    const ok = list.filter(x=>x.r==='miss').length, ng = list.filter(x=>x.r==='hit').length, early = list.filter(x=>x.r==='early').length;
    $('rt-title').textContent = 'がまん大会';
    $('rt-stat').innerHTML = 'がまんできた <b>' + ok + '</b>人　たたいちゃった <b>' + ng + '</b>人' + (early ? '　フライング ' + early + '人' : '');
    list.filter(x=>x.r==='hit').slice(0,8).forEach(x=>{
      const li = document.createElement('li');
      li.innerHTML = '<span class="rk">−300</span><span class="nm"></span><span class="pt">たたいちゃった…</span>';
      li.querySelector('.nm').textContent = x.name; ol.appendChild(li);
    });
    return;
  }
  const hits = list.filter(x=>x.r==='hit').sort((a,b)=>a.ms-b.ms);
  hits.slice(0,8).forEach((x,i)=>{
    const li = document.createElement('li');
    li.innerHTML = '<span class="rk">'+(i+1)+'位</span><span class="nm"></span><span class="ms"></span><span class="pt"></span>';
    li.querySelector('.nm').textContent = x.name; li.querySelector('.ms').textContent = x.ms + 'ms'; li.querySelector('.pt').textContent = '+' + x.pts;
    ol.appendChild(li);
  });
  const miss = list.filter(x=>x.r==='miss').length, early = list.filter(x=>x.r==='early').length;
  const avg = hits.length ? Math.round(hits.reduce((s,x)=>s+x.ms,0)/hits.length) : null;
  $('rt-stat').textContent = (avg!=null ? '平均 ' + avg + 'ms　' : '') + 'にげられた ' + miss + '人' + (early ? '　フライング ' + early + '人' : '');
}

function reveal(){
  const cur = G.cur; cur.revealed = true;
  renderRound(); renderTotal();
  const list = Array.from(cur.results.values());
  let top = [];
  if(cur.kind !== 'resident'){
    top = list.filter(x=>x.r==='hit').sort((a,b)=>a.ms-b.ms).slice(0,10).map((x,i)=>({ p:x.p, rank:i+1, ms:x.ms }));
    if(top.length){ $('stage-msg').textContent = top[0].ms + 'ms！'; $('stage-sub').textContent = '最速 ' + list.find(x=>x.p===top[0].p).name; sndFever(); }
    else { $('stage-msg').textContent = 'だれも…'; }
  } else {
    const ok = list.filter(x=>x.r==='miss').length;
    $('stage-msg').textContent = ok + '人 がまん！'; $('stage-sub').textContent = RESIDENT_BY_ID[cur.who].line; sndHit();
  }
  send({ t:'reveal', n:cur.n, top });
  if(G.round >= G.total) later(finish, 3500);
  else later(nextRound, 3500);
}

function ranking(){
  return Array.from(G.players.values()).filter(p=>p.rounds > 0 || p.online)
    .sort((a,b)=> b.score - a.score || a.name.localeCompare(b.name,'ja'))
    .map((p,i)=>({ p:p.id, name:p.name, s:p.score, rank:i+1 }));
}
function renderTotal(){
  const ol = $('total-list'); ol.innerHTML = '';
  ranking().slice(0,10).forEach(x=>{
    const li = document.createElement('li');
    li.innerHTML = '<span class="rk">'+x.rank+'位</span><span class="nm"></span><span class="sc"></span>';
    li.querySelector('.nm').textContent = x.name; li.querySelector('.sc').textContent = x.s;
    ol.appendChild(li);
  });
}

/* ---- 最終結果 ---- */
let lastRanking = [];
function finish(){
  clearTimers();
  G.phase = 'final';
  lastRanking = ranking();
  send({ t:'final', ranking: lastRanking.slice(0,50).concat(lastRanking.slice(50).map(x=>({p:x.p, rank:x.rank, s:x.s, name:''}))) });
  G.net.flush();
  const pod = [1,2,3];
  pod.forEach(i=>{
    const x = lastRanking[i-1];
    $('pod'+i+'-name').textContent = x ? x.name : '—';
    $('pod'+i+'-score').textContent = x ? x.s + '点' : '';
  });
  const ol = $('final-list'); ol.innerHTML = '';
  lastRanking.slice(3, 13).forEach(x=>{
    const li = document.createElement('li');
    li.innerHTML = '<span class="rk">'+x.rank+'位</span><span class="nm"></span><span class="sc"></span>';
    li.querySelector('.nm').textContent = x.name; li.querySelector('.sc').textContent = x.s;
    ol.appendChild(li);
  });
  $('final-note').textContent = lastRanking.length + '人が参加';
  $('btn-save').disabled = !useSupabase() || !lastRanking.length; $('btn-save').textContent = '結果をランキングに保存';
  confetti();
  view('scr-final');
  beep(523,.12,'square',.07); beep(659,.12,'square',.07,.14); beep(784,.3,'square',.07,.28);
}
function confetti(){
  const box = $('confetti'); box.innerHTML = '';
  const colors = ['#f7dd4a','#e5383f','#3fa0ff','#0f8a4c','#ee7800'];
  for(let i=0;i<100;i++){
    const c = document.createElement('i');
    c.style.left = Math.random()*100 + 'vw'; c.style.background = colors[i % colors.length];
    c.style.animationDuration = (2.2 + Math.random()*2.5) + 's'; c.style.animationDelay = (Math.random()*2) + 's';
    box.appendChild(c);
  }
}
function backToSetup(){
  clearTimers(); G.phase = 'setup'; G.round = 0;
  G.players.forEach(p=>{ p.score = 0; p.rounds = 0; });
  send({ t:'reset' });
  view('scr-setup');
  onPresence(Array.from(G.players.values()).filter(p=>p.online).map(p=>({ id:p.id, name:p.name, role:'player' })));
}

/* ---- 結果保存（任意） ---- */
async function saveResults(){
  const btn = $('btn-save'); btn.disabled = true; btn.textContent = '保存中…';
  const rows = lastRanking.filter(x=>x.s > 0).map(x=>({ game: CONFIG.GAME_ID + '-event', name: x.name.slice(0,10), score: Math.min(100000, x.s) }));
  try{
    const res = await fetch(CONFIG.SUPABASE_URL + '/rest/v1/game_scores', {
      method:'POST',
      headers:{ 'apikey':CONFIG.SUPABASE_ANON_KEY, 'Authorization':'Bearer '+CONFIG.SUPABASE_ANON_KEY, 'Content-Type':'application/json', 'Prefer':'return=minimal' },
      body: JSON.stringify(rows)
    });
    if(!res.ok) throw new Error('supabase ' + res.status);
    btn.textContent = '保存しました（' + rows.length + '件）';
  }catch(e){
    console.error(e); btn.textContent = '保存に失敗（README の insert ポリシーを確認）'; btn.disabled = false;
  }
}

/* ---- 団体戦（綱引き） ---- */
function startTug(){
  clearTimers();
  G.phase = 'tug';
  const online = Array.from(G.players.values()).filter(p=>p.online);
  const red = online.filter(p=>teamOf(p.id)==='red').length, blue = online.length - red;
  G.tug = { red:0, blue:0, redN:red, blueN:blue, dur:10000, running:false };
  $('tug-msg').textContent = 'よーい…'; $('tug-time').textContent = 10;
  updateTug();
  view('scr-tug');
  send({ t:'tug', delay:3000, dur:G.tug.dur }); G.net.flush();
  later(()=>{
    G.tug.running = true; $('tug-msg').textContent = '連打ーーー！'; sndFever();
    const endAt = Date.now() + G.tug.dur;
    const iv = setInterval(()=>{
      $('tug-time').textContent = Math.max(0, Math.ceil((endAt - Date.now())/1000));
      if(Date.now() >= endAt){ clearInterval(iv); G.tug.running = false; $('tug-msg').textContent = '集計中…'; later(endTug, 1500); }
    }, 200);
  }, 3000);
}
function onTaps(m){
  if(!G.tug || G.phase !== 'tug') return;
  const n = Math.max(0, Math.min(40, m.n|0)); // 0.5秒で40回以上は無視
  if(m.team === 'red') G.tug.red += n; else G.tug.blue += n;
  updateTug();
}
function updateTug(){
  const T = G.tug; const tot = T.red + T.blue;
  // 人数差を補正：一人あたりの回数で比較
  const rAvg = T.redN ? T.red / T.redN : 0, bAvg = T.blueN ? T.blue / T.blueN : 0;
  const pct = (rAvg + bAvg) === 0 ? 50 : rAvg / (rAvg + bAvg) * 100;
  $('tug-red').textContent = rAvg.toFixed(0); $('tug-blue').textContent = bAvg.toFixed(0);
  $('tug-red-n').textContent = T.redN + '人・合計 ' + T.red + '回';
  $('tug-blue-n').textContent = T.blueN + '人・合計 ' + T.blue + '回';
  $('tug-fill').style.width = pct + '%';
  $('tug-naya').style.setProperty('--x', 'calc(' + (pct - 50) + ' * 1%)');
  $('tug-naya').style.left = 'calc((' + pct + ' - 50) * 0.56vw)';
}
function endTug(){
  const T = G.tug;
  const rAvg = T.redN ? T.red / T.redN : 0, bAvg = T.blueN ? T.blue / T.blueN : 0;
  const winner = Math.abs(rAvg - bAvg) < 0.5 ? 'draw' : (rAvg > bAvg ? 'red' : 'blue');
  $('tug-msg').textContent = winner === 'draw' ? 'ひきわけ！' : (winner === 'red' ? 'あかチームのかち！' : 'あおチームのかち！');
  send({ t:'tugend', winner }); G.net.flush();
  beep(523,.12,'square',.07); beep(659,.12,'square',.07,.14); beep(784,.3,'square',.07,.28);
}

/* ---- 操作 ---- */
$('btn-start').addEventListener('click', ()=>{ if(G.players.size) startGame(); });
$('btn-again').addEventListener('click', backToSetup);
$('btn-tug').addEventListener('click', startTug);
$('btn-tug2').addEventListener('click', startTug);
$('btn-tug-back').addEventListener('click', backToSetup);
$('btn-save').addEventListener('click', saveResults);
$('fs-btn').addEventListener('click', ()=>{ if(document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); });

openRoom();
