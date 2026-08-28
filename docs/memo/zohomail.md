# ZohoMailAPIでメール送る方法

地雷原すぎるため再現用にここにメモしておく

とはいえ一応FreeプランでもAPI経由でのメール送信ができることは確認完了

## 1. OAuth用コード

`https://api-console.zoho.jp` の Self Client から Generate Code でコード生成

スコープ: `ZohoMail.messages.ALL`(`ZohoMail.messages.CREATE`)

※ ステップ3のために `ZohoMail.accounts.ALL`(`ZohoMail.accounts.READ`) も必要

## 2. アクセストークンの取得

※ アカウントによりリージョン=ドメインが変わるため注意
   自分のアカウントは、accountsもmailもjpドメインでのみ使える
※ リフレッシュせずともアクセストークンは1時間使える

```shell
curl -X POST "https://accounts.zoho.jp/oauth/v2/token"
    -d "grant_type=authorization_code"
    -d "client_id={self_client_id}"
    -d "client_secret={self_client_secret}"
    -d "redirect_uri=https://www.zoho.com"
    -d "code={generated_code}"
```

## 3. アカウントIDの特定

※ Webコンソールで確認できるものは違う！
※ レスポンスの `zuid` **ではなく `accountId`** を使用すること！
(zuid=WebコンソールのアカウントID、accountId=APIで使用するアカウントID)

ステップ3,4でのドメインは `mail.zoho.jp` を使うこと！
※ ステップ2のレスポンスを信じるな！SLDすら違う！

```shell
curl "https://mail.zoho.jp/api/accounts"
    -X GET
    -H "Accept: application/json"
    -H "Content-Type: application/json"
    -H "Authorization:Zoho-oauthtoken {access_token}"
```

## 4. メールの送信

アカウントIDは `zuid` ではなく `accountId` を使用すること！

urlは `https://mail.zoho.jp/api/accounts/{accountId}/messages` を使う

あとのパラメータやボディはここ読んで頑張れ！
`https://www.zoho.com/mail/help/api/post-send-an-email.html`

## よくあるエラー

- `INVALID_OAUTHTOKEN`
  → トークンのリージョンが違う（.jp / .com）
  → 自分の場合全て.jpにしなければいけない！`*.zoho.jp` を使うこと！

- `アカウントが存在しません`
  → accountIdが間違っている
  → zuidを使っている可能性大だからステップ2でaccountIdを確認すること！

- `Invalid URL` (HTML)
  → APIドメインが間違っている（CRMドメインなど）
  → ステップ2のレスポンスを信じてそのまま使うな！`mail.zoho.jp` を使うこと！

- curl: (6) Could not resolve host
  → 存在しないドメイン（mail.zohoapis.jp など）を指定している
  → ステップ2のレスポンスはサブドメイン変えても無理！`mail.zoho.jp` を使うこと！
