# System Role JWT CLI

systemロール用のアクセストークン（JWT）を対話形式で発行するCLIです。

## セットアップ

```bash
cd bin/system-role-jwt
npm install
```

## 実行

```bash
npm run generate
```

## 入力項目

- `name`: systemアクター名
- `issuer`: 発行者（デフォルト: `api-hmbt.ast24.dev`）
- `audience`: 受信者（デフォルト: `hmbt.ast24.dev`、カンマ区切りで複数指定可）
- `expiration`: 有効期間
	- サフィックスなし: 秒として解釈（従来どおり）
	- サフィックスあり: `s`, `m`, `h`, `d`, `w`, `M`, `y`
	- 例: `900`, `15m`, `2h`, `1d`, `3w`, `1M`, `1y`
- `additional claims JSON`: 追加クレーム（任意、JSONオブジェクトのみ）
- 秘密鍵入力元: `JWT_PRIVATE_KEY` 環境変数を使うか、貼り付け入力するか

## 有効期間サフィックス

- `s`: 秒
- `m`: 分
- `h`: 時間
- `d`: 日
- `w`: 週（7日）
- `M`: 月（30日換算）
- `y`: 年（365日換算）

## 複数行秘密鍵の入力

貼り付け入力を選んだ場合は、PKCS#8 PEM形式の秘密鍵を貼り付け、最後に次の1行を入力して終了します。

```text
EOF
```

例:

```text
-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----
EOF
```

`JWT_PRIVATE_KEY` 環境変数を使うこともできます（`\\n` エスケープ改行に対応）。
