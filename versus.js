/* =========================================================
   なやまっちたたき 2人対戦（プレイヤー側）
   ---------------------------------------------------------
   ・ホストが決めたシードから両者同じ出現スケジュールを生成
   ・たたいた／出てきた等のイベントを部屋に配信（観戦画面が再現）
   ・コンボ5ごとに相手の盤面へ商店街の人を送り込む（おじゃま）
========================================================= */
bindMuteButton();
const $ = id => document.getElementById(id);
const PARAMS = new URLSearchParams(location.search);
const HOLES = 9;
let GAME_TIME = 60;

document.getElementById('title-naya').innerHTML = imgTag('naya_full','なやまっち');

/* ---- シード乱数 ---- */
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ---- 出現スケジュール（両者共通） ----
   {t:開始ms, h:穴, k:画像キー('naya'|'hiro'|住人id), d:出ている長さms} */
function buildSchedule(seed, gameTime){
  const rnd = mulberry32(seed);
  const ev = [];
  const freeAt = new Array(HOLES).fill(0);
  const resUntil = [];
  let hiroUntil = 0;
  let t = 700;
  const total = gameTime * 1000;
  while(t < total - 450){
    const el = t / 1000, last = (gameTime - el) <= 10;
    let iv = 880 - (el/gameTime) * 380; if(last) iv *= 0.72; iv = Math.max(240, iv);
    let d  = 1120 - (el/gameTime) * 400; if(last) d *= 0.85;  d = Math.max(520, d);
    const n = (last && rnd() < 0.5) ? 2 : 1;
    for(let i=0;i<n;i++){
      const free = [];
      for(let h=0;h<HOLES;h++) if(freeAt[h] <= t) free.push(h);
      if(!free.length) break;
      const h = free[Math.floor(rnd()*free.length)];
      const activeRes = resUntil.filter(x=>x.until > t).map(x=>x.id);
      const r = rnd();
      let k = 'naya';
      if(r >= 0.66 && r < 0.94){
        if(activeRes.length < 2){
          const pool = RESIDENTS.filter(x=>!activeRes.includes(x.id));
          if(pool.length) k = pool[Math.floor(rnd()*pool.length)].id;
        }
      } else if(r >= 0.94 && hiroUntil <= t){
        k = 'hiro';
      }
      const dd = Math.round(d);
      ev.push({ t: Math.round(t), h, k, d: dd });
      freeAt[h] = t + dd + 180;
      if(k === 'hiro') hiroUntil = t + dd;
      else if(k !== 'naya') resUntil.push({ id:k, until: t + dd });
    }
    t += iv;
  }
  return ev;
}

/* ---- 盤面 ---- */
const board = $('board');
const holes = [];
for(let i=0;i<HOLES;i++){
  const h = document.createElement('div');
  h.className = 'hole';
  h.innerHTML = '<img class="cellimg" alt="">';
  board.appendChild(h);
  const rec = { idx:i, el:h, img:h.querySelector('.cellimg'), busy:false, kind:null,
                hideTimer:null, bobTimer:null, resolved:true, trap:false };
  rec.img.src = IMG.hole;
  holes.push(rec);
}

const S = { running:false, score:0, combo:0, maxCombo:0, hits:0, feverUntil:0,
            startAt:0, schedule:[], cursor:0, loopTimer:null, clockTimer:null, feverTimer:null,
            trapQueue:0, lastSentCombo:0 };
const scoreVal = $('hud-score').querySelector('.val');
const comboVal = $('hud-combo').querySelector('.val');
const timeVal  = $('hud-time').querySelector('.val');

/* ---- 部屋 ---- */
const R = { net:null, code:null, me:null, isHost:false, members:[], players:[], opponent:null,
            opScore:0, opDone:null, myDone:null, status:'idle' };

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  $(id).classList.add('active');
}
function inFever(){ return Date.now() < S.feverUntil; }
function elapsedMs(){ return Date.now() - S.startAt; }
function lastSpurt(){ return (GAME_TIME*1000 - elapsedMs()) <= 10000; }
function send(msg){ R.net && R.net.send(msg); }
function watchUrl(code){
  const base = location.href.replace(/[^/]*$/, '');
  return base + 'watch.html?room=' + code + (NET_FORCE_LOCAL ? '&local=1' : '');
}
function loadPlayerName(){ try{ return localStorage.getItem('nayamole-playername') || ''; }catch(e){ return ''; } }
function myName(){
  const n = $('name-input').value.trim().slice(0,10) || 'ななし';
  try{ localStorage.setItem('nayamole-playername', n); }catch(e){}
  return n;
}

