# はちまきBOT v5 (公開用リポジトリ)

> **はちまきBOT**  
> 学校の時間割・行事予定を中核とした情報管理ツール型 Web アプリケーション。  
> LINE Bot・iCal カレンダー連携・Web アプリを備えたフルスタック構成。

※ はちまきBOTはOSSではないため公開前提で開発しておらず、  
オリジナルリポジトリの履歴には機密情報が混入している可能性があるため、  
コード公開にあたり、まっさらな公開用リポジトリを作成しました。

---

## 🗒️ 開発について

本プロジェクトにおいて、人間は「設計ドキュメントの作成」と「コードレビュー・修正」を行い、  
物理的なコードの記述は AI に任せるという開発フローを採用しています。

---

## 📐 アーキテクチャ概要

アーキテクチャ図：
![`アーキテクチャ図`](./docs/assets/infra.png)

詳細なインフラ構成は [`docs/memo/infra.md`](./docs/memo/infra.md) を参照。

---

## 📁 プロジェクト構造

```
/
├── docs/               # 手書きドキュメント類
│   ├── design/         # 仕様書・設計書
│   ├── memo/           # インフラ・外部サービスのメモ
│   └── envs/           # 環境変数テンプレート(ほとんどは=secret)
│
├── src/                # ソースコード
│   ├── lib/            # 共通ライブラリ (@ast24/hmbt-v5-lib)
│   ├── web/            # フロントエンド (Next.js)
│   ├── api/            # バックエンド API (Lambda / Hono)
│   ├── line-bot/       # LINE Bot (Cloudflare Workers)
│   ├── admin-alert/    # エラー通知 Worker (Cloudflare Workers)
│   ├── api-body-hasher/        # ボディハッシュ計算 Worker (CF)
│   ├── api-cf2cf-guard/        # Cloudflare→CloudFront 正規性検証
│   ├── database/               # DB マイグレーション SQL
│   ├── ical-find-old-batch/    # iCal 再生成対象抽出 Lambda
│   ├── ical-gen-batch/         # iCal 実生成 Lambda
│   ├── monthly-schedule-update-batch/  # 月間予定表更新 Lambda
│   └── dlq-alert-batch/        # SQS DLQ 監視 Lambda
│
└── bin/                # 運用スクリプト群
    ├── line-richmenu/          # LINE リッチメニュー設定
    ├── skd-pdf-perser/         # 行事予定 PDF パーサー
    ├── train-timetable-scraper/# 電車時刻スクレイパー
    ├── system-role-jwt/        # システムロール JWT 発行
    ├── migrate-next-train-widget/  # 電車ウィジェット追加マイグレーション
    └── v4-line-users-ddb-to-tidb/  # v4→v5 データ移行
```

※ /old-v4/ は旧バージョン (v4) のコードを実装時に参照するためのディレクトリ  
なおv4以前は、システム名: i5system / BOT名: はちまきBOT だったが、  
v5からはシステム名・BOT名ともに「はちまきBOT」に統一。

---

## 🔧 主な技術スタック

| カテゴリ           | 技術                                      |
| ------------------ | ----------------------------------------- |
| 言語               | TypeScript (全体共通)                     |
| フロントエンド     | Next.js (App Router / SPA) + Tailwind CSS |
| バックエンド API   | Hono on AWS Lambda                        |
| エッジ Workers     | Cloudflare Workers                        |
| データベース       | TiDB Serverless (MySQL 互換)              |
| ファイルストレージ | Cloudflare R2                             |
| CDN                | CloudFront + Cloudflare                   |
| メッセージキュー   | AWS SQS                                   |
| 認証               | Google OIDC / LINE OIDC / メール OTP      |
| メール送信         | Zoho Mail API                             |
| 外部連携           | LINE Messaging API / iCal                 |

---

## 📄 設計ドキュメント

| ドキュメント                                                     | 内容                                 |
| ---------------------------------------------------------------- | ------------------------------------ |
| [`docs/design/main.md`](./docs/design/main.md)                   | システム概要・技術スタック・用語定義 |
| [`docs/design/main-dream.md`](./docs/design/main-dream.md)       | 理想仕様・アーキテクチャ検討メモ     |
| [`docs/design/api.md`](./docs/design/api.md)                     | API エンドポイント定義               |
| [`docs/design/database.md`](./docs/design/database.md)           | DB テーブル設計                      |
| [`docs/design/line.md`](./docs/design/line.md)                   | LINE Bot 設計                        |
| [`docs/design/ical.md`](./docs/design/ical.md)                   | iCal 連携設計                        |
| [`docs/design/ext-traintime.md`](./docs/design/ext-traintime.md) | 電車時刻機能拡張設計                 |
| [`docs/memo/infra.md`](./docs/memo/infra.md)                     | インフラ構成メモ                     |
| [`docs/memo/zohomail.md`](./docs/memo/zohomail.md)               | Zoho Mail API セットアップメモ       |

