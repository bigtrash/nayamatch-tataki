/* =========================================================
   なやまっちたたき 2人対戦 観戦画面（大型モニタ向け）
   ---------------------------------------------------------
   プレイヤーが配信する pop / hit / tick / trap / end を再現表示する。
   自分では何も判定しない（純粋な再生機）。
========================================================= */
bindMuteButton();
const $ = id => document.getElementById(id);
const PARAMS = new URLSearchParams(location.search);
const HOLES = 9;
let GAME_TIME = 60;

$('entry-naya').innerHTML = imgTag('naya_full','なやまっち');

const W = { net:null, code:null, me:null, members:[], running:false, started:false,
            startAt:0, clockTimer:null, slots:[], byId:{}, resultTimer:null, phase:'entry' };

function makeSlot(key, boardEl){
  const holes = [];
  boardEl.innerHTML = '';
  for(let i=0;i<HOLES;i++){
    const h = document.createElement('div');
    h.className = 'hole';
    h.innerHTML = '<img class="cellimg" alt="">';
    boardEl.appendChild(h);
    const rec = { el:h, img:h.querySelector('.cellimg'), busy:false, kind:null, hideTimer:null, bobTimer:null };
    rec.img.src = IMG.hole;
    holes.push(rec);
  }
  return { key, id:null, name:'', score:0, combo:0, maxCombo:0, hits:null, feverUntil:0, feverTimer:null, done:null,
           holes, el:$('pl-'+key), nameEl:$('p'+key+'-name'), scoreEl:$('p'+key+'-score'),
           comboEl:$('p'+key+'-combo'), tugEl:$('tug-'+key) };
}
W.slots = [ makeSlot('a', $('pa-board')), makeSlot('b', $('pb-board')) ];

function showOverlay(id){
  document.querySelectorAll('.overlay').forEach(o=>o.classList.remove('active'));
  if(id) $(id).classList.add('active');
}

/* ---- 入室 ---- */
async function enterRoom(code){
  W.code = code;
  W.me = { id: netId(), role:'watch', name:'観戦', joined: Date.now() };
  W.net = createNet(code);
  $('chip-code').textContent = code;
  $('lobby-code').textContent = code;
  W.phase = 'lobby';
  showOverlay('scr-lobby');
  renderLobby();
  await W.net.join(W.me, {
    onMsg: handleMsg,
    onPresence: list => { W.members = list; renderLobby(); assignFromPresence(); },
    onStatus: st => { if(st==='error') $('lobby-status').textContent = '接続に失敗しました。通信環境を確認してください。'; }
  });
}

function playersSorted(){
  return W.members.filter(m=>m.role==='player').sort((a,b)=> (b.host?1:0)-(a.host?1:0) || a.joined - b.joined);
}

function renderLobby(){
  const ul = $('lobby-members');
  ul.innerHTML = '';
  const players = playersSorted();
  for(let i=0;i<2;i++){
    const li = document.createElement('li');
    const p = players[i];
    if(p){
      const tag = document.createElement('span'); tag.className = 'tag' + (p.host?' host':''); tag.textContent = p.host ? 'ホスト' : 'プレイヤー';
      const nm = document.createElement('span'); nm.textContent = p.name;
      li.appendChild(tag); li.appendChild(nm);
    } else { li.className = 'empty'; li.textContent = 'プレイヤー' + (i+1) + ' を待っています'; }
    ul.appendChild(li);
  }
  const watchers = W.members.filter(m=>m.role==='watch').length;
  $('lobby-status').textContent = players.length >= 2
    ? 'そろいました！ホストのスタート待ち' + (watchers>1 ? '（観戦 '+watchers+'）' : '')
    : 'プレイヤーを待っています…';
}

/* 途中から観戦した場合など、start を受け取れなくても presence から名前を埋める */
function assignFromPresence(){
  if(W.started) return;
  const players = playersSorted().slice(0,2);
  players.forEach((p,i)=> setSlotPlayer(W.slots[i], p));
}
function setSlotPlayer(slot, p){
  slot.id = p.id; slot.name = p.name;
  slot.nameEl.textContent = p.name;
  slot.tugEl.textContent = p.name;
  W.byId = {}; W.slots.forEach(s=>{ if(s.id) W.byId[s.id] = s; });
}

