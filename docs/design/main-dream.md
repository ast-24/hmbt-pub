# はちまきBOT v5 理想仕様書

## 機能リスト

コア機能: 時間割

- 管理
  - クラスごとの時間割登録(※X曜日N時限目は科目A 方式)
  - ユーザごとの選択科目登録
    - まだ3年生でないためどう割り当てられるかは不明だが、少なくとも"X曜日N時限目は科目A"という方式ならきっと可能
  - 科目ごとの担当教員/教室登録
  - 月別行事予定表の登録(※Y月Z日M時限目 は 時間割のX曜日N時限目 方式)
    - 固定時間割を使用して実際の時間割に解決する
    - PDFのパーサーとして実装、ロード後はプレビューで手動修正可能に
  - 授業メモの登録(小テスト予定等) ※設定次第で同じ授業を持つ全ユーザにも反映
  - 提出物の登録
    - 提出期限が近づいたら通知
  - 昼食必要かも登録できるように？
  - カフェテリアのメニュー共有(欲を言うならOCRしたいが利用料的に厳しければ手動登録なり配信も写真にするなり)
- 表示
  - WebAPP
    - 時間割表示
      - 今日/明日/週表示
      - 担当教員/教室表示
      - メイン画面のコンポーネント構成や表示項目は設定可能に
    - SPAで実装
      - SSGはキャッシュ噛ませて高速化
    - 毎日特定の時刻(最大2回)に予定を通知
      - WebPush通知使用
      - ブラウザが起動していなくても通知可能
      - 通知のON/OFFはユーザごとに設定可能
    - レスポンシヴデザイン対応
      - スマホ/PC
  - LINE Bot (MessagingAPI)
    - 有料アプリケーションではないためアクティヴ配信は行わない
      - ※API使用料が相当高額になるため
      - リッチメニューの操作でリアクティブ配信
  - GoogleCalendar
    - GoogleCalendarAPI使用 or iCalのURL購読
    - 短縮時程等の特殊時間割の場合は授業開始/終了時間をどうする？(順番だけなら判定可能なんだが)
    - 非通常時間割のみ登録を可能に
      - 1日丸ごとor異常コマだけ
  - API
  - モバイルネイティヴAPP？
    - IOSは開発者登録料が高すぎるため論外
    - AndroidはGooglePlay配信料がかかるため微妙だが現実的な金額ではある
      - 実際他のアプリケーションを作っているしこれからも作ると考えたら登録しとくのはあり
      - PWAで妥協するのもあり(ウィジェットは使えないが)
      - もしくは同級生として信頼してもらってAPK配布もあり
    - ホーム画面のウィジェットで時間割表示
  - WearOSネイティヴAPP？
    - スマートウォッチで時間割確認できたら便利そう
    - 既にアプリ作ったことあるし、ちょっとしたUI作ってAPI叩くだけならいけそう
    - こっちもモバイルネイティヴAPPと同じ登録料の問題があるがニッチすぎるためAPKでいいかも
