# LINE Bot Worker

Cloudflare Worker (`wrangler init`) で作成したプロジェクトに、LINE Botの処理を実装したものです。

実装はTypeScriptで、`@ast24/hmbt-v5-lib` に依存します。

## 構成

- エントリポイント: `src/index.ts`
- Wrangler設定: `wrangler.jsonc`
- 型設定: `tsconfig.json`

## 依存関係のセットアップ

このプロジェクトはローカルパッケージ `file:../lib` を参照します。

```bash
cd src/line-bot-worker
npm install
```

`@ast24/hmbt-v5-lib` の `dist` が未生成の場合に備えて、型チェック時はlibビルドを先に実行します。

```bash
npm run typecheck
```

## 環境変数

必須:

- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `SYSTEM_ACCESS_TOKEN`（API呼び出し用のsystemロールアクセストークン）

任意:

- `API_CF2CF_GUARD_KEY`（同一ゾーン内APIアクセス時のガードヘッダ値）
- `API_BASE_URL`（デフォルト: `https://api-hmbt.ast24.dev`）
- `WEB_BASE_URL`（デフォルト: `https://hmbt.ast24.dev`）

## 実行

```bash
npm run dev
```

## デプロイ

```bash
npm run deploy
```

## 対応しているLINEアクション

リッチメニュー / postback data:

- `action=schedule_week` -> 週間予定表を返信
- `action=cafe_menu` -> 週間カフェメニューを返信

テキスト入力時のフォールバック:

- `予定` を含む、または `schedule` / `skd`
- `カフェ` を含む、または `cafe` / `menu`

## 欠損リソース時の挙動

ユーザや時間割/予定データが存在しない場合でも、例外で処理全体を落とさず、案内メッセージを返すようにしています。
