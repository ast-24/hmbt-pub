# はちまきBOT v5 仕様書

## 概要

時間割データを中核とする情報管理ツール型アプリケーション

## 技術スタック概要

- 言語: TypeScript Only
  (Rustにしたかったがフロントとバックで同じ定義を使えるTSのメリットに堅牢さだけでは勝てないため)
- フロントエンド: Next.js on Cloudflare Pages (基本的にはSSGのSPA構成で、APIはLambdaに投げる)
- バックエンド: Node.js on Lambda (バッチ処理含め複数関数構成にする可能性あり)
- データベース: DynamoDB + TiDB Serverless (TiDBに時間割データ等のマスターデータを置く)
- その他: LINE Messaging API, Google Calendar API
- インフラ: Cloudflare + AWS + TiDB (Cloudflare Only でも出来ないことはないが全く面白くないし色々問題も)

ICalリクエストはLambdaじゃなくてWorkersに着弾させて、そこからLambdaに問い合わせて結果をWorkersからKVにキャッシュのほうが軽いかも？
とはいえアプリが裏でポーリングしてるだけだからUX的にはそこまで変わらんか。ただしLambdaにポーリングが着弾しまくるのはInvoke回数の無料枠的によくないかも(Workersの10万/日とは桁違い)
どうせ購読時にユーザ認証なんてできないからパスを長めランダムにしてR2に置いとくだけでも変わらんかも？

! カフェメニューOCRでAWS Textract使うのも面白そう(有料だけど)


## 呼称

Subject/教科: 国語、数学、英語等の大分類
Course/科目: 国語総合、数学Ⅰ、英語表現等の小分類。Subjectに属する。
Sess/Session/授業: あるCourseの特定の回 ※繰り返しも含むため特定の1回とは限らない

## プロジェクトディレクトリ構成

適宜追加していく(複数lambda関数、複数DBなど)

```
/
  | -- docs
    | -- design # 仕様書類
  | -- src
     | -- lib # 共通ライブラリ(データモデルの定義等) ※ドメイン知識のハードコードを含む
     | -- web # フロントエンドのNext.js
     | -- api # バックエンドのLambda関数
     | -- api-cff # API前段のCloudflareFunctions用
     | -- batch # バッチ処理のLambda関数
     | -- database # データベース関連のコード
       | -- main # メインのTiDB用SQL
```

## NOTE: 時間判定ロジック


共通予定表の位置が4-5限目のペアじゃない
&&
(
    (
        共通予定表において両方のsessがnormal
        &&
        (TimeTablePosition.dayofweekが同じ && TimeTablePosition.periodが 3→4 か 6→7 のペア)
        ※組み合わせだが順番固定なのでこっちは3つ以上結合し得ないため連続ルールなし
    )
    ||
    (
        共通予定表において両方のsessがspecialで 同じ授業名
        &&
        3つ以上連続結合しない( 3つ以上連続で条件を満たした場合、
            - 1-3が同じで4が違うなら1は別で2&3を結合
            - 1,2-4が同じなら1,2は別で3&4を結合
            - 5-7が同じなら5は別で6&7を結合
        )
    )
)
