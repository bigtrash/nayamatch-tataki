# なやまっちたたき 公開版

納屋町商店街の公認モグラ叩きゲーム。静的サイト一式です。

## 構成
- index.html / style.css / game.js …… ひとり用 本体
- versus.html / versus.css / versus.js …… 2人対戦（プレイヤーのスマホ用）
- watch.html / watch.css / watch.js …… 対戦の観戦画面（大型モニタ用）
- shared.js …… キャラ定義・Supabase 設定・効果音（全ページ共通）
- net.js …… 対戦の通信層（Supabase Realtime／同一ブラウザ内）
- img/ …… キャラクターと穴のコマ（22枚＋タイトル）
- icons/, favicon.png, ogp.png, manifest.webmanifest …… PWA・共有用

## デプロイ
フォルダごと Netlify にドラッグ＆ドロップするだけで動きます。
（なやまっちキャッチ同様、bigtrash.com のサブドメインを割り当ててください）

## ランキングを全員共通にする（Supabase）
未設定のままでも端末内ランキングで動作します。共通化する場合：

1. Supabase の SQL Editor で以下を実行

```sql
create table if not exists public.game_scores (
  id bigint generated always as identity primary key,
  game text not null,
  name text not null,
  score integer not null,
  created_at timestamptz not null default now()
);
create index if not exists game_scores_rank
  on public.game_scores (game, created_at desc, score desc);
alter table public.game_scores enable row level security;
create policy "read scores" on public.game_scores
  for select using (true);
create policy "insert scores" on public.game_scores
  for insert with check (
    game = 'nayamole'
    and char_length(name) between 1 and 10
    and score between 0 and 100000
  );
```

2. shared.js の CONFIG に URL と anon キーを記入

```js
const CONFIG = {
  SUPABASE_URL: 'https://xxxx.supabase.co',
  SUPABASE_ANON_KEY: '（anon public キー）',
  GAME_ID: 'nayamole'
};
```

- 集計はクライアント側で「今週（月曜始まり）」「今月」の範囲を
  created_at で絞り込む方式です。週替わり・月替わりの処理は不要。
- なやまっちキャッチと同じプロジェクトに同居できます。
  既にスコアテーブルがある場合は game カラム（'nayamole'）で
  区別するだけです。insert ポリシーの game 条件はゲームごとに追加してください。

## 2人対戦＋大型モニタ観戦
1. プレイヤーA：スマホで `versus.html` を開き「部屋をつくる」→ 4けたの部屋コードが出る
2. プレイヤーB：別のスマホで `versus.html` を開き、コードを入力して「入る」
3. 観戦：会場のPCで `watch.html` を開いてコードを入力（`watch.html?room=1234` でも可）。
   右上の ⛶ で全画面。複数台で同時に観戦できます
4. ホスト（A）の「対戦スタート」で 3カウント後に同時開始。終了後はホストの「もう一回」で連戦

ルール
- 出現の順番・場所・タイミングは、ホストが配るシードから両者まったく同じものを生成（運の差なし）
- コンボ5のたびに相手の盤面へ商店街の人を1人送り込む（おじゃま）。相手が叩くと −30
- 得点計算・フィーバーはひとり用と同じ。フィーバー中も出現ペースは変わらない（スケジュール共有のため）

通信
- Supabase Realtime の broadcast / presence を使用。テーブルやポリシーの追加は不要
  （CONFIG がひとり用ランキングと共通なので、ランキングを設定済みならそのまま動きます）
- 1部屋あたり毎秒 10〜20 メッセージ程度。無料枠で十分です
- CONFIG 未設定、または URL に `?local=1` を付けた場合は同一ブラウザ内（別タブ同士）で動く
  デモ／確認用モードになります。`?local=1&t=15` で制限時間を短縮できます（ローカル時のみ）

## メモ
- 効果音は WebAudio 生成（音源ファイルなし）。右上ボタンでミュート。
- 通信に失敗した場合は自動で端末内保存に切り替わります。
