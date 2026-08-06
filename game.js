/* =========================================================
   キャラクタースプライト（設定シートから切り出し）
========================================================= */
const IMG = {
  nayafire_peek: 'img/nayafire_peek.png',
  nayafire_half: 'img/nayafire_half.png',
  nayafire_hit: 'img/nayafire_hit.png',
  naya_full: 'img/naya_full.png',
  hole: 'img/hole.png',
  kaicho_peek: 'img/kaicho_peek.png',
  kaicho_half: 'img/kaicho_half.png',
  kaicho_hit: 'img/kaicho_hit.png',
  rijicho_peek: 'img/rijicho_peek.png',
  rijicho_half: 'img/rijicho_half.png',
  rijicho_hit: 'img/rijicho_hit.png',
  hirata_peek: 'img/hirata_peek.png',
  hirata_half: 'img/hirata_half.png',
  hirata_hit: 'img/hirata_hit.png',
  sano_peek: 'img/sano_peek.png',
  sano_half: 'img/sano_half.png',
  sano_hit: 'img/sano_hit.png',
  riko_peek: 'img/riko_peek.png',
  riko_half: 'img/riko_half.png',
  riko_hit: 'img/riko_hit.png',
  hiro_peek: 'img/hiro_peek.png',
  hiro_half: 'img/hiro_half.png',
  hiro_hit: 'img/hiro_hit.png',
  naya_peek: 'img/naya_peek.png',
  naya_half: 'img/naya_half.png',
  naya_hit: 'img/naya_hit.png',
};
function imgTag(key, alt){ return '<img src="'+IMG[key]+'" alt="'+alt+'">'; }

const RESIDENTS = [
  { id:'kaicho',  name:'会長っち',       line:'なんとかなる…って、わしやがな！' },
  { id:'rijicho', name:'理事長っち',     line:'まあまあ、そう焦らずいきましょ！' },
  { id:'hirata',  name:'平田さん',       line:'いっち！…て、うちやん！' },
  { id:'riko',    name:'リコさん',       line:'だ、大丈夫ですよ〜…！' },
  { id:'sano',    name:'佐野副理事長',   line:'数字はウソつきませんから…' },
];
const HIRO = { id:'hiro', name:'ドクター・ヒロ', line:'笑顔が一番の薬だよ〜！' };

/* =========================================================
   サウンド（WebAudio・軽量）
========================================================= */
let audioCtx = null, muted = false;
function beep(freq, dur, type, vol, when){
  if(muted) return;
  try{
    audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)();
    const t = audioCtx.currentTime + (when||0);
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type||'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol||0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t+dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t); o.stop(t+dur);
  }catch(e){}
}
const sndHit   = ()=>{ beep(660,.08); beep(880,.08,'square',.05,.06); };
const sndBad   = ()=>{ beep(160,.22,'sawtooth',.07); };
const sndFever = ()=>{ [523,659,784,1047].forEach((f,i)=>beep(f,.1,'square',.06,i*.07)); };
const sndTick  = ()=>{ beep(990,.05,'square',.04); };
document.getElementById('mute-btn').addEventListener('click', e=>{
  muted = !muted; e.target.textContent = muted ? '×' : '♪';
});

/* =========================================================
   スコア保存
   ---------------------------------------------------------
   CONFIG に Supabase の URL と anon キーを設定すると
   全ユーザー共通ランキング（game_scoresテーブル）になります。
   未設定の間は localStorage による端末内ランキングで動作。
   テーブル定義・手順は同梱の README.md を参照。
========================================================= */
const CONFIG = {
  SUPABASE_URL: '',        // 例: https://xxxx.supabase.co
  SUPABASE_ANON_KEY: '',   // Project Settings → API → anon public
  GAME_ID: 'nayamole'
};
const useSupabase = () => !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);

