/* =========================================================
   なやまっち一斉たたき（スマホ側）
   ---------------------------------------------------------
   モニタ（screen.html）が司会。各ラウンドの合図を受けて
   「出てから叩くまで」を手元で計測し、その結果だけを送る。
========================================================= */
bindMuteButton();
const $ = id => document.getElementById(id);
const PARAMS = new URLSearchParams(location.search);
$('title-naya').innerHTML = imgTag('naya_full','なやまっち');

const P = { net:null, code:null, me:null, score:0, round:null, phase:'entry', count:1,
            tug:{ team:null, n:0, pending:0, timer:null, running:false } };

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  $(id).classList.add('active');
  P.phase = id;
}
function flash(){ const f=$('flash'); f.classList.add('on'); setTimeout(()=>f.classList.remove('on'), 90); }
function teamOf(id){ return parseInt(id.slice(-1), 36) % 2 === 0 ? 'red' : 'blue'; }
function send(m){ P.net && P.net.send(m); }

/* ---- 参加 ---- */
function loadName(){ try{ return localStorage.getItem('nayamole-playername') || ''; }catch(e){ return ''; } }
$('name-input').value = loadName();
if(/^\d{4}$/.test(PARAMS.get('room')||'')) $('code-input').value = PARAMS.get('room');
$('entry-note').textContent = (NET_FORCE_LOCAL || !useSupabase()) ? '※ 同一ブラウザ内モード' : '';

$('btn-join').addEventListener('click', async ()=>{
  const name = $('name-input').value.trim().slice(0,10) || 'ななし';
  const code = $('code-input').value.trim();
  if(!/^\d{4}$/.test(code)){ $('entry-note').textContent = '部屋コードは4けたの数字です'; return; }
  try{ localStorage.setItem('nayamole-playername', name); }catch(e){}
  P.code = code;
  P.me = { id: netId(), role:'player', name, joined: Date.now() };
  P.tug.team = teamOf(P.me.id);
  P.net = createNet(code);
  $('lobby-name').textContent = name;
  $('team-chip').className = 'team-chip ' + P.tug.team;
  $('team-chip').textContent = P.tug.team==='red' ? 'あかチーム' : 'あおチーム';
  showScreen('scr-lobby');
  await P.net.join(P.me, {
    onMsg: handleMsg,
    onPresence: list => { P.count = list.filter(m=>m.role==='player').length; $('lobby-count').textContent = P.count; },
    onStatus: st => { if(st==='error'){ $('entry-note').textContent = '接続に失敗しました'; showScreen('scr-entry'); } }
  });
});
function leave(){ if(P.net) P.net.leave(); P.net = null; P.score = 0; showScreen('scr-entry'); }
$('btn-leave').addEventListener('click', leave);
$('btn-leave2').addEventListener('click', leave);

/* ---- メッセージ ---- */
function handleMsg(m){
  switch(m.t){
    case 'sync':  onSync(m); break;
    case 'round': onRound(m); break;
    case 'reveal': onReveal(m); break;
    case 'final': onFinal(m); break;
    case 'tug':   onTug(m); break;
    case 'tugend': onTugEnd(m); break;
    case 'reset': P.score = 0; $('total-score').textContent = '0 点'; showScreen('scr-lobby'); break;
  }
}
function onSync(m){
  if(m.count) { P.count = m.count; $('lobby-count').textContent = m.count; }
  if(m.phase === 'setup' && P.phase !== 'scr-lobby' && P.phase !== 'scr-entry') showScreen('scr-lobby');
}

/* ---- ラウンド ---- */
let roundTimers = [];
function clearRoundTimers(){ roundTimers.forEach(clearTimeout); roundTimers = []; }

function onRound(m){
  clearRoundTimers();
  P.round = { n:m.n, kind:m.kind, who:m.who, limit:m.limit||1500, state:'wait', popAt:0, done:false };
  $('round-label').textContent = 'ラウンド ' + m.n + ' / ' + m.total;
  $('total-score').textContent = P.score + ' 点';
  const arena = $('arena');
  arena.className = 'arena wait';
  $('arena-msg').textContent = 'まて…';
  $('arena-result').textContent = ''; $('arena-result').className = 'arena-result';
  $('arena-img').src = IMG.hole;
  showScreen('scr-round');
  roundTimers.push(setTimeout(()=>{
    if(P.round.done) return;
    P.round.state = 'pop'; P.round.popAt = performance.now();
    arena.className = 'arena' + (m.kind==='hiro' ? ' fever' : '');
    $('arena-msg').textContent = m.kind==='naya' ? 'たたけ！' : m.kind==='hiro' ? 'ヒロ！2倍！' : 'たたくな！';
    $('arena-img').src = IMG[(m.kind==='naya' ? 'naya' : m.kind==='hiro' ? 'hiro' : m.who) + '_half'];
    sndTick();
    roundTimers.push(setTimeout(()=>{ if(!P.round.done) finishRound('miss', null); }, P.round.limit));
  }, m.delay));
}

