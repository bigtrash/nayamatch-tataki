/* =========================================================
   共通定義（ひとり用 game.js と 対戦 versus.js / watch.js で共用）
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
const RESIDENT_BY_ID = Object.fromEntries(RESIDENTS.map(r=>[r.id, r]));

/* =========================================================
   Supabase 設定
   ---------------------------------------------------------
   URL と anon キーを設定すると
   ・ひとり用：全ユーザー共通ランキング（game_scoresテーブル）
   ・対戦：Realtime による部屋同期（テーブル不要）
   未設定の間は ランキングは端末内保存、対戦は同一ブラウザ内のみ。
   手順は README.md を参照。
========================================================= */
const CONFIG = {
  SUPABASE_URL: 'https://hfdxyhntihqvofavrlfy.supabase.co',        // 例: https://xxxx.supabase.co
  SUPABASE_ANON_KEY: 'sb_publishable_OQVYTZA2mq_9yZClJQYjRg_nzLB_ilz',   // Project Settings → API → anon public
  GAME_ID: 'nayamole'
};
const useSupabase = () => !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);

/* ---- サウンド（WebAudio・軽量） ---- */
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
function bindMuteButton(){
  const b = document.getElementById('mute-btn');
  if(b) b.addEventListener('click', e=>{ muted = !muted; e.target.textContent = muted ? '×' : '♪'; });
}
