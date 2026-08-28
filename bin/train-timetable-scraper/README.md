## train-timetable-scraper

Yahoo! 乗換案内の時刻表HTMLをスクレイピングして、`train_timetables` に投入するSQLを生成します。

### 使い方

```bash
cd bin/train-timetable-scraper
npm install

# url は https://transit.yahoo.co.jp/timetable/<...>/<...> の形式を想定
npm run scrape -- --url "https://transit.yahoo.co.jp/timetable/123/456" --timetable-id jr_tsurumi_line_tsurumi_ono_tsurumi
```

### 出力

- `INSERT ... ON DUPLICATE KEY UPDATE ...` のSQLを stdout に出力します。

### 備考

- `kind=1(平日) / kind=2(土曜) / kind=4(休日)` を取得して `weekday/saturday/holiday` に対応させます。