- アクセス制御
  - ユーザアカウント
    - メルアド認証？
      - 学校Google垢がOIDC認証できるか次第
      - おそらく既定アプリ以外はブロックされるが実際に申請通したうえで確認しないとわからない
    - LINE認証
      - LINEBot連携のため
    - GoogleOAuth認可
      - 学校垢の"認証"に使えるかは不明だが、GoogleCalendar連携に使用(GoogleCalendarAPIを使う場合は)
    - 生徒アカウントだけでなく保護者アカウントも？予定の共有とか(特に昼食が必要かどうか)
    - 非公式サービスなので教員アカウントは無し
  - ユーザAPIキー発行
    - 自分自身含め自作のなにかからアクセスしたい場合に使用
  - システムAPIキー発行
    - LINEBotエンドポイント等に使用
  - 基本はSessionID+JWTトークンでいくがLINEbotはURLしか設定できないため固定キーが必要
    - もしくはLINEBotからのリクエストは別の関数噛ませてサブリクエストでAPIにアクセスさせて情報集める方式もあり
    - ただもしNext.jsで実装する場合、APIデプロイ先はPages(バックエンドはWorkers)になり、LINEBotからリクエストを受ける場合もWorkersになるためどっちもWorkersになり少し複雑？
    - それとAPIをHTTP経由で再帰的に呼ぶよりLINEWerbhookが着弾した関数がその場で処理するほうが効率は良い
    - SessionID+AccessJWT → リモートログアウト可能だが中央集権 ←→ RefleshJWT+AccessJWT → 完全分散型でリモートログアウト不可能
      - リモートログアウトが必要なほどのセキュリティが必要なサービスではないため、RefleshJWT+AccessJWTで完全分散型にしてもいいかも
      - そうすればDBへの書き込み回数も減らせるから別のDBを用意する必要も少なくなるかも
      - 最悪、もしも本当になにかヤバいことが起きたとしても署名鍵のローテーションという最終手段もあるし

### 旧バージョンからの変更(概要)

- UIを LINEbot only → WebUI + LINEbot + GoogleCalendar + (モバイルネイティヴAPP)
- 予定表管理以外の機能を削減
  - セキュリティ的にあまり良くないので 学校メルアド=実名 マッピングは削除
  - 次の電車(普通に他のアプリでできる)
- 3年生用に選択科目対応

## アーキテクチャ

技術的に作ってて面白いのは本格クラウド(AWS/TiDB)を使う構成2でありコスト的にも無料枠内に収まる可能性が高いが、
開発の手軽さを考えるなら構成1のCloudflareメインのサーバレスモダン構成が良い。

構成2はAWS使えて面白いものの、学内向けであり、かつ文化祭向けのようなスパイクが無いサービスであるためオーバーエンジニアリング感が否めない。

構成0からの差分が少ないのは構成2だが、ほぼ全てが入れ替わる異常、構成1だろうが2だろうが50歩100歩。

### 構成0: 現在=v4構成

Node.js: API
AWS Lambda: Node.jsデプロイ先
AWS DynamoDB: データベース
AWS CloudFront: CDN
AWS CloudFront Functions: API認証 & Lambda関数URL向け署名
MessagingAPI: LINEBot

※ WebUI,GoogleCalendar連携, WebPush通知,NativeAPP等は実装無し

### 構成1

Cloudflareベースのサーバレスモダン構成

Next.js: WebUI + API ※SSGに近いSSR+API混成

Cloudflare: CDN + サーバレス基盤(下記)
Cloudflare Pages: Next.jsデプロイ先
Cloudflare Workers: API(Pagesバックエンド)
Cloudflare KV/D1: データベース

MessagingAPI: LINEBot
GoogleCalendarAPI: GoogleCalendar連携
Firebase CloudMessaging: WebPush通知

※ Cloudflare WorkersKV は基本的に読み取り専用で書き込みが遅いため、D1を併用するか、AWS DynamoDB / TiDB Serverless 等も検討
なおD1はR:5000k行/日, W:100k行/日まで無料枠があるため、KVに近いピンポイントで読み込むこの用途ならN+1でも起こさない限りは十分に賄える可能性が高い

### 構成2

AWSベースの少し堅牢な構成 ※この場合でも部分的にCloudflareを使用
ここまでやるのであれば複数クラウドやMultiRegionによる冗長化もやってみたいが、そこまでいくと流石に確実にオーバーエンジニアリング

Next.js: WebUI ※SSG

Cloudflare: CDN
Cloudflare Pages: Next.jsデプロイ先
AWS Lambda: API
AWS DynamoDB: データベース
TiDB Serverless: データベース(AWS RDSと違い無料枠があるため)

MessagingAPI: LINEBot
GoogleCalendarAPI: GoogleCalendar連携
Firebase CloudMessaging: WebPush通知