/* ---- メッセージ ---- */
function handleMsg(m){
  if(m.t === 'start'){ onStart(m); return; }
  let slot = W.byId[m.p];
  if(!slot && m.p && (m.t==='tick' || m.t==='pop' || m.t==='hit' || m.t==='end')){
    // 開始メッセージを取りこぼした（途中参加）場合の救済
    const free = W.slots.find(s=>!s.id);
    const pm = W.members.find(x=>x.id===m.p);
    if(free){ setSlotPlayer(free, { id:m.p, name: pm ? pm.name : 'プレイヤー' }); slot = free; }
    if(!W.started && W.phase!=='result'){ lateStart(); }
  }
  switch(m.t){
    case 'pop':  if(slot) popUp(slot, m); break;
    case 'hit':  if(slot) onHit(slot, m); break;
    case 'tick': if(slot) onTick(slot, m); break;
    case 'trap': onTrap(m); break;
    case 'end':  if(slot) onEnd(slot, m); break;
  }
}

/* ---- 開始 ---- */
function onStart(m){
  GAME_TIME = m.time || 60;
  resetAll();
  m.players.slice(0,2).forEach((p,i)=> setSlotPlayer(W.slots[i], p));
  W.started = true; W.phase = 'countdown';
  showOverlay(null);
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
      setTimeout(()=>{ cd.style.display = 'none'; startClock(); }, 450);
    }
  }, 700);
}
function lateStart(){
  resetAll(false);
  W.started = true; W.phase = 'running';
  showOverlay(null);
  startClock();
}

function resetAll(clearNames){
  clearInterval(W.clockTimer); clearTimeout(W.resultTimer);
  W.running = false;
  $('ticker').innerHTML = '';
  $('clock').textContent = GAME_TIME; $('clock').classList.remove('hurry');
  W.slots.forEach(s=>{
    s.score=0; s.combo=0; s.maxCombo=0; s.hits=null; s.feverUntil=0; s.done=null;
    clearInterval(s.feverTimer); s.el.classList.remove('fever','trapped');
    s.scoreEl.textContent = 0; s.comboEl.querySelector('.n').textContent = 0; s.comboEl.classList.remove('hot');
    s.holes.forEach(h=>{ clearTimeout(h.hideTimer); clearInterval(h.bobTimer); h.busy=false; h.img.src=IMG.hole; h.el.classList.remove('trap'); });
    if(clearNames !== false){ /* 名前は start で上書きされる */ }
  });
  updateTug();
}

function startClock(){
  W.running = true; W.phase = 'running';
  W.startAt = Date.now();
  W.clockTimer = setInterval(()=>{
    const left = Math.max(0, Math.ceil((GAME_TIME*1000 - (Date.now()-W.startAt))/1000));
    setClock(left);
    if(left <= 0) clearInterval(W.clockTimer);
  }, 250);
}
function setClock(left){
  const c = $('clock');
  if(String(left) !== c.textContent){
    c.textContent = left;
    if(left === 10){ c.classList.add('hurry'); beep(880,.1,'square',.06); }
    if(left <= 10 && left > 0) sndTick();
  }
}

/* ---- 再現表示 ---- */
function frameKey(k, phase){ return IMG[k + '_' + phase] || IMG['naya_' + phase]; }