function isoWeekKey(d){
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil((((t - Date.UTC(y,0,1)) / 86400000) + 1) / 7);
  return y + '-W' + String(w).padStart(2,'0');
}
function monthKey(d){ return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'); }
function weekStart(d){ const t=new Date(d); t.setDate(t.getDate() - ((t.getDay()+6)%7)); t.setHours(0,0,0,0); return t; }
function monthStart(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
function lsKey(kind){
  return kind==='weekly' ? 'nayamole-weekly-'+isoWeekKey(new Date())
                         : 'nayamole-monthly-'+monthKey(new Date());
}

async function sbFetch(path, opts={}){
  const res = await fetch(CONFIG.SUPABASE_URL + '/rest/v1/' + path, {
    ...opts,
    headers: {
      'apikey': CONFIG.SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      ...(opts.headers||{})
    }
  });
  if(!res.ok) throw new Error('supabase ' + res.status);
  return res.status === 204 ? null : res.json();
}

async function saveScore(name, score){
  try{ localStorage.setItem('nayamole-playername', name); }catch(e){}
  if(useSupabase()){
    try{
      await sbFetch('game_scores', {
        method:'POST',
        headers:{ 'Prefer':'return=minimal' },
        body: JSON.stringify({ game: CONFIG.GAME_ID, name, score })
      });
      return;
    }catch(e){ console.error('スコア送信失敗、端末内に保存します', e); }
  }
  for(const kind of ['weekly','monthly']){
    const key = lsKey(kind);
    let list = [];
    try{ list = JSON.parse(localStorage.getItem(key) || '[]'); }catch(e){}
    list.push({ name, score, ts: Date.now() });
    list.sort((a,b)=> b.score - a.score || a.ts - b.ts);
    try{ localStorage.setItem(key, JSON.stringify(list.slice(0,10))); }catch(e){}
  }
}

async function loadBoard(kind){
  const limit = kind === 'weekly' ? 10 : 3;
  if(useSupabase()){
    try{
      const since = (kind==='weekly' ? weekStart(new Date()) : monthStart(new Date())).toISOString();
      return await sbFetch('game_scores'
        + '?game=eq.' + CONFIG.GAME_ID
        + '&created_at=gte.' + encodeURIComponent(since)
        + '&select=name,score&order=score.desc,created_at.asc&limit=' + limit);
    }catch(e){ console.error('ランキング取得失敗、端末内を表示します', e); }
  }
  let list = [];
  try{ list = JSON.parse(localStorage.getItem(lsKey(kind)) || '[]'); }catch(e){}
  return list.slice(0, limit);
}
function loadPlayerName(){
  try{ return localStorage.getItem('nayamole-playername') || ''; }catch(e){ return ''; }
}

/* =========================================================
   ゲーム本体
========================================================= */
const GAME_TIME = 60;
const HOLES = 9;
const board = document.getElementById('board');
const holes = [];

for(let i=0;i<HOLES;i++){
  const h = document.createElement('div');
  h.className = 'hole';
  h.innerHTML = '<img class="cellimg" alt="">';
  board.appendChild(h);
  const rec = { el:h, img:h.querySelector('.cellimg'), busy:false, type:null,
                hideTimer:null, bobTimer:null, resolved:false };
  rec.img.src = IMG.hole;
  holes.push(rec);
}
document.getElementById('title-naya').innerHTML = imgTag('naya_full','なやまっち');

const S = { running:false, score:0, combo:0, maxCombo:0, timeLeft:GAME_TIME,
            hits:0, feverUntil:0, spawnTimer:null, clockTimer:null, feverTimer:null };

const $ = id => document.getElementById(id);
const scoreVal = $('hud-score').querySelector('.val');
const comboVal = $('hud-combo').querySelector('.val');
const timeVal  = $('hud-time').querySelector('.val');

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  $(id).classList.add('active');
}

function inFever(){ return Date.now() < S.feverUntil; }
function elapsed(){ return GAME_TIME - S.timeLeft; }
function lastSpurt(){ return S.timeLeft <= 10; }

function spawnInterval(){
  let iv = 880 - (elapsed()/GAME_TIME) * 380;      // 880 → 500ms
  if(lastSpurt()) iv *= 0.72;
  if(inFever())   iv *= 0.55;
  return Math.max(240, iv);
}
function upDuration(){
  let d = 1120 - (elapsed()/GAME_TIME) * 400;      // 1120 → 720ms
  if(lastSpurt()) d *= 0.85;
  return Math.max(520, d);
}

function pickType(){
  if(inFever()) return { kind:'naya' };
  const active = holes.filter(h=>h.busy && h.type).map(h=>h.type);
  const activeResidents = active.filter(t=>t.kind==='resident').map(t=>t.data.id);
  const hiroOnBoard = active.some(t=>t.kind==='hiro');
  const r = Math.random();
  if(r < 0.66) return { kind:'naya' };
  if(r < 0.94){
    if(activeResidents.length >= 2) return { kind:'naya' };
    const pool = RESIDENTS.filter(x=>!activeResidents.includes(x.id));
    if(!pool.length) return { kind:'naya' };
    return { kind:'resident', data: pool[Math.floor(Math.random()*pool.length)] };
  }
  return hiroOnBoard ? { kind:'naya' } : { kind:'hiro' };
}

function spawnLoop(){
  if(!S.running) return;
  const free = holes.filter(h=>!h.busy);
  if(free.length){
    const hole = free[Math.floor(Math.random()*free.length)];
    popUp(hole, pickType());
    // ラッシュ時はもう1体
    if((lastSpurt() || inFever()) && free.length > 3 && Math.random() < 0.5){
      const rest = holes.filter(h=>!h.busy);
      if(rest.length) popUp(rest[Math.floor(Math.random()*rest.length)], pickType());
    }
  }
  S.spawnTimer = setTimeout(spawnLoop, spawnInterval());
}

function frameOf(t, phase){
  const id = t.kind==='naya' ? (inFever() ? 'nayafire' : 'naya') : t.kind==='hiro' ? 'hiro' : t.data.id;
  return IMG[id + '_' + phase];
}

function popUp(hole, type){
  hole.busy = true; hole.resolved = false; hole.type = type;
  hole.img.src = frameOf(type,'peek');
  hole.img.classList.remove('jump');
  void hole.img.offsetWidth;
  hole.img.classList.add('jump');
  setTimeout(()=>{ if(hole.busy && !hole.resolved) hole.img.src = frameOf(type,'half'); }, 110);
  // 待機中は 半分出る⇄ひょっこり でもぞもぞ動く
  let bobUp = true;
  hole.bobTimer = setInterval(()=>{
    if(!hole.busy || hole.resolved) return;
    bobUp = !bobUp;
    hole.img.src = frameOf(type, bobUp ? 'half' : 'peek');
  }, 480);
  hole.hideTimer = setTimeout(()=>{
    if(!hole.resolved){
      hole.resolved = true;
      if(type.kind==='naya' && S.combo > 0){ S.combo = 0; comboVal.textContent = 0; } // 取り逃しでコンボ切れ
    }
    retreat(hole);
  }, upDuration());
}

function retreat(hole){
  clearInterval(hole.bobTimer);
  hole.img.src = IMG.hole;
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
  const t = hole.type;

  if(t.kind === 'naya'){
    S.combo++; S.hits++;
    S.maxCombo = Math.max(S.maxCombo, S.combo);
    let gain = 10 + Math.min(S.combo-1, 10) * 2;
    if(inFever()) gain *= 2;
    S.score += gain;
    floatPop(hole, '+'+gain, 'good');
    sndHit();
    clearInterval(hole.bobTimer);
    hole.img.src = frameOf(t,'hit');
    setTimeout(()=>retreat(hole), 240);
  }
  else if(t.kind === 'resident'){
    S.score = Math.max(0, S.score - 30);
    S.combo = 0;
    floatPop(hole, '-30');
    speech(hole, t.data.line);
    sndBad();
    if(navigator.vibrate) navigator.vibrate(60);
    clearInterval(hole.bobTimer);
    hole.img.src = frameOf(t,'hit');
    setTimeout(()=>retreat(hole), 520);
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
  }
  scoreVal.textContent = S.score;
  comboVal.textContent = S.combo;
}

holes.forEach(h=>{
  h.el.addEventListener('pointerdown', e=>{ e.preventDefault(); onWhack(h); });
});

/* ---- 進行 ---- */
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
  S.score=0; S.combo=0; S.maxCombo=0; S.hits=0; S.timeLeft=GAME_TIME; S.feverUntil=0;
  scoreVal.textContent=0; comboVal.textContent=0; timeVal.textContent=GAME_TIME;
  $('hud-time').classList.remove('hurry');
  document.body.classList.remove('fever');
  $('fever-bar').classList.remove('on');
  holes.forEach(h=>{ clearTimeout(h.hideTimer); clearInterval(h.bobTimer); h.busy=false; h.resolved=true; h.img.src=IMG.hole; });
}

