# iCal Generation Batch Lambda

SQS から iCal 再生成ターゲットを受け取り、実際の iCal ファイル生成を行う Lambda です。

## Entry point

- `src/index.ts` (`dist/lambda.zip`)

## Input message body (JSON)

```json
{
  "event_type": "ical_regeneration",
  "kind": "personal",
  "feed_id": 123
}
```

`event_type` は DLQ 監視時の共通識別子です。`kind` は `personal` または `grade`。

## Environment variables

- DB 接続 (`DATABASE_URL` または `DATABASE_HOST` / `DATABASE_USER` / `DATABASE_NAME` など)
- iCal R2 (`ICAL_R2_ENDPOINT`, `ICAL_R2_ACCESS_KEY_ID`, `ICAL_R2_SECRET_ACCESS_KEY`, `ICAL_R2_BUCKET_NAME`)

## Build

```bash
cd src/ical-gen-batch
npm install
npm run build
```
