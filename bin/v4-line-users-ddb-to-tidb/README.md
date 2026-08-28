# v4 LINE user DynamoDB -> TiDB SQL converter

v4 DynamoDB の LINEユーザテーブルから、学内メルアド認証済みユーザだけを抽出し、
TiDB の `verified_as_student_in_v4_oidc_line` へ投入できる INSERT 文を生成するローカル用スクリプトです。

## 前提

- `aws` CLI が利用可能
- `node` が利用可能
- 対象AWSアカウントへ十分な権限でログイン済み

## 生成対象

- 抽出条件:
  - `auth == true`
  - `usrId` が存在
  - `stNum` が指定範囲内（デフォルト 1..238）
- 変換先:
  - `sub = usrId`
  - `linked_email = y15274<stNum3桁>@edu.city.yokohama.jp`（デフォルト）

## 使い方

```bash
cd bin/v4-line-users-ddb-to-tidb
bash ./convert.sh --output ./verified_v4_line.sql
```

直接 Node スクリプトを呼ぶ場合:

```bash
node ./convert.mjs --output ./verified_v4_line.sql
```

標準出力へ直接出す場合:

```bash
bash ./convert.sh
```

テーブル名やメールフォーマットを変更する場合:

```bash
bash ./convert.sh \
  --table i5system_ddb_lineUsrs \
  --region ap-northeast-1 \
  --email-prefix y15274 \
  --email-domain edu.city.yokohama.jp \
  --min-stnum 1 \
  --max-stnum 238
```

## 出力形式

- `BEGIN; ... COMMIT;` を含む SQL
- `INSERT ... ON DUPLICATE KEY UPDATE` 形式
- 0件時はコメントのみを出力