---

## 📦 コンポーネント別 README

各サブパッケージの詳細は以下の README を参照してください。  
(主にAIが詰めた細かい部分の仕様などを記載するために生成させた文書です)

| コンポーネント                      | 説明                                     | README                                                                                    |
| ----------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/lib`                           | 全サービス共通の型定義・ドメインロジック | _(なし: 設計書参照)_                                                                      |
| `src/web`                           | Next.js SPA (ホーム・設定・ログイン等)   | [src/web/README](./src/web/README.md)                                                     |
| `src/api`                           | REST API Lambda (認証・時間割・iCal等)   | _(なし: 設計書参照)_                                                                      |
| `src/line-bot`                      | LINE Webhook Worker                      | [src/line-bot/README](./src/line-bot/README.md)                                           |
| `src/admin-alert`                   | Discord エラー通知 Worker                | [src/admin-alert/README](./src/admin-alert/README.md)                                     |
| `src/ical-find-old-batch`           | iCal 再生成対象抽出 Lambda               | [src/ical-find-old-batch/README](./src/ical-find-old-batch/README.md)                     |
| `src/ical-gen-batch`                | iCal ファイル実生成 Lambda               | [src/ical-gen-batch/README](./src/ical-gen-batch/README.md)                               |
| `src/monthly-schedule-update-batch` | 月間予定表非同期更新 Lambda              | [src/monthly-schedule-update-batch/README](./src/monthly-schedule-update-batch/README.md) |
| `src/dlq-alert-batch`               | SQS DLQ 監視・通知 Lambda                | [src/dlq-alert-batch/README](./src/dlq-alert-batch/README.md)                             |

---

## 🗄️ 共通ライブラリ (`src/lib`)

`@ast24/hmbt-v5-lib` として各サービスから参照されるローカルパッケージです。

```
src/lib/src/
├── models/     # ドメインモデル型定義 (User, Schedule, iCal等)
├── knowledge/  # ドメイン知識のハードコード (科目・教室・電車時刻表・祝日等)
├── logic/      # 共通ビジネスロジック (月間予定構築・iCal生成・JWT等)
├── api/        # API エンドポイント定義 (パス・DTO の共通仕様)
├── dto/        # リクエスト/レスポンス DTO
├── database/   # DB 操作ユーティリティ
└── cmn/        # 共通ユーティリティ
```

フロントエンド・バックエンド・LINE Bot がすべて同じ型定義を参照することで、型の不一致を防いでいます。\
ドメイン部分の知識・条件判定の共有もここで行っています。

---

## 🌐 主な機能

### 時間割管理

- クラス共通時間割・個人選択科目の登録
- 月別行事予定表の登録（PDF パーサーによる取り込み対応）
- 固定時間割と行事予定表を組み合わせた「完全個人予定表」の自動生成

### Web アプリ (`src/web`)

- ホーム画面のカスタマイズ可能ウィジェット構成（時間割・カフェメニュー・次の電車など）
- 設定画面（個人時間割・クラス時間割・iCal 発行・認証連携など）
- Google / LINE / メール OTP によるログイン

### LINE Bot (`src/line-bot`)

- リッチメニューから週間予定・カフェメニューを取得
- 未設定ユーザへの Web 版誘導

### iCal カレンダー連携

- 個人予定・学年予定の iCal ファイル発行
- 夜間バッチによる自動再生成（`ical-find-old-batch` → SQS → `ical-gen-batch`）

### セキュリティ

- Cloudflare → CloudFront 間の正規性検証（`api-body-hasher` + `api-cf2cf-guard`）
- AWS OAC による Lambda への直接アクセス遮断
- Discord へのエラー通知（`admin-alert`）

---

## 🔄 旧バージョンとの違い

`old-v4/` に旧バージョン (v4) のコードが残っています。  
v5 での主な変更点：

- **UI**: LINE Bot のみ → **Web アプリ + LINE Bot + iCal カレンダー連携**
- **バックエンド**: DynamoDB のみ → **TiDB Serverless (MySQL 互換 RDB)**
- **認証**: なし → **Google OIDC / LINE OIDC / メール OTP**
- **時間割**: クラス共通のみ → **個人選択科目対応 (3年生以降)**
- **その他**: 電車時刻・カフェメニュー機能の追加

---

## ⚙️ 開発メモ

環境変数の一覧・テンプレートは [`docs/envs/`](./docs/envs/) に格納されています（シークレット値は除く）。  
DB の初期化 SQL は [`src/database/main/bootstrap.sql`](./src/database/main/bootstrap.sql) です。  
CI/CDの整備は行っていないため、デプロイは手動(スクリプトで生成したzipをコンソールからアップロード)で行っています。
