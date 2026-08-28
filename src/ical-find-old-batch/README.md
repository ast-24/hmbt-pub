# iCal Find Old Batch Lambda

夜間バッチで再生成対象を抽出し、`ical-gen-batch` が購読する SQS へ投入する専用 Lambda です。

このパッケージでは **iCalファイルの実生成は行いません**。

## Entry point

- `src/index.ts` (`dist/lambda.zip`)

## Environment variables

- `ICAL_BATCH_LIMIT` (optional, default: `100`, range: `1..500`)
- `ICAL_BATCH_QUEUE_URL` (required)
- DB 接続 (`DATABASE_URL` または `DATABASE_HOST` / `DATABASE_USER` / `DATABASE_NAME` など)

## Build

```bash
cd src/ical-find-old-batch
npm install
npm run build
```
