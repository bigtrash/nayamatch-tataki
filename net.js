/* =========================================================
   対戦用 通信層
   ---------------------------------------------------------
   createNet(roomCode) → { join, send, leave, mode }
   ・Supabase Realtime（broadcast + presence）…… 別端末同士
   ・BroadcastChannel …… 同一ブラウザ内のタブ同士（検証・デモ用）
   URL に ?local=1 を付けるか、CONFIG 未設定なら BroadcastChannel。
   メッセージは 50ms ごとにまとめて送る（Realtime の送信数対策）。
========================================================= */
const NET_PARAMS = new URLSearchParams(location.search);
const NET_FORCE_LOCAL = NET_PARAMS.get('local') === '1';
const SUPABASE_JS_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';

function netId(){ return Math.random().toString(36).slice(2,10); }
function roomChannelName(code){ return 'nayamole-vs-' + code; }

function loadScriptOnce(src){
  return new Promise((res, rej)=>{
    if(window.supabase) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = ()=>res(); s.onerror = ()=>rej(new Error('script load failed: '+src));
    document.head.appendChild(s);
  });
}

/* 送信バッファ：短時間の連続送信を 1 通にまとめる */
function makeBatcher(flushFn){
  let buf = [], timer = null;
  return {
    push(msg){
      buf.push(msg);
      if(!timer) timer = setTimeout(()=>{ const b = buf; buf = []; timer = null; flushFn(b); }, 50);
    },
    flushNow(){
      if(timer){ clearTimeout(timer); timer = null; }
      if(buf.length){ const b = buf; buf = []; flushFn(b); }
    }
  };
}

/* ---- 同一ブラウザ内（BroadcastChannel） ---- */
function localNet(code){
  const bc = new BroadcastChannel(roomChannelName(code));
  const members = new Map();
  let me = null, handlers = null;
  const emitPresence = ()=> handlers && handlers.onPresence(Array.from(members.values()));
  const batcher = makeBatcher(b => bc.postMessage({ kind:'batch', from: me.id, list: b }));
  bc.onmessage = ev => {
    const d = ev.data || {};
    if(d.kind === 'hello'){
      const known = members.has(d.member.id);
      members.set(d.member.id, d.member);
      if(!known) bc.postMessage({ kind:'hello', member: me, reply:true });
      emitPresence();
    } else if(d.kind === 'bye'){
      members.delete(d.id); emitPresence();
    } else if(d.kind === 'batch'){
      if(d.from === me.id) return;
      d.list.forEach(m => handlers.onMsg(m, d.from));
    }
  };
  return {
    mode: 'local',
    async join(member, h){
      me = member; handlers = h;
      members.set(me.id, me);
      bc.postMessage({ kind:'hello', member: me });
      emitPresence();
      h.onStatus && h.onStatus('connected');
      window.addEventListener('pagehide', ()=> bc.postMessage({ kind:'bye', id: me.id }));
    },
    send(msg){ batcher.push(msg); },
    flush(){ batcher.flushNow(); },
    leave(){ batcher.flushNow(); bc.postMessage({ kind:'bye', id: me && me.id }); bc.close(); }
  };
}

/* ---- Supabase Realtime ---- */
function supabaseNet(code){
  let client = null, ch = null, me = null, handlers = null;
  const batcher = makeBatcher(b => {
    if(ch) ch.send({ type:'broadcast', event:'msg', payload:{ from: me.id, list: b } });
  });
  return {
    mode: 'supabase',
    async join(member, h){
      me = member; handlers = h;
      await loadScriptOnce(SUPABASE_JS_URL);
      client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
        realtime: { params: { eventsPerSecond: 40 } }
      });
      ch = client.channel(roomChannelName(code), {
        config: { broadcast: { self:false, ack:false }, presence: { key: me.id } }
      });
      ch.on('broadcast', { event:'msg' }, ({ payload })=>{
        if(!payload || payload.from === me.id) return;
        (payload.list || []).forEach(m => handlers.onMsg(m, payload.from));
      });
      ch.on('presence', { event:'sync' }, ()=>{
        const st = ch.presenceState();
        const list = [];
        Object.keys(st).forEach(k => { const metas = st[k]; if(metas && metas[0]) list.push(metas[0]); });
        handlers.onPresence(list);
      });
      ch.subscribe(async status => {
        if(status === 'SUBSCRIBED'){
          await ch.track(me);
          h.onStatus && h.onStatus('connected');
        } else if(status === 'CHANNEL_ERROR' || status === 'TIMED_OUT'){
          h.onStatus && h.onStatus('error');
        } else if(status === 'CLOSED'){
          h.onStatus && h.onStatus('closed');
        }
      });
      window.addEventListener('pagehide', ()=>{ try{ ch.untrack(); }catch(e){} });
    },
    send(msg){ batcher.push(msg); },
    flush(){ batcher.flushNow(); },
    leave(){ batcher.flushNow(); try{ ch && client.removeChannel(ch); }catch(e){} }
  };
}

function createNet(code){
  if(NET_FORCE_LOCAL || !useSupabase()) return localNet(code);
  return supabaseNet(code);
}
