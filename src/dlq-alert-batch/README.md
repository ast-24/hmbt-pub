# DLQ Alert Batch Lambda

SQS Dead Letter Queue を購読し、DLQ送りになったメッセージを admin-alert に通知する Lambda です。

## Entry point

- `src/index.ts` (`dist/lambda.zip`)

## Input event

- SQS イベント (`SQSEvent`)
- メッセージ本文の `event_type` を解析し、`monthly_schedule_update` / `ical_regeneration` / `unknown` として通知します。

## Environment variables

- `ADMIN_MESSENGER_URL` (optional)
  - 未指定時は `knowledge.HOSTNAMES.ADMIN_MESSENGER` の既定URLを使用

## Build

```bash
cd src/dlq-alert-batch
npm install
npm run build
```