function popUp(slot, m){
  const hole = slot.holes[m.h]; if(!hole) return;
  clearTimeout(hole.hideTimer); clearInterval(hole.bobTimer);
  hole.busy = true; hole.kind = m.k;
  hole.el.classList.toggle('trap', !!m.x);
  hole.img.src = frameKey(m.k,'peek');
  hole.img.classList.remove('jump'); void hole.img.offsetWidth; hole.img.classList.add('jump');
  setTimeout(()=>{ if(hole.busy && hole.kind===m.k) hole.img.src = frameKey(m.k,'half'); }, 110);
  let bobUp = true;
  hole.bobTimer = setInterval(()=>{
    if(!hole.busy) return;
    bobUp = !bobUp; hole.img.src = frameKey(m.k, bobUp ? 'half' : 'peek');
  }, 480);
  hole.hideTimer = setTimeout(()=> retreat(hole), (m.d || 900) + 120);
}
function retreat(hole){
  clearInterval(hole.bobTimer); clearTimeout(hole.hideTimer);
  hole.busy = false; hole.img.src = IMG.hole; hole.el.classList.remove('trap');
}
function floatPop(hole, text, cls){
  const p = document.createElement('div'); p.className = 'pop ' + (cls||''); p.textContent = text;
  hole.el.appendChild(p); setTimeout(()=>p.remove(), 720);
}
function speech(hole, text){
  const b = document.createElement('div'); b.className = 'bubble'; b.textContent = text;
  hole.el.appendChild(b); setTimeout(()=>b.remove(), 1250);
}

function setScore(slot, score, combo){
  if(score !== slot.score){
    slot.scoreEl.textContent = score;
    slot.scoreEl.classList.remove('bump'); void slot.scoreEl.offsetWidth; slot.scoreEl.classList.add('bump');
  }
  slot.score = score; slot.combo = combo;
  slot.maxCombo = Math.max(slot.maxCombo, combo);
  slot.comboEl.querySelector('.n').textContent = combo;
  slot.comboEl.classList.toggle('hot', combo >= 5);
  updateTug();
}

function onHit(slot, m){
  const hole = slot.holes[m.h];
  if(hole){
    clearTimeout(hole.hideTimer); clearInterval(hole.bobTimer);
    const k = hole.kind || (m.r==='res' ? 'kaicho' : m.r==='hiro' ? 'hiro' : 'naya');
    hole.img.src = frameKey(k,'hit');
    if(m.r === 'naya'){ floatPop(hole, '+'+m.g, 'good'); setTimeout(()=>retreat(hole), 240); }
    else if(m.r === 'res'){ floatPop(hole, '-30'); const rs = RESIDENT_BY_ID[k]; if(rs) speech(hole, rs.line); setTimeout(()=>retreat(hole), 520); }
    else { floatPop(hole, '笑顔フィーバー！', 'fever-pop'); speech(hole, HIRO.line); setTimeout(()=>retreat(hole), 260); }
  }
  if(m.r === 'naya'){
    sndHit();
    if(m.c > 0 && m.c % 10 === 0) ticker(slot, slot.name + '　' + m.c + 'コンボ！！');
  } else if(m.r === 'res'){
    sndBad();
    const rs = RESIDENT_BY_ID[hole && hole.kind];
    ticker(slot, slot.name + 'が' + (rs ? rs.name : '商店街の人') + 'をたたいた… −30', 'bad');
  } else {
    sndFever();
    slot.feverUntil = Date.now() + 5000;
    slot.el.classList.add('fever');
    clearInterval(slot.feverTimer);
    slot.feverTimer = setInterval(()=>{ if(Date.now() >= slot.feverUntil){ clearInterval(slot.feverTimer); slot.el.classList.remove('fever'); } }, 100);
    ticker(slot, slot.name + 'に笑顔フィーバー！ 5秒間 2倍', 'fever');
  }
  setScore(slot, m.s, m.c);
}

function onTick(slot, m){
  setScore(slot, m.s, m.c);
  if(m.mc != null) slot.maxCombo = Math.max(slot.maxCombo, m.mc);
  if(W.running && typeof m.l === 'number'){
    // プレイヤーの時計に合わせる（ずれが 1 秒を超えたら補正）
    const mine = Math.ceil((GAME_TIME*1000 - (Date.now()-W.startAt))/1000);
    if(Math.abs(mine - m.l) > 1){ W.startAt = Date.now() - (GAME_TIME - m.l)*1000; setClock(m.l); }
  }
}