let toastTimer = null;
function toast(text, cls){
  const t = $('toast');
  t.textContent = text; t.className = 'toast show ' + (cls||'');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.classList.remove('show'), 1100);
}

/* ---- 入室・退室 ---- */
async function enterRoom(code, isHost){
  R.code = code; R.isHost = isHost;
  R.me = { id: netId(), role:'player', name: myName(), host: isHost, joined: Date.now() };
  R.net = createNet(code);
  $('room-code').textContent = code;
  $('watch-url').textContent = watchUrl(code);
  $('room-note').textContent = R.net.mode === 'local'
    ? '※ 同一ブラウザ内モード（別タブ同士で対戦できます）'
    : '';
  renderMembers();
  showScreen('scr-room');
  await R.net.join(R.me, {
    onMsg: handleMsg,
    onPresence: list => { R.members = list; renderMembers(); checkOpponentLeft(); },
    onStatus: st => {
      R.status = st;
      if(st === 'error') $('room-note').textContent = '接続に失敗しました。通信環境を確認してもう一度お試しください。';
    }
  });
}

function playersSorted(){
  return R.members.filter(m=>m.role==='player').sort((a,b)=> (b.host?1:0)-(a.host?1:0) || a.joined - b.joined);
}

function renderMembers(){
  const ul = $('members');
  ul.innerHTML = '';
  const list = R.members.slice().sort((a,b)=> a.joined - b.joined);
  if(!list.length){ ul.innerHTML = '<li class="empty">接続中…</li>'; }
  list.forEach(m=>{
    const li = document.createElement('li');
    const tag = document.createElement('span');
    tag.className = 'tag ' + (m.role==='watch' ? 'watch' : (m.id===R.me.id ? 'me' : ''));
    tag.textContent = m.role==='watch' ? '観戦' : (m.host ? 'ホスト' : 'プレイヤー');
    const nm = document.createElement('span'); nm.textContent = m.name + (m.id===R.me.id ? '（あなた）' : '');
    li.appendChild(tag); li.appendChild(nm);
    ul.appendChild(li);
  });
  const players = playersSorted();
  const ready = players.length >= 2;
  const inRoom = players.some(p=>p.id===R.me.id);
  if(R.isHost){
    $('btn-start').style.display = '';
    $('btn-start').disabled = !ready;
    $('waiting-note').textContent = ready ? 'そろいました！スタートを押してください' : '相手の参加を待っています…';
  } else {
    $('btn-start').style.display = 'none';
    if(players.length > 2 && inRoom && players.indexOf(players.find(p=>p.id===R.me.id)) >= 2){
      $('waiting-note').textContent = 'この部屋は満員です。観戦は watch.html からどうぞ。';
    } else {
      $('waiting-note').textContent = ready ? 'ホストのスタートを待っています…' : 'ホストと相手の参加を待っています…';
    }
  }
}

function checkOpponentLeft(){
  if(!R.opponent) return;
  if(!R.members.some(m=>m.id===R.opponent.id)){
    if(S.running){ toast('相手が退出しました', 'bad'); }
    else if($('scr-result').classList.contains('active')){ $('again-note').textContent = '相手が退出しました'; $('btn-again').disabled = true; }
  }
}

function leaveRoom(){
  stopGame();
  if(R.net) R.net.leave();
  R.net = null; R.opponent = null; R.members = [];
  showScreen('scr-entry');
}

/* ---- メッセージ ---- */
function handleMsg(m, from){
  switch(m.t){
    case 'start': onStart(m); break;
    case 'tick':  if(R.opponent && m.p===R.opponent.id){ R.opScore = m.s; updateVsBar(); } break;
    case 'hit':   if(R.opponent && m.p===R.opponent.id){ R.opScore = m.s; updateVsBar(); } break;
    case 'trap':  if(m.to === R.me.id) receiveTrap(m); break;
    case 'end':   if(R.opponent && m.p===R.opponent.id){ R.opDone = m; R.opScore = m.s; maybeShowResult(); } break;
  }
}

/* ---- 開始 ---- */
$('btn-start').addEventListener('click', ()=>{
  const players = playersSorted().slice(0,2).map(p=>({ id:p.id, name:p.name }));
  if(players.length < 2) return;
  const seed = (Math.random()*0xffffffff) >>> 0;
  const time = (R.net.mode==='local' && PARAMS.get('t')) ? Math.max(5, parseInt(PARAMS.get('t'),10)||60) : 60;
  const msg = { t:'start', seed, players, time, at: Date.now() };
  send(msg); R.net.flush();
  onStart(msg);
});

