# APIエンドポイント定義

- ホーム
  - ユーザUI設定の取得
  - 完全個人予定表の取得(BuildMonSkdは共通libに置いたが鯖とクライアントのどっちが呼ぶ？LINEは鯖でやらなきゃいけないがWebはどっちでもできる。でも問い合わせ回数減らすには鯖がいい)
  - 授業メモの更新(取得は完全個人予定表の中に含める) ※個人/クラス共通の両方
  - カフェメニューの取得
- 設定
  - ユーザ設定の取得/更新
  - ユーザUI設定の取得/更新
  - 個人時間割の取得/更新
  - クラス共通時間割の取得/更新
- 共通月間予定表
  - クラス共通時間割の取得
  - クラス共通時間割の更新(管理者のみ？)
    - PDFアップロードしてLambdaでパース処理して返して編集して完全な状態で登録？クライアントでパース処理して編集して登録？Nextならpdfライブラリ含められるよな？
    - 登録は自由、上書きは管理者の承認式？信用してないんじゃなくてフールプルーフ的に。誤操作で全員分消し飛ばされたら洒落にならないし
- ログイン(※認証EPはここだけでいい(他は目的のAPIを呼び出し、401/403が帰ってきたらログインに飛ばすだけでいい))
  - メールログイン
  - Googleログイン(←OIDCはコールバックとかあるから注意)
  - LINEログイン
- カフェメニュー
  - 登録(ORCして返して修正？画像アップロードだけ？全部手打ち？)
- カレンダー連携
  - ICalURL発行(色々カスタマイズ？例えば1コマづつ登録するのか、丸ごと学校として登録するのか、午前授業の日だけ時間無し予定で登録するのか等)

結論としては変にLambda側で加工して射影にするんじゃなくて、DDD的にドメインモデル≒DBモデルのままCRUDする感じで良さそう
(認証関連とかカレンダー連携関連とかはデータモデルじゃないからそのままCRUDとは行かないが)

個人予定は /users 以下？ /scheduls 以下？
クラス共通予定とかについても
加工をやめてもRESTとしてデータをどこに所属させるかの問題が解決してない…

## 定義

※ パスの第一階層はパスではなくサブドメインに移す！

※ userIdは"me"も許容する

- POST /api/auth/user/legacy/start
- POST /api/auth/user/legacy/register // signupの場合はstartで発行したotpをここに送る
- GET  /api/auth/user/oidc/google/start // URLを構築して飛ばす(state/nonceはjwtでcookieに)
- GET  /api/auth/user/oidc/google/callback // codeで認証してログイン後wwwに飛ばす
- GET  /api/auth/user/oidc/line/start
- GET  /api/auth/user/oidc/line/callback
- DELETE /api/auth/user/logout

- GET  /api/auth/user/me

- GET  /api/auth/user/identities // 使用中の認証方式リスト
- POST /api/auth/user/identities // ペイロードで指定した認証方式の連携解除

- GET  /api/users/{userId}
- PUT  /api/users/{userId}
- GET  /api/users/{userId}/settings // ! やっぱりこれは webui を内包しない
- PUT  /api/users/{userId}/settings
- GET  /api/users/{userId}/settings/webui // ※UI設定部分のみを即座に返すEP
- PUT  /api/users/{userId}/settings/webui
- GET  /api/users/{userId}/timetable
- PUT  /api/users/{userId}/timetable

- GET  /api/users/{userId}/schedules/{year}/{month}/{day}?length={何日分取得するか} // ※完全個人予定表は射影なのでGETのみ
- PUT  /api/users/{userId}/schedules/{year}/{month}/{day}/{period}/memo/personal
- PUT  /api/users/{userId}/schedules/{year}/{month}/{day}/{period}/memo/shared

- POST /api/users/{userId}/ical/publish

- GET  /api/homeClasses/{homeClassNum}/timetable
- PUT  /api/homeClasses/{homeClassNum}/timetable

- GET  /api/global/schedules/{year}/{month} // こっちの予定表は月単位で管理
- PUT  /api/global/schedules/{year}/{month}

- GET  /api/global/cafemenu/{year}/{month}/{day}?length={何日分取得するか}
- POST /api/global/cafemenu/{year}/{month}/{day}
- POST /api/global/cafemenu-ocr // 画像アップロードしてOCRして返す。結果は上のに突っ込む

- POST /line-webhook?token={LINE設定用JWT}

- GET  /ical/{userId}/{トークン}.ics // トークンはJWT？ランダム？R2ならランダムでいいがLambdaに回すこと一応想定するならJWTにしといていいかも

- GET  /media/cafemenu/{imageId} // カフェメニュー画像の配信EP(R2行き？)