function onTrap(m){
  const to = W.byId[m.to], by = W.byId[m.by];
  const rs = RESIDENT_BY_ID[m.who];
  if(to){ to.el.classList.remove('trapped'); void to.el.offsetWidth; to.el.classList.add('trapped'); }
  beep(220,.12,'sawtooth',.05);
  ticker(by || to, (by ? by.name : '？') + 'が' + (to ? to.name : '相手') + 'に' + (rs ? rs.name : '商店街の人') + 'を送り込んだ！', 'bad');
}

function ticker(slot, text, cls){
  const ul = $('ticker');
  const li = document.createElement('li');
  li.className = (slot ? slot.key : '') + ' ' + (cls||'');
  li.textContent = text;
  ul.insertBefore(li, ul.firstChild);
  while(ul.children.length > 6) ul.removeChild(ul.lastChild);
}

function updateTug(){
  const a = W.slots[0].score, b = W.slots[1].score, tot = a + b;
  $('tug-fill').style.width = (tot === 0 ? 50 : a/tot*100) + '%';
}

/* ---- 終了 ---- */
function onEnd(slot, m){
  slot.done = m; setScore(slot, m.s, 0); slot.hits = m.hits; slot.maxCombo = Math.max(slot.maxCombo, m.mc||0);
  const both = W.slots.every(s=>s.done);
  clearTimeout(W.resultTimer);
  W.resultTimer = setTimeout(showResult, both ? 1100 : 3500);
}

function showResult(){
  if(W.phase === 'result') return;
  W.phase = 'result'; W.running = false; W.started = false;
  clearInterval(W.clockTimer); setClock(0);
  W.slots.forEach(s=>{ s.holes.forEach(retreat); s.el.classList.remove('fever'); });
  const [A, B] = W.slots;
  const w = $('winner'); w.className = 'winner';
  if(A.score > B.score) w.textContent = A.name + ' のかち！';
  else if(B.score > A.score) w.textContent = B.name + ' のかち！';
  else { w.textContent = 'ひきわけ！'; w.classList.add('draw'); }
  $('rs-a-name').textContent = A.name; $('rs-b-name').textContent = B.name;
  $('rs-a').textContent = A.score; $('rs-b').textContent = B.score;
  const meta = s => s.hits != null ? 'たたいた数 ' + s.hits + '／さいだいコンボ ' + s.maxCombo : '';
  $('rs-a-meta').textContent = meta(A); $('rs-b-meta').textContent = meta(B);
  confetti(A.score === B.score ? 'both' : (A.score > B.score ? 'a' : 'b'));
  beep(523,.12,'square',.07); beep(659,.12,'square',.07,.14); beep(784,.25,'square',.07,.28);
  showOverlay('scr-result');
}

function confetti(side){
  const box = $('confetti'); box.innerHTML = '';
  const colors = side==='a' ? ['#e5383f','#ffb3b6','#f7dd4a'] : side==='b' ? ['#3fa0ff','#b3d9ff','#f7dd4a'] : ['#f7dd4a','#0f8a4c','#ee7800'];
  for(let i=0;i<90;i++){
    const c = document.createElement('i');
    c.style.left = Math.random()*100 + 'vw';
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = (2.2 + Math.random()*2) + 's';
    c.style.animationDelay = (Math.random()*1.5) + 's';
    c.style.transform = 'rotate(' + Math.random()*360 + 'deg)';
    box.appendChild(c);
  }
}

/* ---- 入口・ツール ---- */
$('btn-watch').addEventListener('click', ()=>{
  const code = $('code-input').value.trim();
  if(!/^\d{4}$/.test(code)){ $('entry-note').textContent = '部屋コードは4けたの数字です'; return; }
  enterRoom(code);
});
$('code-input').addEventListener('keydown', e=>{ if(e.key==='Enter') $('btn-watch').click(); });
$('fs-btn').addEventListener('click', ()=>{
  if(document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
});
$('entry-note').textContent = (NET_FORCE_LOCAL || !useSupabase()) ? '※ 同一ブラウザ内モード（別タブのプレイヤーを観戦）' : '';

const roomParam = PARAMS.get('room') || '';
if(/^\d{4}$/.test(roomParam)){ $('code-input').value = roomParam; enterRoom(roomParam); }