function onStart(m){
  if(S.running) return;
  const mine = m.players.find(p=>p.id===R.me.id);
  if(!mine) return; // この部屋の対戦者ではない
  R.opponent = m.players.find(p=>p.id!==R.me.id) || null;
  R.opScore = 0; R.opDone = null; R.myDone = null;
  GAME_TIME = m.time || 60;
  S.schedule = buildSchedule(m.seed, GAME_TIME);
  $('vs-me-name').textContent = mine.name;
  $('vs-op-name').textContent = R.opponent ? R.opponent.name : '？';
  startCountdown();
}

function startCountdown(){
  showScreen('scr-game');
  resetGame();
  const cd = $('countdown');
  cd.style.display = 'flex';
  let n = 3;
  cd.textContent = n; sndTick();
  const iv = setInterval(()=>{
    n--;
    if(n > 0){ cd.textContent = n; sndTick(); }
    else{
      clearInterval(iv);
      cd.textContent = 'GO!'; beep(1320,.15,'square',.07);
      setTimeout(()=>{ cd.style.display = 'none'; startGame(); }, 450);
    }
  }, 700);
}

function resetGame(){
  S.score=0; S.combo=0; S.maxCombo=0; S.hits=0; S.feverUntil=0; S.cursor=0; S.trapQueue=0; S.lastSentCombo=0;
  R.opScore = 0;
  scoreVal.textContent=0; comboVal.textContent=0; timeVal.textContent=GAME_TIME;
  $('vs-op-score').textContent = 0; updateVsBar();
  $('hud-time').classList.remove('hurry');
  document.body.classList.remove('fever');
  $('fever-bar').classList.remove('on');
  holes.forEach(h=>{ clearTimeout(h.hideTimer); clearInterval(h.bobTimer); h.busy=false; h.resolved=true; h.trap=false; h.el.classList.remove('trap'); h.img.src=IMG.hole; });
}

function startGame(){
  S.running = true;
  S.startAt = Date.now();
  S.loopTimer = setInterval(gameLoop, 25);
  S.clockTimer = setInterval(()=>{
    const left = Math.max(0, Math.ceil((GAME_TIME*1000 - elapsedMs())/1000));
    timeVal.textContent = left;
    if(left === 10){ $('hud-time').classList.add('hurry'); beep(880,.1,'square',.06); }
    send({ t:'tick', p:R.me.id, s:S.score, c:S.combo, l:left, mc:S.maxCombo });
  }, 1000);
}

function gameLoop(){
  if(!S.running) return;
  const now = elapsedMs();
  if(now >= GAME_TIME*1000){ endGame(); return; }
  while(S.cursor < S.schedule.length && S.schedule[S.cursor].t <= now){
    const ev = S.schedule[S.cursor++];
    let hole = holes[ev.h];
    if(hole.busy){
      const free = holes.filter(h=>!h.busy);
      if(!free.length) continue;
      hole = free[Math.floor(Math.random()*free.length)];
    }
    popUp(hole, ev.k, ev.d, false);
  }
  if(S.trapQueue > 0){
    const free = holes.filter(h=>!h.busy);
    if(free.length){
      S.trapQueue--;
      const hole = free[Math.floor(Math.random()*free.length)];
      const onBoard = holes.filter(h=>h.busy && RESIDENT_BY_ID[h.kind]).map(h=>h.kind);
      const pool = RESIDENTS.filter(r=>!onBoard.includes(r.id));
      const who = (pool.length ? pool : RESIDENTS)[Math.floor(Math.random()*(pool.length||RESIDENTS.length))];
      let d = 1120 - (now/(GAME_TIME*1000))*400; if(lastSpurt()) d *= 0.85; d = Math.max(520, Math.round(d)) + 200;
      popUp(hole, who.id, d, true);
    }
  }
}

function frameKey(kind, phase){
  const base = kind === 'naya' ? (inFever() ? 'nayafire' : 'naya') : kind;
  return IMG[base + '_' + phase];
}