function startGame(){
  S.running = true;
  spawnLoop();
  S.clockTimer = setInterval(()=>{
    S.timeLeft--;
    timeVal.textContent = S.timeLeft;
    if(S.timeLeft === 10){ $('hud-time').classList.add('hurry'); beep(880,.1,'square',.06); }
    if(S.timeLeft <= 0) endGame();
  }, 1000);
}

function endGame(){
  S.running = false;
  clearInterval(S.clockTimer);
  clearTimeout(S.spawnTimer);
  clearInterval(S.feverTimer);
  document.body.classList.remove('fever');
  $('fever-bar').classList.remove('on');
  holes.forEach(h=>{ clearTimeout(h.hideTimer); retreat(h); });
  beep(523,.12,'square',.06); beep(392,.2,'square',.06,.14);
  const cd = $('countdown');
  cd.textContent = 'おしまい！';
  cd.style.display = 'flex';
  setTimeout(()=>{ cd.style.display = 'none'; showResult(); }, 1100);
}

/* ---- 結果とランキング ---- */
let currentTab = 'weekly';
let lastScore = 0;
let registeredThisGame = false;

async function showResult(){
  lastScore = S.score;
  registeredThisGame = false;
  const lockIds = ['btn-retry','btn-title','btn-register'];
  lockIds.forEach(id=>{ const b=$(id); b.disabled=true; });
  setTimeout(()=>lockIds.forEach(id=>{ const b=$(id); b.disabled=false; }), 1200);
  $('result-score').textContent = S.score;
  $('result-meta').textContent = 'たたいた数 ' + S.hits + '　さいだいコンボ ' + S.maxCombo;
  $('register-row').style.display = S.score > 0 ? 'flex' : 'none';
  $('registered-note').style.display = 'none';
  const prev = loadPlayerName();
  if(prev) $('name-input').value = prev;
  showScreen('scr-result');
  renderBoard();
}

