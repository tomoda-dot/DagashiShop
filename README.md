# 駄菓子屋 ひとつぎ — ショップシステム

レジ・売上管理・在庫管理を GitHub Pages + Supabase で運用するシステムです。

## ファイル構成

```
├── index.html          ランチャー（キオスク画面）
├── regi.html           レジシステム
├── admin.html          売上管理
├── inventory.html      在庫管理
├── supabase-config.js  接続設定（URL / anon key）
└── supabase-adapter.js GAS互換アダプター
```

## セットアップ手順

### 1. Supabase テーブル作成

Supabase ダッシュボード → SQL Editor で `schema.sql` を実行してください。

https://supabase.com/dashboard/project/wkaijkredavfjvfzunte/sql/new

### 2. GitHub リポジトリ作成

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/tomoda-dot/DagashiShop.git
git push -u origin main
```

### 3. GitHub Pages 有効化

リポジトリ → Settings → Pages → Branch: `main` / `/ (root)` → Save

公開URL: `https://tomoda-dot.github.io/DagashiShop/`

### 4. Supabase RLS（Row Level Security）

現在は RLS 無効で運用。有効化する場合は以下を SQL Editor で実行：

```sql
alter table products       enable row level security;
alter table restock        enable row level security;
alter table order_items    enable row level security;
alter table daily_summary  enable row level security;
alter table savings        enable row level security;
alter table settings       enable row level security;
alter table suppliers      enable row level security;
alter table purchase_orders enable row level security;

-- anon ユーザーに全操作を許可（認証なし運用の場合）
create policy "allow all" on products       for all using (true) with check (true);
create policy "allow all" on restock        for all using (true) with check (true);
create policy "allow all" on order_items    for all using (true) with check (true);
create policy "allow all" on daily_summary  for all using (true) with check (true);
create policy "allow all" on savings        for all using (true) with check (true);
create policy "allow all" on settings       for all using (true) with check (true);
create policy "allow all" on suppliers      for all using (true) with check (true);
create policy "allow all" on purchase_orders for all using (true) with check (true);
```

## 後回し機能

- **FAX送信**（秒速FAX）→ Supabase Edge Function で対応予定
- **メール送信** → 同上

## Supabase プロジェクト情報

- URL: `https://wkaijkredavfjvfzunte.supabase.co`
- Region: Northeast Asia (Tokyo)
- Dashboard: https://supabase.com/dashboard/project/wkaijkredavfjvfzunte