function popUp(hole, kind, dur, isTrap){
  hole.busy = true; hole.resolved = false; hole.kind = kind; hole.trap = !!isTrap;
  hole.el.classList.toggle('trap', !!isTrap);
  hole.img.src = frameKey(kind,'peek');
  hole.img.classList.remove('jump');
  void hole.img.offsetWidth;
  hole.img.classList.add('jump');
  send({ t:'pop', p:R.me.id, h:hole.idx, k: kind==='naya' && inFever() ? 'nayafire' : kind, d:dur, x: isTrap?1:0 });
  setTimeout(()=>{ if(hole.busy && !hole.resolved) hole.img.src = frameKey(kind,'half'); }, 110);
  let bobUp = true;
  hole.bobTimer = setInterval(()=>{
    if(!hole.busy || hole.resolved) return;
    bobUp = !bobUp;
    hole.img.src = frameKey(kind, bobUp ? 'half' : 'peek');
  }, 480);
  hole.hideTimer = setTimeout(()=>{
    if(!hole.resolved){
      hole.resolved = true;
      if(kind==='naya' && S.combo > 0){ S.combo = 0; comboVal.textContent = 0; }
    }
    retreat(hole);
  }, dur);
}

function retreat(hole){
  clearInterval(hole.bobTimer);
  hole.img.src = IMG.hole;
  hole.el.classList.remove('trap');
  setTimeout(()=>{ hole.busy = false; }, 140);
}

function floatPop(hole, text, cls){
  const p = document.createElement('div');
  p.className = 'pop ' + (cls||'');
  p.textContent = text;
  hole.el.appendChild(p);
  setTimeout(()=>p.remove(), 720);
}
function speech(hole, text){
  const b = document.createElement('div');
  b.className = 'bubble'; b.textContent = text;
  hole.el.appendChild(b);
  setTimeout(()=>b.remove(), 1250);
}

function onWhack(hole){
  if(!S.running || !hole.busy || hole.resolved) return;
  hole.resolved = true;
  clearTimeout(hole.hideTimer);
  const kind = hole.kind;
  let r, g = 0;

  if(kind === 'naya'){
    S.combo++; S.hits++;
    S.maxCombo = Math.max(S.maxCombo, S.combo);
    g = 10 + Math.min(S.combo-1, 10) * 2;
    if(inFever()) g *= 2;
    S.score += g;
    floatPop(hole, '+'+g, 'good');
    sndHit();
    clearInterval(hole.bobTimer);
    hole.img.src = frameKey(kind,'hit');
    setTimeout(()=>retreat(hole), 240);
    r = 'naya';
    if(S.combo % 5 === 0 && R.opponent) sendTrap();
  }
  else if(RESIDENT_BY_ID[kind]){
    S.score = Math.max(0, S.score - 30);
    S.combo = 0; g = -30;
    floatPop(hole, '-30');
    speech(hole, RESIDENT_BY_ID[kind].line);
    sndBad();
    if(navigator.vibrate) navigator.vibrate(60);
    clearInterval(hole.bobTimer);
    hole.img.src = frameKey(kind,'hit');
    setTimeout(()=>retreat(hole), 520);
    r = 'res';
  }
  else { // ヒロ：フィーバー
    S.feverUntil = Date.now() + 5000;
    document.body.classList.add('fever');
    $('fever-bar').classList.add('on');
    floatPop(hole, '笑顔フィーバー！', 'fever-pop');
    speech(hole, HIRO.line);
    sndFever();
    clearInterval(S.feverTimer);
    S.feverTimer = setInterval(()=>{
      const left = S.feverUntil - Date.now();
      $('fever-fill').style.width = Math.max(0, left/5000*100) + '%';
      if(left <= 0){
        clearInterval(S.feverTimer);
        document.body.classList.remove('fever');
        $('fever-bar').classList.remove('on');
      }
    }, 100);
    setTimeout(()=>retreat(hole), 260);
    r = 'hiro';
  }
  scoreVal.textContent = S.score;
  comboVal.textContent = S.combo;
  updateVsBar();
  send({ t:'hit', p:R.me.id, h:hole.idx, r, g, s:S.score, c:S.combo, x: hole.trap?1:0 });
}

holes.forEach(h=>{
  h.el.addEventListener('pointerdown', e=>{ e.preventDefault(); onWhack(h); });
});

/* ---- おじゃま ---- */
function sendTrap(){
  const who = RESIDENTS[Math.floor(Math.random()*RESIDENTS.length)];
  send({ t:'trap', to:R.opponent.id, by:R.me.id, who:who.id });
  toast(who.name + 'を送り込んだ！', 'good');
}
function receiveTrap(m){
  if(!S.running) return;
  S.trapQueue = Math.min(S.trapQueue + 1, 3);
  const who = RESIDENT_BY_ID[m.who];
  toast('おじゃま！' + (who ? who.name + 'が来た' : ''), 'bad');
  beep(220,.12,'sawtooth',.05);
}

