# Monthly Schedule Update Batch Lambda

共通月間予定表の更新ジョブを SQS から受け取り、DBへ反映する専用 Lambda です。

## Entry point

- `src/index.ts` (`dist/lambda.zip`)

## Input message body (JSON)

```json
{
  "event_type": "monthly_schedule_update",
  "year": 2026,
  "month": 4,
  "skd": [null],
  "requested_at_iso": "2026-04-10T12:34:56.789Z"
}
```

`event_type` は DLQ 監視時の共通識別子です。`skd` は API 側で正規化済みデータ（`serializeForJson` 後）です。`requested_at_iso` は stale 判定に使うため必須です。

## Environment variables

- DB 接続 (`DATABASE_URL` または `DATABASE_HOST` / `DATABASE_USER` / `DATABASE_NAME` など)

## Build

```bash
cd src/monthly-schedule-update-batch
npm install
npm run build
```