function onTap(){
  const r = P.round;
  if(!r || r.done) return;
  if(r.state === 'wait'){ finishRound('early', null); return; }
  finishRound('hit', Math.round(performance.now() - r.popAt));
}

function finishRound(result, ms){
  const r = P.round; if(!r || r.done) return;
  r.done = true; clearRoundTimers();
  const arena = $('arena'); const res = $('arena-result');
  let pts = 0, text = '';
  if(result === 'early'){
    pts = -100; text = 'フライング！'; res.className = 'arena-result bad'; sndBad(); flash();
    arena.className = 'arena';
    $('arena-msg').textContent = 'はやすぎ…';
  } else if(r.kind === 'naya' || r.kind === 'hiro'){
    if(result === 'hit'){
      pts = Math.max(100, 1000 - ms) * (r.kind==='hiro' ? 2 : 1);
      text = ms + ' ms'; sndHit(); flash();
      $('arena-img').src = IMG[(r.kind==='naya'?'naya':'hiro') + '_hit'];
    } else { pts = 0; text = 'にげられた…'; res.className = 'arena-result bad'; }
  } else { // 住人
    if(result === 'hit'){
      pts = -300; text = 'たたいちゃった！'; res.className = 'arena-result bad'; sndBad(); flash();
      $('arena-img').src = IMG[r.who + '_hit'];
      if(navigator.vibrate) navigator.vibrate(80);
    } else { pts = 150; text = 'がまんできた！'; sndFever(); }
  }
  P.score += pts;
  res.innerHTML = '<b>' + (pts>=0?'+':'') + pts + '</b><br>' + text;
  $('total-score').textContent = P.score + ' 点';
  const payload = { t:'rt', n:r.n, p:P.me.id, r:result, ms, pts };
  setTimeout(()=> send(payload), Math.random()*600);
}
$('arena').addEventListener('pointerdown', e=>{ e.preventDefault(); onTap(); });

function onReveal(m){
  if(P.round && P.round.n === m.n && !P.round.done) finishRound('miss', null);
  const mine = m.top && m.top.find(x=>x.p===P.me.id);
  if(mine) $('arena-msg').textContent = 'この回 ' + mine.rank + '位！';
}

/* ---- 最終結果 ---- */
function onFinal(m){
  clearRoundTimers();
  const me = (m.ranking||[]).find(x=>x.p===P.me.id);
  $('final-rank').textContent = me ? me.rank + '位' : '—';
  $('final-meta').textContent = me ? (m.ranking.length + '人中') : '';
  $('final-score').textContent = me ? me.s : P.score;
  const ol = $('final-list'); ol.innerHTML = '';
  (m.ranking||[]).slice(0,5).forEach(x=>{
    const li = document.createElement('li'); if(x.rank===1) li.className='top1';
    li.innerHTML = '<span class="rank">'+x.rank+'位</span><span class="nm"></span><span class="sc"></span>';
    li.querySelector('.nm').textContent = x.name; li.querySelector('.sc').textContent = x.s;
    ol.appendChild(li);
  });
  showScreen('scr-final');
  if(me && me.rank <= 3) sndFever();
}

/* ---- 団体戦 ---- */
function onTug(m){
  const T = P.tug;
  T.n = 0; T.pending = 0; T.running = false;
  $('tug-team').textContent = T.team==='red' ? 'あかチーム' : 'あおチーム';
  $('tug-btn').className = 'tug-btn ' + T.team;
  $('tug-msg').textContent = 'よーい…'; $('tug-count').textContent = 0; $('tug-time').textContent = Math.round(m.dur/1000);
  showScreen('scr-tug');
  clearInterval(T.timer);
  setTimeout(()=>{
    T.running = true; $('tug-btn').classList.add('go'); $('tug-msg').textContent = '連打！'; sndFever();
    const endAt = Date.now() + m.dur;
    T.timer = setInterval(()=>{
      $('tug-time').textContent = Math.max(0, Math.ceil((endAt - Date.now())/1000));
      if(T.pending){ send({ t:'taps', p:P.me.id, team:T.team, n:T.pending }); T.pending = 0; }
      if(Date.now() >= endAt){ T.running = false; clearInterval(T.timer); $('tug-msg').textContent = 'おしまい！'; $('tug-btn').classList.remove('go'); P.net.flush(); }
    }, 500);
  }, m.delay);
}
$('tug-btn').addEventListener('pointerdown', e=>{
  e.preventDefault();
  const T = P.tug; if(!T.running) return;
  T.n++; T.pending++; $('tug-count').textContent = T.n;
  if(T.n % 10 === 0) beep(880,.04,'square',.04);
});
function onTugEnd(m){
  const T = P.tug;
  $('tug-msg').textContent = m.winner === 'draw' ? 'ひきわけ！' : (m.winner === T.team ? 'かち！' : 'まけ…');
  if(m.winner === T.team) sndFever();
}
