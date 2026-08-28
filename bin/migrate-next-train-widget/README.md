## migrate-next-train-widget

既存ユーザの `users_ui_settings.settings` に、ホームウィジェット `next_train` を先頭追加するマイグレーション用CLIです。

### 実行

```bash
cd bin/migrate-next-train-widget
npm install

# まず dry-run (既定) で件数確認
npm run migrate -- --dry-run

# 問題なければ適用
npm run migrate -- --apply
```

### 必要な環境変数

- `DATABASE_URL` もしくは `DATABASE_HOST` / `DATABASE_USER` / `DATABASE_PASSWORD` / `DATABASE_NAME` / `DATABASE_PORT`