function updateVsBar(){
  $('vs-op-score').textContent = R.opScore;
  const a = S.score, b = R.opScore, tot = a + b;
  const pct = tot === 0 ? 50 : (a / tot) * 100;
  $('vs-fill').style.width = pct + '%';
}

/* ---- 終了 ---- */
function stopGame(){
  S.running = false;
  clearInterval(S.loopTimer); clearInterval(S.clockTimer); clearInterval(S.feverTimer);
  document.body.classList.remove('fever');
  $('fever-bar').classList.remove('on');
  holes.forEach(h=>{ clearTimeout(h.hideTimer); clearInterval(h.bobTimer); h.resolved=true; h.img.src=IMG.hole; h.el.classList.remove('trap'); setTimeout(()=>{ h.busy=false; },140); });
}

function endGame(){
  stopGame();
  timeVal.textContent = 0;
  beep(523,.12,'square',.06); beep(392,.2,'square',.06,.14);
  R.myDone = { t:'end', p:R.me.id, s:S.score, hits:S.hits, mc:S.maxCombo };
  send(R.myDone); R.net.flush();
  const cd = $('countdown');
  cd.textContent = 'おしまい！';
  cd.style.display = 'flex';
  setTimeout(()=>{ cd.style.display = 'none'; maybeShowResult(true); }, 1100);
}

let resultWait = null;
function maybeShowResult(fromSelf){
  if(!R.myDone) return;
  if(!R.opDone){
    if(fromSelf){
      // 相手の終了通知を最大 3 秒待ってから、直近のスコアで表示
      clearTimeout(resultWait);
      resultWait = setTimeout(()=>{ if(!R.opDone){ R.opDone = { s:R.opScore, hits:null, mc:null }; showResult(); } }, 3000);
    }
    return;
  }
  clearTimeout(resultWait);
  showResult();
}

function showResult(){
  if($('scr-result').classList.contains('active')) return;
  const me = S.score, op = R.opDone.s;
  const v = $('verdict');
  v.className = 'verdict';
  if(me > op){ v.textContent = 'かち！'; }
  else if(me < op){ v.textContent = 'まけ…'; v.classList.add('lose'); }
  else { v.textContent = 'ひきわけ'; v.classList.add('draw'); }
  $('rs-me-name').textContent = R.me.name;
  $('rs-op-name').textContent = R.opponent ? R.opponent.name : 'あいて';
  $('rs-me').textContent = me;
  $('rs-op').textContent = op;
  $('rs-me-meta').textContent = 'たたいた数 ' + S.hits + '／さいだいコンボ ' + S.maxCombo;
  $('rs-op-meta').textContent = R.opDone.hits != null ? 'たたいた数 ' + R.opDone.hits + '／さいだいコンボ ' + R.opDone.mc : '';
  $('btn-again').style.display = R.isHost ? '' : 'none';
  $('btn-again').disabled = false;
  $('again-note').textContent = R.isHost ? '' : 'ホストの「もう一回」を待っています…';
  showScreen('scr-result');
}

$('btn-again').addEventListener('click', ()=>{
  const players = playersSorted().slice(0,2).map(p=>({ id:p.id, name:p.name }));
  if(players.length < 2){ $('again-note').textContent = '相手がいません'; return; }
  const seed = (Math.random()*0xffffffff) >>> 0;
  const msg = { t:'start', seed, players, time: GAME_TIME, at: Date.now() };
  send(msg); R.net.flush();
  onStart(msg);
});

/* ---- 入口 ---- */
$('name-input').value = loadPlayerName();
$('btn-create').addEventListener('click', ()=>{
  const code = String(Math.floor(1000 + Math.random()*9000));
  enterRoom(code, true);
});
$('btn-join').addEventListener('click', ()=>{
  const code = $('code-input').value.trim();
  if(!/^\d{4}$/.test(code)){ $('entry-note').textContent = '部屋コードは4けたの数字です'; return; }
  $('entry-note').textContent = '';
  enterRoom(code, false);
});
$('code-input').addEventListener('keydown', e=>{ if(e.key==='Enter') $('btn-join').click(); });
$('btn-leave').addEventListener('click', leaveRoom);
$('btn-leave2').addEventListener('click', leaveRoom);

if(/^\d{4}$/.test(PARAMS.get('room')||'')){ $('code-input').value = PARAMS.get('room'); }
$('entry-note').textContent = (NET_FORCE_LOCAL || !useSupabase()) ? '※ 同一ブラウザ内モード（別タブ同士で対戦できます）' : '';
