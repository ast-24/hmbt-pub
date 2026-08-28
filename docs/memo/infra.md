# インフラ関連

- Cloudflare DNS
- Cloudflare Pages
- Cloudflare Workers (API Body Hash)
- Cloudflare Workers (LINE Webhook)
- Cloudflare R2 (カフェメニュー用)
- Cloudflare R2 (iCal用)
- Cloudfront
- Cloudfront Functions
- Lambda (API)
- Lambda (ICal更新バッチ)
- TiDB Serverless
- Google OIDC
- LINE OIDC
- ZohoMailAPI

## API

Client
↓
Cloudflare DNS
↓
Cloudflare Proxy
→ Cloudflare リクエストヘッダ変換ルール
  (Cloudfront用シークレットトークンをヘッダに付与)
  (`secrets.md/cf2cf-guard-key`を付与)
  ↓
  Cloudflare Workers : `/src/2lambda-hasher`
  (ボディのハッシュ値を計算しヘッダに設定)
  ←
↓
Cloudfront
→ 代替ドメイン with ACM
  (これがないとhost不一致で弾かれる)
  ↓
  Cloudfront Functions : `/src/api-cf2cf-guard`
  (ヘッダ検証でCloudflare経由であることを確認)
  (`secrets.md/cf2cf-guard-key`と照合)
  → Cloudfront KVS
    (シークレットトークンを保存)
  ↓
  OAC
  (IAM署名してLambdaがCloudfront経由でしか呼べないように)
  ←
↓
Lambda : `/src/api`
→ TiDB Serverless
→ Google OIDC
→ LINE OIDC
→ ZohoMailAPI
  (所有確認メール用)
↓
Cloudflare Proxy
→ Cloudflare レスポンスヘッダ変換ルール
  (内部ドメイン同士の自動CORS処理)
  ←
↓
Client

## Web

Client
↓
Cloudflare DNS
↓
Cloudflare Proxy
→ Cloudflare Pages
  (Next.jsによるSPAホスティング)
  ←
↓
Client

※ icalやカフェメニューでR2、icalでsqsとバッチlambda、定期クリーンアップlambdaなども後で追加
