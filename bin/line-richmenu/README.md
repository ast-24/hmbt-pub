# LINE Rich Menu Setup

このディレクトリの [setup.sh](bin/line-richmenu/setup.sh) を実行する前に、以下を準備してください。

## 1. 必須環境変数

- `LINE_CHANNEL_ACCESS_TOKEN`
  - LINE Messaging API のチャネルアクセストークン

例:

```bash
export LINE_CHANNEL_ACCESS_TOKEN="<your-channel-access-token>"
```

## 2. 画像ファイル

- ファイル名: `line-richmenu.png`
- 配置場所: このディレクトリ (`bin/line-richmenu/`)
- 画像サイズ: `2500x1686` 推奨
  - スクリプト内のリッチメニューサイズ定義に合わせるため

デフォルトでは `RICHMENU_IMAGE` が未指定の場合、
`bin/line-richmenu/line-richmenu.png` を読み込みます。

### 2-1. 画像レイアウト仕様（座標）

- 座標の原点は画像の左上 (`x=0, y=0`)
- `x` は右方向、`y` は下方向に増加
- キャンバス全体サイズは `2500x1686`

各コンテンツ領域は以下です（`setup.sh` の `areas` と一致）:

| コンテンツ | アクション | x | y | width | height | 中心座標 |
|---|---|---:|---:|---:|---:|---|
| 左上: 個人予定表 | `postback: action=schedule_week` | 0 | 0 | 834 | 843 | (417, 421) |
| 左下: 個人時間割 | `postback: action=personal_timetable` | 0 | 843 | 834 | 843 | (417, 1264) |
| 中央上: 次の電車 | `postback: action=next_train` | 834 | 0 | 833 | 843 | (1250, 421) |
| 中央下: Web版リンク | `uri: WEB_URL` | 834 | 843 | 833 | 843 | (1250, 1264) |
| 右上: メニュー | `postback: action=menu` | 1667 | 0 | 833 | 843 | (2083, 421) |
| 右下: Web版リンク | `uri: WEB_URL` | 1667 | 843 | 833 | 843 | (2083, 1264) |

デザイン時はガイド線を次の位置に置くと作りやすいです:

- 縦ガイド: `x=834`, `x=1667`（3列境界）
- 横ガイド: `y=843`（上下の境界）

補足:

- 比率は `834:833:833`（左列が 1px 広い）
- 文字やアイコンは各領域の端から余白を取って配置すると誤タップが減ります（目安: 40px以上）

## 3. 任意の環境変数

- `RICHMENU_IMAGE`
  - 使用する画像ファイルの絶対パス or 相対パス
- `WEB_URL`
  - 右側タップ領域の遷移先URL（デフォルト: `https://hmbt.ast24.dev/home`）
- `CHAT_BAR_TEXT`
  - リッチメニューのチャットバー表示文字列（デフォルト: `Menu`）
- `LINE_RICHMENU_ALIAS_ID`
  - 指定時は alias を作成/更新
- `CLEANUP_EXISTING_RICHMENUS`
  - `1` (デフォルト): 既存の rich menu / alias を削除してから作成
  - `0`: 既存を残したまま新規作成

例:

```bash
export RICHMENU_IMAGE="./line-richmenu.png"
export WEB_URL="https://hmbt.ast24.dev/home"
export CHAT_BAR_TEXT="メニュー"
export LINE_RICHMENU_ALIAS_ID="hmbt_main"
export CLEANUP_EXISTING_RICHMENUS="1"
```

## 4. 実行

```bash
cd bin/line-richmenu
./setup.sh
```

## 5. 旧v4手順との対応

`CLEANUP_EXISTING_RICHMENUS=1` のとき、旧v4 `gas_rmupdate.rs` の更新手順に合わせて次を実施します。

1. 既存 alias の一覧取得と削除
2. 既存 rich menu の一覧取得と削除
3. 新規 rich menu 作成
4. 画像アップロード
5. （指定時）alias 作成
6. 全ユーザーへ rich menu を適用

## 6. 反映確認とトラブルシュート

- 実行成功時に `defaultRichMenuId=...` が出力されます。`richMenuId` と一致していれば、LINE API上のデフォルト設定は更新済みです。
- 一部ユーザーで反映が遅れる場合は、LINEアプリを再起動して確認してください。
- 個別ユーザーに別 rich menu を明示リンクしている運用では、デフォルト変更だけでは見た目が変わらないことがあります。
