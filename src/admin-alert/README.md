# Admin Alert

Discord Webhook にエラー通知を転送する Cloudflare Worker です。

## 目的

- 各サービス (Web/API/LINE/Batch) からエラー情報を一元収集する
- 受信した JSON を簡易検証し、Discord Webhook へ投稿する

## 構成

- エントリポイント: src/index.ts
- Wrangler 設定: wrangler.jsonc
- 型設定: tsconfig.json

## 環境変数

必須:

- DISCORD_WEBHOOK_URL

## 実行

```bash
npm install
npm run dev
```

## デプロイ

```bash
npm run deploy
```

## API

- GET /: health check
- POST /: エラーレポートを受信して Discord に転送
- OPTIONS /: CORS preflight
