# なやまっちたたき 公開版

納屋町商店街の公認モグラ叩きゲーム。静的サイト一式です。

## 構成
- index.html / style.css / game.js …… 本体
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

2. game.js 冒頭の CONFIG に URL と anon キーを記入

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

## メモ
- 効果音は WebAudio 生成（音源ファイルなし）。右上ボタンでミュート。
- 通信に失敗した場合は自動で端末内保存に切り替わります。