async function renderBoard(){
  const list = await loadBoard(currentTab);
  const ol = $('board-list');
  ol.innerHTML = '';
  if(!list.length){
    ol.innerHTML = '<li class="empty">まだ記録がありません。一番乗りのチャンス！</li>';
  } else {
    list.forEach((r,i)=>{
      const li = document.createElement('li');
      if(i===0) li.className = 'top1';
      li.innerHTML = '<span class="rank">'+(i+1)+'位</span><span class="nm"></span><span class="sc"></span>';
      li.querySelector('.nm').textContent = r.name;
      li.querySelector('.sc').textContent = r.score;
      ol.appendChild(li);
    });
  }
  const now = new Date();
  $('board-caption').textContent = currentTab==='weekly'
    ? '今週（' + isoWeekKey(now) + '）のランキング'
    : '今月（' + monthKey(now) + '）のランキング';
}

$('tab-weekly').addEventListener('click', ()=>{
  currentTab='weekly';
  $('tab-weekly').classList.add('on'); $('tab-monthly').classList.remove('on');
  renderBoard();
});
$('tab-monthly').addEventListener('click', ()=>{
  currentTab='monthly';
  $('tab-monthly').classList.add('on'); $('tab-weekly').classList.remove('on');
  renderBoard();
});

$('btn-register').addEventListener('click', async ()=>{
  if(registeredThisGame) return;
  const name = $('name-input').value.trim() || 'ななし';
  registeredThisGame = true;
  await saveScore(name, lastScore);
  $('register-row').style.display = 'none';
  $('registered-note').style.display = 'block';
  renderBoard();
});

$('btn-start').addEventListener('click', startCountdown);
$('btn-retry').addEventListener('click', startCountdown);
$('btn-title').addEventListener('click', ()=>showScreen('scr-title'));
$('btn-ranking').addEventListener('click', ()=>{
  $('result-card').style.display = 'none';
  showScreen('scr-result');
  renderBoard();
});
$('backend-note').textContent = useSupabase()
  ? '' : '※いまは端末内ランキングです（Supabase設定で全員共通になります）';
// タイトル経由でランキングを閉じたあと、結果カードを復活させる
$('btn-title').addEventListener('click', ()=>{ $('result-card').style.display = ''; });
