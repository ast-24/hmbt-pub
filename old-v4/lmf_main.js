"use strict";

//第零階層 各種設定&汎用関数▽
const envVars = {
  runLim: {                                         //実行制限(無料枠超過防止)
    ctr: process.env.runLim_ctr,//上限：10000000 回
    gbs: process.env.runLim_gbs,//上限： 4000000 GB-秒
  },
  conn: {                                         //システム同士の接続関係
    cfKey: process.env.conn_cfKey,//LambdaのCFのID
    gasUrl: process.env.conn_gasUrl,//gasのurl
    gasKey: process.env.conn_gasKey,//Lambda=>GAS用のキー
    lmfUrl: process.env.conn_lmfUrl,//自身のurl
    usrKey: process.env.conn_usrKey,//カスタム用URLのキー
  },
  lmf: {                                         //Lambda関数名
    main: process.env.lmf_main,//メイン処理用
    reviver: process.env.lmf_reviver,//再起動用
  },
  ddb: {                                         //DynamoDBのテーブル名
    cache: process.env.ddb_cache,//キャッシュ用
    lineUsrs: process.env.ddb_lineUsrs,//LINEユーザーIDベース
    stNums: process.env.ddb_stNums,//出席番号ベース
  },
  disc: {                                         //Discord用Webhook(https://discord.com/api/webhooks/ の後から)
    log: {
      exe: process.env.disc_log_exe,//稼働ログ用Webhook
      run: process.env.disc_log_run,//実行ログ用Webhook
    },
    mail: JSON.parse(process.env.disc_mails),//メールアドレスとwebhookをペアとしたJSON
  },
  lineToken: process.env.lineToken,//LineBotのトークン
  imgurId: process.env.imgurId,//ImgurのID
}

const myLib = {
  /**同期的に待つ
   * @param {Number} ms - 待ちたいミリ秒
   */
  waitSync: async (ms) => {
    new Promise(resolve => setTimeout(resolve, ms));
  },
  /**https操作
   * @param  {string} url      - httpから指定
   * @param  {string} method   - GET/POST/DELETE... (def:GET)
   * @param  {object} header
   * @param  {string} data     - POST内容
   * @param  {string} dataType - (def:JSON)
   * @param  {string} encode   - (def:UTF8)
   * @return {string}
   */
  https: async (url, method = `GET`, header = {}, data = null, dataType = `application/json`, encode = `utf8`) => {
    return new Promise((resolve, reject) => {
      const request = myLib.httpsMod.request(
        {
          protocol: url.split(`/`).slice(0, 1).join(``),
          port: url.split(`/`).slice(0, 1).join(``) === `https:` ? 443 : 80,
          hostname: url.split(`/`).slice(2, 3).join(``),
          path: `/` + url.split(`/`).slice(3,)?.join(`/`),
          method: method,
          headers: { "Content-Type": dataType, ...header },
        },
      );
      request.end(data);
      request.once(`error`, (e) => {
        reject(e);
      });
      request.once(`response`, (res) => {
        encode === `bin` ? null : res.setEncoding(encode);
        let data = encode === `bin` ? [] : "";
        res.on(`data`, (chunk) => {
          encode === `bin` ? data.push(chunk) : data += chunk;
        });
        res.once(`end`, () => {
          if ([0, 1, 2, 3, 4, 5, 6].includes(res.statusCode - 200)) {
            resolve(encode === `bin` ? Buffer.concat(data) : data);
          } else if ([1, 2].includes(res.statusCode - 300)) {
            resolve(myLib.https(res.headers.location, method, header, data, dataType, encode));
          } else {
            reject(new Error(`http:${res.statusCode}(${res.statusMessage})\n${data.slice(0, 1000)}${Array.isArray(data) ? `response is bin data` : data[1000] ? `...(too long)` : ``}`));
          }
        });
      });
    })
  },
  httpsMod: require(`https`),
  /**Discordビルダー*/
  disc: class {
    /**discビルダー
     * @return {this}
     */
    constructor() {
      this.embed = {};
    };
    /**フィールド
     * @param  {string}  name   - フィールドタイトル
     * @param  {string}  val    - フィールドの中身
     * @param  {boolean} inline - フィールドを横並びにするか(true同士は連結)
     * @return {this}
     */
    fields(name, val, inline) {
      this.embed.fields = this.embed.fields || [];
      this.embed.fields.push({
        name: name,
        value: val,
        inline: inline,
      });
      return this;
    };
    /**フッター
     * @param  {string} text - フッターテキスト
     * @param  {string} icon - フッターアイコン(URL)
     * @return {this}
     */
    footer(text, icon) {
      this.embed.footer = {
        text: text,
        icon_url: icon,
      };
      return this;
    };
    /**投稿者
     * @param  {string} name - 投稿者名
     * @param  {string} url  - 投稿者のURL
     * @param  {string} icon - 投稿者アイコンURL
     * @return {this}
     */
    author(name, url, icon) {
      this.embed.author = {
        name: name,
        url: url,
        icon_url: icon,
      };
      return this;
    };
    /**埋め込み
     * @param  {string} title       - 題名
     * @param  {string} url         - 題名のURL
     * @param  {string} description - 本文
     * @param  {string} thumbnail   - 小さい画像
     * @param  {string} image       - 大きい画像
     * @param  {Date}   timestamp   - 投稿時間 (def:現在時刻)
     * @param  {str}    color       - 線の色(conf.colorTable) (def:青)
     * @return {this}
     */
    embeds(title, url, description, thumbnail, image, timestamp, color = 0x0000FF) {
      Object.assign(this.embed, {
        title: title,
        url: url,
        description: description,
        thumbnail: { url: thumbnail },
        image: { url: image },
        timestamp: timestamp || new Date(),
        color: color === `Red` ? 0xFF0000 : color,
      });
      return this;
    };
    /**メッセージ
     * @param  {string} content  - プレーンテキスト
     * @param  {string} username - アカウント名
     * @return {this}
     */
    message(content, username) {
      Object.assign(this, {
        content: content,
        username: username,
      });
      return this;
    };
    /**送信
     * @param  {string}    webhook - https://discord.com/api/webhooks/ の後
     * @return {undefined}
     */
    async send(webhook) {
      this.embeds = Object.keys(this.embed).length ? [this.embed] : undefined;
      delete this.embed;
      await myLib.https(`https://discord.com/api/webhooks/${webhook}`, `POST`, null, JSON.stringify(this));
    };
  },
  /**DynamoDB操作*/
  ddb: {
    mod: require('@aws-sdk/client-dynamodb'),
    /**アイテム追加(上書き可能)
     * @param  {string} tableName - テーブル名|ARN
     * @param  {object} item      - {`パーティションキー名`:`値` (,`キー名2`:`値2`,`キー名3`:`値3`)}
     * @return {this}
     */
    put: async (tableName, item) => await new myLib.ddb.mod.DynamoDBClient().send(new myLib.ddb.mod.PutItemCommand({ TableName: tableName, Item: myLib.ddb.n2dCast(item) })),
    /**アイテム削除
     * @param  {string} tableName - テーブル名|ARN
     * @param  {object} key       - {`パーティションキー名`:`値` (,`ソートキー名`:`値`)}
     * @return {this}
     */
    del: async (tableName, key) => await new myLib.ddb.mod.DynamoDBClient().send(new myLib.ddb.mod.DeleteItemCommand({ TableName: tableName, Key: myLib.ddb.n2dCast(key) })),
    /**アイテム取得
     * @param  {string} tableName - テーブル名|ARN
     * @param  {object} key       - {`パーティションキー名`:`値` (,`ソートキー名`:`値`)}
     * @return {object}
     */
    fetch: async (tableName, key) => myLib.ddb.d2nCast((await new myLib.ddb.mod.DynamoDBClient().send(new myLib.ddb.mod.GetItemCommand({ TableName: tableName, Key: myLib.ddb.n2dCast(key) }))).Item || {}),
    /**アイテム全取得
     * @param  {string} tableName - テーブル名|ARN
     * @return {object}
     */
    scan: async (tableName,) => myLib.ddb.d2nCast((await new myLib.ddb.mod.DynamoDBClient().send(new myLib.ddb.mod.ScanCommand({ TableName: tableName, }))).Items || []),
    /**DynamoDBオブジェクト=>通常オブジェクト
     * @param  {object} tgt - DynamoDBオブジェクト
     * @return {object}
     */
    d2nCast: (tgt = {}) => {
      const cast = (item) => {//型と値のペア
        switch (Object.keys(item)[0]) {
          case `N`: return Number(Object.values(item)[0]);
          case `L`: return (Object.values(item)[0]).reduce((pre, cur, idx) => { pre[idx] = cast(cur); return pre; }, []);
          case `M`: return Object.entries(Object.values(item)[0]).reduce((pre, cur) => { pre[cur[0]] = cast(cur[1]); return pre; }, {});
          case `NULL`: return null;
          default: return (Object.values(item)[0]);//※S(String)やBOOL(Boolean)等はそのままで良い
        }
      }
      return Array.isArray(tgt) ? tgt.map(item => Object.entries(item).reduce((pre, cur) => { pre[cur[0]] = cast(cur[1]); return pre; }, {})) || []
        : Object.entries(tgt).reduce((pre, cur) => { pre[cur[0]] = cast(cur[1]); return pre; }, {}) || {};
    },
    /**通常オブジェクト=>DynamoDBオブジェクト
     * @param  {object} tgt - 通常オブジェクト
     * @return {object}
     */
    n2dCast: (tgt) => {
      const cast = (item) => {//値のみ
        switch (typeof item) {
          case `number`: return { "N": String(item) };
          case `boolean`: return { "BOOL": (item) };
          case `object`: return Array.isArray(item) ? { "L": (item).reduce((pre, cur, idx) => { pre[idx] = cast(cur); return pre; }, []) }
            : item === null ? { "NULL": (true) }
              : { "M": Object.entries(item).reduce((pre, cur) => { pre[cur[0]] = cast(cur[1]); return pre; }, {}) };
          default: return { "S": String(item) };
        }
      }
      return Object.entries(tgt).reduce((pre, cur) => { pre[cur[0]] = cast(cur[1]); return pre; }, {});
    },
    /**キャッシュ取得
     * @param  {string} key - cacheKey
     * @return {any}
     */
    cacheGet: async (key) => (await myLib.ddb.fetch(envVars.ddb.cache, { "cacheKey": key, })).cacheVal,
    /**キャッシュ設定
     * @param {string} key - cacheKey
     * @param {any}    val - cacheVal
     */
    cacheSet: async (key, val) => await myLib.ddb.put(envVars.ddb.cache, { "cacheKey": key, "cacheVal": val }),
  },
  /**GAS呼び出し
   * @param {string} tgt   - 対象の関数
   * @param {string} param - 渡したい情報
   */
  invoke2gas: async (tgt, param) => {
    let res = JSON.parse(await myLib.https(`${envVars.conn.gasUrl}?srcId=lambda&srcKey=${envVars.conn.gasKey}&tgt=${tgt}&param=${param}`));
    switch (res.statusCode) {
      case 200: return res.data;
      case 403: throw Error(`GAS認証失敗`);
      case 500: throw Object.assign(Error(res.error.message), { subName: res.error.subName, subStack: res.error.subStack });
      default: throw Error(`GAS処理失敗(原因不明)`);
    }
  },
  /**動作停止
   * @param {boolean} fullStop - 完全停止(reviverとgasに干渉する)
   */
  funcKill: async (fullStop) => {
    const lamCl = require("@aws-sdk/client-lambda");
    await (new lamCl.LambdaClient()).send(new lamCl.PutFunctionConcurrencyCommand({ FunctionName: envVars.lmf.main, ReservedConcurrentExecutions: 0, }));
    fullStop ? await (new lamCl.LambdaClient()).send(new lamCl.PutFunctionConcurrencyCommand({ FunctionName: envVars.lmf.reviver, ReservedConcurrentExecutions: 0, })) : null;
    fullStop ? await myLib.invoke2gas(`kill`) : null;
  },
};

//Dateプロトタイプ拡張
Object.assign(Date.prototype, {
  dateMethods: [`FullYear`, `Month`, `Date`, `Hours`, `Minutes`, `Seconds`, `Milliseconds`],
  /**7単位別加算
   * @param  {number[]} addAry - 年,月,日,時,分,秒,ミリ秒(0埋め/省略可)
   * @return {Date}
   */
  expAdds: function (addAry) { return addAry.reduce((pre, addVal, idx) => { pre[`set${this.dateMethods[idx]}`](addVal + pre[`get${this.dateMethods[idx]}`]()); return pre }, new Date(this)) },
  /**7単位別設定
   * @param  {number[]} setAry - 年,月,日,時,分,秒,ミリ秒(nullかundefined埋め/省略可)
   * @return {Date}
   */
  expSets: function (setAry) { return setAry.reduce((pre, setVal, idx) => { pre[`set${this.dateMethods[idx]}`](setVal); return pre }, new Date(this)) },
  /**曜日
   * @return {string}
   */
  expDayJP: function () { return `日月火水木金土`[this.getDay()] },
  /**thisをデフォルトにStr→Date
   * @param  {string}  tgt     - 変換対象
   * @param  {string}  fmt     - YYYY→年(4桁)/YY→年(下2桁)/MM→月(数字)/MMM→月(略称)/DD→日/HH→時/mm→分/SS→秒
   * @param  {boolean} secRst  - 秒をリセットするか(def:true)
   * @param  {boolean} msecRst - ミリ秒をリセットするか(def:true)
   * @return {Date}
   */
  expS2D: function (tgt, fmt, secRst = true, msecRst = true) {
    const retDate = new Date(this);
    for (let i = 0; i < fmt.length; i++) {
      switch (fmt[i]) {//NOTE:iへの加算が必要なため三項演算子使用不可
        case `Y`: if (fmt[i + 3] === `Y`) { retDate.setFullYear(Number(tgt.slice(i, i + 4))); i += 3; }
        else { retDate.setFullYear(Number(tgt.slice(i, i + 2))); retDate.expAdds([100]); i += 1; }
          break; case `M`: if (fmt[i + 2] !== `M`) { retDate.setMonth(Number(tgt.slice(i, i + 2)) - 1); i += 1; }
          else { retDate.setMonth(Number([`Jan`, `Feb`, `Mar`, `Apr`, `May`, `Jun`, `Jul`, `Aug`, `Sep`, `Oct`, `Nov`, `Dec`].indexOf(tgt.slice(i, i + 3)))); i += 2; }
          break; case `D`: { retDate.setDate(Number(tgt.slice(i, i + 2))); i += 1; }
          break; case `H`: { retDate.setHours(Number(tgt.slice(i, i + 2))); i += 1; }
          break; case `m`: { retDate.setMinutes(Number(tgt.slice(i, i + 2))); i += 1; }
          break; case `S`: { retDate.setSeconds(Number(tgt.slice(i, i + 2))); i += 1; }
      };
    };
    if (msecRst) { retDate.setMilliseconds(0) };
    if (secRst) { retDate.setSeconds(0) };
    return retDate;
  }
})
//第零階層 各種設定&汎用関数△

/**第一階層 ハンドラー
 * @param {object} event   - 呼び出し情報 https://docs.aws.amazon.com/ja_jp/lambda/latest/dg/urls-invocation.html#urls-payloads
 * @param {object} context - 環境情報　　 https://docs.aws.amazon.com/ja_jp/lambda/latest/dg/nodejs-context.html
 * 
*/
exports.handler = async (event, context) => {
  const bootTime = new Date();
  try {
    if (event.src === `EventBridge`) {
      event.tgt === `daily` ? await exe_daily()
        : event.tgt === `kill` ? await myLib.funcKill(true)
          : null;
    } else if (event.headers?.[`x-kick-by-cf`] === envVars.conn.cfKey) {
      return event.queryStringParameters.srcId === `line` ? await exe_line(JSON.parse(event.body))
        : event.queryStringParameters.srcId === `gas` ? await exe_gas(JSON.parse(event.body))
          : event.queryStringParameters.srcId === `usr` ? await exe_lineCustom(event.requestContext.http.method, event.queryStringParameters.id, event.queryStringParameters.pw, event.body)
            : { statusCode: 403 };
    } else {
      return { statusCode: 403 };
    }
  } catch (e) {
    await new myLib.disc()
      .fields(
        `[LambdaFunction: ${context.functionName}]`,
        `AmazonResourceName: ${context.invokedFunctionArn}`
      )
      .fields(
        `[Name: ${e.subName || e.name}]`,
        `Message: ${e.message}`
      )
      .fields(
        `[Stack]`,
        [...e.subStack?.split(`\n    at `).slice(1) || [], e.subStack ? `[GoogleAppsScript]` : null, ...e.stack?.split(`\n    at `).slice(1) || [], `\> ${context.functionName}`]
          .filter(Boolean)?.map(el => el.replaceAll(`_`, `\\_`)).reverse().reduce((pre, row, idx) => pre += `\n${`=`.repeat(idx)}> ${row}`) || `Unknown`
      )
      .embeds(`実行失敗`, null, null, null, null, null, `Red`)
      .send(envVars.disc.log.exe);
    console.log(e.message)
    console.log([...e.subStack?.split(`\n    at `).slice(1) || [], e.subStack ? `[GoogleAppsScript]` : null, ...e.stack?.split(`\n    at `).slice(1) || [], `> ${context.functionName}`]
      .filter(Boolean)?.map(el => el.replaceAll(`_`, `\\_`)).reverse().reduce((pre, row, idx) => pre += `\n${`=`.repeat(idx)}> ${row}`) || `Unknown`)
    return { statusCode: 500, message: "エラー補足済" };
  } finally {
    try {
      const preRes = await myLib.ddb.cacheGet(`exeLog`);
      preRes.ctr = (preRes.ctr ?? 0) + 1;
      preRes.gbs = (preRes.gbs ?? 0) + context.memoryLimitInMB / 1024 * (new Date().getTime() - bootTime.getTime()) / 1000;
      await myLib.ddb.cacheSet(`exeLog`, preRes);
      if (Number(envVars.runLim.ctr) < preRes.ctr || Number(envVars.runLim.gbs) < preRes.gbs) {
        await new myLib.disc()
          .fields(`requests`, `${preRes.ctr.toLocaleString().padStart(7, ` `)}/10,000,000`)
          .fields(`GB-s`, `${Math.trunc(preRes.gbs).toLocaleString().padStart(7, ` `)}/ 4,000,000`)
          .embeds(`システム停止(稼働制限超過)`, null, null, null, null, null, `Red`)
          .send(envVars.disc.log.run);
        await myLib.funcKill();
      }
    } catch (e) {
      await new myLib.disc()
        .fields(
          `[LambdaFunction: ${context.functionName}]`,
          `AmazonResourceName: ${context.invokedFunctionArn}`
        )
        .fields(
          `[Name: ${e.subName || e.name}]`,
          `Message: ${e.message}`
        )
        .fields(
          `[Stack]`,
          [...e.subStack?.split(`\n    at `).slice(1) || [], e.subStack ? `[GoogleAppsScript]` : null, ...e.stack?.split(`\n    at `).slice(1) || [], `\> ${context.functionName}`]
            .filter(Boolean)?.map(el => el.replaceAll(`_`, `\\_`)).reverse().reduce((pre, row, idx) => pre += `\n${`=`.repeat(idx)}> ${row}`) || `Unknown`
        )
        .embeds(`記録/停止失敗`, null, null, null, null, null, `Red`)
        .send(envVars.disc.log.exe);
    }
  }
}


/*第二階層 LINE分岐*/
const exe_line = async (body) => {
  for (const event of body.events) {
    const loading = async () => await myLib.https(`https://api.line.me/v2/bot/chat/loading/start`, `POST`, { "Authorization": `Bearer ${envVars.lineToken}` }, JSON.stringify({ "chatId": event.source.userId, "loadingSeconds": 60 }));
    let sendBuf = null;
    try {
      let usrData = await myLib.ddb.fetch(envVars.ddb.lineUsrs, { "usrId": event.source.userId });
      usrData = 2 < Object.keys(usrData).length ? usrData : {
        usrId: event.source.userId,
        auth: false,
        antiMailSpam: usrData.antiMailSpam || 0,
        pw: Array(10).fill().reduce(pre => pre += '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 62)], ``),
        stNum: 0,
        cls: 0,
        actionType: null,
        stonePick: null,
        custom: {
          skd_d: { weatherS: true, weatherD: true, event: true, cafe: true, sdRoom: true, anime: true },
          skd_w: { weatherS: true, weatherD: true, event: true, cafe: true, sdRoom: true, anime: true },
          train: ["鶴見線 鶴見小野駅 鶴見方面"]
        }
      };
      switch (event.type) {
        case "message":
          if (event.source.type === `user`) {
            await loading();
            if (usrData.auth) {
              const action = usrData.actionType;
              usrData.actionType = null;
              sendBuf = action && [`text`, `image`].includes(event.message.type) ? await line_indiv[`${action}_do`](usrData, event.message.text || event.message.id) : [{ "type": "text", "text": `そのメッセージは処理できません` }];
            } else {
              sendBuf = event.message.text?.match(/^[0-9０-９]{3}$/u) ? await line_indiv.authSend(usrData, event.message.text)
                : event.message.text?.match(/^([0-9]|[a-z]|[A-Z]){8}$/u)/*　　*/ ? await line_indiv.auth(usrData, event.message.text)
                  : [{ "type": "text", "text": `先に認証が必要です\n認証のために学校のメルアドの下3桁(0埋め)、もしくはそのアドレスに送信したパスワードを入力してください。` }];
            };
          };
          break;
        case "postback":
          if (usrData.auth) {
            if (line_indiv[event.postback.data]) {
              await loading();
              sendBuf = await line_indiv[event.postback.data](usrData, event.postback.params?.date);
            };
          } else {
            sendBuf = [{ "type": "text", "text": `先に認証が必要です\n認証のために学校のメルアドの下3桁(0埋め)、もしくはそのアドレスに送信したパスワードを入力してください。` }];
          };
          break;
        case "follow":
          sendBuf = [{ "type": "text", "text": `こんにちは！　${JSON.parse(await myLib.https(`https://api.line.me/v2/bot/profile/${event.source.userId}`, "GET", { "Authorization": `Bearer ${envVars.lineToken}` })).displayName}さん\n登録ありがとうございます\n\n利用開始の認証のために、学校のメルアドの下3桁を入力してください` }];
          break;
        case "unfollow":
          usrData = { usrId: usrData.usrId, antiMailSpam: usrData.antiMailSpam };
          break;
      };
      await myLib.ddb.put(envVars.ddb.lineUsrs, usrData);
    } catch (e) {
      sendBuf = [{ "type": "text", "text": `申し訳ありません\nサーバーでの処理中にエラーが発生しました\n時間をおいてから再試行してください\n(エラーは管理者に通知済です)` }];
      e.message += `\n[EventJson]\n${JSON.stringify(event)}`
      throw e;
    } finally {
      if (sendBuf) {
        console.log(JSON.stringify(sendBuf))
        await myLib.https(`https://api.line.me/v2/bot/message/reply`, `POST`, { "Authorization": `Bearer ${envVars.lineToken}` }, JSON.stringify({ "messages": sendBuf, "replyToken": event.replyToken }));
      }
    }
  };
  return { statusCode: 200 };
}

/*第三階層 LINE個別処理*/
const line_indiv = {
  /**スケジュール
   * @param  {object}   usrData - DB
   * @param  {string}   data    - YYYY-MM-DD
   * @return {object[]}
   */
  skd: async (usrData, date) => {
    const makeBubble = (dayNum, type) => {
      const procDay = new Date().expAdds([, , dayNum]);
      const procInfo = skdInfo[dayNum];
      const weatherColor = procInfo.weather.weather.includes(`雨`) ? `#4169e1`
        : procInfo.weather.weather.includes(`雪`) ? `#87cefa`
          : procInfo.weather.weather.includes(`くもり`) ? `#708090`
            : procInfo.weather.weather.includes(`晴`) ? `#ff8c00`
              : `#000000`;
      return {
        "type": `bubble`,
        "size": `mega`,
        "direction": `ltr`,
        "header": {
          "type": `box`,
          "layout": `vertical`,
          "paddingAll": `12px`,
          "action": {
            "type": `uri`,
            "uri": `https://www.php.co.jp/fun/today/${String(procDay.getMonth() + 1).padStart(2, `0`)}-${String(procDay.getDate()).padStart(2, `0`)}.php`
          },
          "contents": [{
            "type": `text`,
            "text": `【${procDay.getMonth() + 1}月${procDay.getDate()}日 (${procDay.expDayJP()})】`,
            "weight": `bold`,
            "size": `20px`,
            "align": `center`,
          }],
        },
        "body": {
          "type": `box`,
          "layout": `vertical`,
          "paddingAll": `12px`,
          "contents": [
            !usrData.custom[`skd_${type}`].weatherS ? null : { "type": `text`, "wrap": true, "size": "16px", "weight": "bold", "offsetStart": "0px", "color": `#000000`, "text": `[天気予報]`, "action": { "type": "uri", "uri": `https://tenki.jp/forecast/3/17/4610/14100/` } },
            !usrData.custom[`skd_${type}`].weatherS ? null : { "type": `text`, "wrap": true, "size": "15px", "weight": "regular", "offsetStart": "10px", "color": weatherColor, "text": `${procInfo.weather.weather}` },
            !usrData.custom[`skd_${type}`].weatherD ? null : { "type": `text`, "wrap": true, "size": "15px", "weight": "regular", "offsetStart": "15px", "color": `#000000`, "text": `(降水確率${procInfo.weather.rain}/気温${procInfo.weather.tmpLow}~${procInfo.weather.tmpHigh})` },

            { "type": `text`, "wrap": true, "size": "16px", "weight": "bold", "offsetStart": "0px", "color": `#000000`, "text": `[行事予定]` },
            !usrData.custom[`skd_${type}`].event ? null : { "type": `text`, "wrap": true, "size": "15px", "weight": "regular", "offsetStart": "10px", "color": `#000000`, "text": procInfo.event },

            { "type": `text`, "wrap": true, "size": "16px", "weight": "bold", "offsetStart": "0px", "color": `#000000`, "text": `[時間割 (時程: ${procInfo.tt}) ]` },
            //!usrData.custom[`skd_${type}`].tt ? null : { "type": `text`, "wrap": true, "size": "15px", "weight": "bold", "offsetStart": "10px", "color": `#000000`, "text": `時程：${procInfo.tt}` },
            // { "type": `text`, "wrap": true, "size": "15px", "weight": "bold", "offsetStart": "10px", "color": `#000000`, "text": `提出物：${procInfo.clss[usrData.cls].report}` },
            // ...procInfo.clss[usrData.cls].cls.slice(0, 4).map((el, i) => ({ "type": `text`, "wrap": true, "size": "15px", "weight": "regular", "offsetStart": "10px", "color": `#000000`, "text": `${i + 1}：${el[0]}\n　${el[1]}` })),
            ...procInfo.clss[usrData.cls].cls.slice(0, 4).map((el, i) => ({ "type": `text`, "wrap": true, "size": "15px", "weight": "regular", "offsetStart": "10px", "color": `#000000`, "text": `${i + 1}：${el[0]}` })),
            !usrData.custom[`skd_${type}`].cafe ? null : { "type": `text`, "wrap": true, "size": "15px", "weight": "regular", "offsetStart": "10px", "color": `#000000`, "text": `カフェ：${procInfo.cafe}` },
            ...procInfo.clss[usrData.cls].cls.slice(4, 7).map((el, i) => ({ "type": `text`, "wrap": true, "size": "15px", "weight": "regular", "offsetStart": "10px", "color": `#000000`, "text": `${i + 1 + 4}：${el[0]}` })),
            !usrData.custom[`skd_${type}`].sdRoom ? null : { "type": `text`, "wrap": true, "size": "15px", "weight": "regular", "offsetStart": "10px", "color": `#000000`, "text": `自習室：${procInfo.sdRoom}` },

            //!usrData.custom[`skd_${type}`].anime ? null : { "type": `text`, "wrap": true, "size": "16px", "weight": "bold", "offsetStart": "0px", "color": `#000000`, "text": `[アニメ]` },
            //!usrData.custom[`skd_${type}`].anime ? null : { "type": `text`, "wrap": true, "size": "15px", "weight": "regular", "offsetStart": "10px", "color": `#000000`, "text": procInfo.anime },
          ].filter(Boolean),
        },
        "styles": {
          "header": {
            "backgroundColor": procDay.getDay() === 0 ? `#FFCC99` : procDay.getDay() === 6 ? `#AFEEEE` : `#FFFFFF`,
          },
          "body": {
            "separator": true,
            "separatorColor": `#000000`
          },
        }
      };
    };
    const skdInfo = JSON.parse(await myLib.ddb.cacheGet(`skd`));
    date = (date !== `week` && (new Date(`${date}T00:00`).getTime() - new Date().expSets([, , , 0, 0, 0, 0]).getTime()) / (24 * 60 * 60 * 1000));
    if (date < 0 || 7 < date) {
      return [{ "type": "text", "text": `指定された日付は処理可能な範囲内ではありません` }];
    } else if (usrData.cls) {
      return [{
        "type": `flex`,
        "altText": `予定`,
        "contents": date === false ? { "type": `carousel`, "contents": Array(7).fill().map((_, idx) => makeBubble(idx, `w`)) } //バブルを今日から1週間分表示するよう修正
          : makeBubble(date, `d`)
      }];
    } else {
      usrData.actionType = `clsReg`;
      return [{ "type": "text", "text": `クラスの登録が必要です` }];
    };
  },
  /**スケジュール(週)
   * @param  {object}   usrData - DB
   * @return {object[]}
   */
  skd_w: async (usrData) => {
    return await line_indiv.skd(usrData, `week`);
  },
  /**電車
   * @param  {object}   usrData - DB
   * @return {object[]}
   */
  train: async (usrData) => {
    console.log(JSON.stringify(usrData))
    const info = JSON.parse(await myLib.ddb.cacheGet(`trainTt`));
    const nowM = (new Date().getHours() * 60) + (new Date().getMinutes()) + (30 <= new Date().getMilliseconds());
    const delays = {};
    for (const key in info) {
      if (usrData.custom.train.includes(key)) {
        try {//形式チェックするよりtry/catchで囲んだほうが早い
          delays[key] = (await myLib.https(info[key].delay)).match(/\<dd class\="(?!none)[a-z ]+"\>(.+?)\<\/dd\>/)[1].replace(`<p>`, ``).replace(`</p>`, ``).replace(`</span>`, ``).replace(`<span>`, `\n`);
        } catch (e) {
          delays[key] = `取得失敗\nシートを見直してください`;
        }
      }
    };
    return [{
      "type": `flex`,
      "altText": `電車`,
      "contents": {
        "type": `carousel`, "contents": usrData.custom.train.map(tName => (
          {
            "type": `bubble`,
            "size": `mega`,
            "direction": `ltr`,
            "header": {
              "type": `box`,
              "layout": `vertical`,
              "paddingTop": `10px`,
              "paddingBottom": `10px`,
              "contents": [{
                "type": `text`,
                "text": tName,
                "weight": `bold`,
                "size": `17px`,
                "align": "center",
              }],
            },
            "hero": {
              "type": `box`,
              "layout": `vertical`,
              "paddingAll": `20px`,
              "contents": info[tName]
                ? info[tName].tt.map(hm => (nowM <= hm ? [hm - nowM, Math.trunc(hm / 60), hm % 60] : null)).filter(Boolean).slice(0, 5)
                  .map((el, idx) => ({ "type": `text`, "wrap": true, "size": idx ? "15px" : "20px", "weight": idx ? "regular" : "bold", "color": `#000000`, "text": `${el[0]}分後(${String(el[1]).padStart(2, `0`)}:${String(el[2]).padStart(2, `0`)})` }))
                || [{ "type": `text`, "wrap": true, "size": "15px", "weight": "regular", "color": `#000000`, "text": `指定された時刻表の取得に失敗したか、終電を過ぎています` }]
                : [{ "type": `text`, "wrap": true, "size": "15px", "weight": "regular", "color": `#000000`, "text": `指定された路線は存在しません` }]
            },
            "body": {
              "type": `box`,
              "layout": `vertical`,
              "paddingAll": `15px`,
              "contents": [
                { "type": `text`, "wrap": true, "size": "15px", "weight": "bold", "color": `#000000`, "text": `[遅延情報]` },
                { "type": `text`, "wrap": true, "size": `13px`, "weight": `regular`, "color": delays[tName] === `現在､事故･遅延に関する情報はありません。` ? `#000000` : `#ff0000`, "text": delays[tName] || `情報取得失敗` }
              ],
            },
            "styles": {
              "header": {
                "backgroundColor": `#FFFFFF`,
              },
              "hero": {
                "separator": true,
                "separatorColor": `#000000`
              },
              "body": {
                "separator": true,
                "separatorColor": `#000000`
              },
            }
          }
        ))
      }
    }];
  },
  /**クラス通知
   * @param {object}    usrData - DB
   * @return {object[]}
   */
  clsInfo: async (usrData) => {
    const makeFlex = info => ({
      "type": `flex`,
      "altText": `クラス通知`,
      "contents": {
        "type": `carousel`, "contents": info.map(el => JSON.parse(el)).map(mail =>
        ({
          "type": `bubble`,
          "size": `mega`,
          "direction": `ltr`,
          "header": {
            "type": `box`,
            "layout": `vertical`,
            "paddingTop": `10px`,
            "paddingBottom": `10px`,
            "action": {
              "type": `uri`,
              "uri": `${mail.link}`
            },
            "contents": [{
              "type": `text`,
              "text": `${mail.type}:${mail.title}`,
              "color": `#0000ff`,
              "weight": `bold`,
              "size": `16px`,
              "wrap": true,
            }],
          },
          "body": {
            "type": `box`,
            "layout": `vertical`,
            "paddingAll": `10px`,
            "contents": [{
              "type": `text`,
              "wrap": true,
              "size": "15px",
              "text": mail.text
            }],
          },
          "footer": {
            "type": `box`,
            "layout": `vertical`,
            "paddingAll": `10px`,
            "paddingStart": `20px`,
            "contents": [{
              "type": `text`,
              "wrap": true,
              "size": "13px",
              "text": `${mail.author}先生(${mail.room})\n${mail.time}`,
            }],
          },
          "styles": {
            "body": {
              "separator": true,
              "separatorColor": `#000000`
            },
            "footer": {
              "separator": true,
              "separatorColor": `#000000`
            }
          }
        })
        )
      }
    });
    return [{ "type": "text", "text": `利用者が居ないと判断したため、このサービスは終了しました` }]
    const dbData = await myLib.ddb.fetch(envVars.ddb.stNums, { "stNum": usrData.stNum });
    const res = [
      dbData.clsInfo?.[0] ? makeFlex(dbData.clsInfo.slice(0, 10)) : { "type": "text", "text": `通知はありません` },
      dbData.clsInfo?.[10] ? makeFlex(dbData.clsInfo.slice(10, 20)) : null,
      dbData.clsInfo?.[20] ? { "type": "text", "text": `20を超えた通知は切り捨てられました` } : null,
    ].filter(Boolean);
    if (dbData.clsInfo) {
      dbData.clsInfo.length = 0;
      await myLib.ddb.put(envVars.ddb.stNums, dbData);
    }
    return res;
  },
  /**カフェ画像投稿　ポストバック
   * @param  {object}   usrData - DB
   * @return {object[]}
   */
  cafeImgP: async (usrData) => {
    usrData.actionType = `cafeImgP`;
    return [{ "type": "text", "text": `写真を送信してください\n(キーボードを開いて左の＞を押すと出てきます)` }];
  },
  /**カフェ画像投稿　投稿
   * @param  {object}   usrData - DB
   * @param  {string}   param   - メッセージID
   * @return {object[]}
   */
  cafeImgP_do: async (usrData, param) => {
    //jsonだと何故か400になるためform-data
    let body = `--boundary\r\n`
    body += `Content-Disposition: form-data; name="type"\r\n`
    body += `Content-Type: text/plain\r\n\r\n`
    body += `base64\r\n`
    body += `--boundary\r\n`
    body += `Content-Disposition: form-data; name="title"\r\n`
    body += `Content-Type: text/plain\r\n\r\n`
    body += `CafeMenu\r\n`
    body += `--boundary\r\n`
    body += `Content-Disposition: form-data; name="name"\r\n`
    body += `Content-Type: text/plain\r\n\r\n`
    body += `file\r\n`
    body += `--boundary\r\n`
    body += `Content-Disposition: form-data; name="image"\r\n`
    body += `Content-Type: text/plain\r\n\r\n`
    body += `${(await myLib.https(`https://api-data.line.me/v2/bot/message/${param}/content`, `GET`, { "Authorization": `Bearer ${envVars.lineToken}` }, null, null, `bin`)).toString(`base64`)}\r\n`
    body += `--boundary--\r\n`
    const res = JSON.parse(await myLib.https(`https://api.imgur.com/3/image`, `POST`, { "Authorization": `Client-ID ${envVars.imgurId}`, "Content-Length": Buffer.byteLength(body) }, body, `multipart/form-data; boundary=boundary`)).data;
    console.log(`imgurのdeleteHash=>${res.deletehash}`);//念のためログに残す
    const oldData = await myLib.ddb.cacheGet(`cafeM`);
    if (oldData) {
      await myLib.https(`https://api.imgur.com/3/image/${JSON.parse(oldData).deletehash}`, `DELETE`, { "Authorization": `Client-ID ${envVars.imgurId}` })
    }
    await myLib.ddb.cacheSet(`cafeM`, JSON.stringify({ link: res.link, deletehash: res.deletehash, upDate: `${new Date().getMonth() + 1}/${new Date().getDate()}` }));
    return [{ "type": "text", "text": `写真を登録しました！\n提供ありがとうございます` }];
  },
  /**カフェ画像取得
   * @return {object[]}
   */
  cafeImgG: async () => {
    const info = await myLib.ddb.cacheGet(`cafeM`);
    return [{ "type": "text", "text": info ? `メニュー: ${JSON.parse(info).link}\n(アップロード: ${JSON.parse(info).upDate})` : `カフェのメニューはアップロードされていません` }];
  },
  /**アドレス検索　　ポストバック
   * @param  {object}   usrData - DB
   * @return {object[]}
   */
  addFind: async (usrData) => {
    usrData.actionType = `addFind`;
    return [{ "type": "text", "text": `検索対象の文字列を送信してください` }];
  },
  /**アドレス検索　　検索
   * @param  {object}   usrData - DB
   * @param  {object}   param   - 検索対象
   * @return {object[]}
   */
  addFind_do: async (usrData, param) => {
    const info = JSON.parse(await myLib.ddb.cacheGet(`addLs`));
    param = param.replaceAll(` `, ``).replaceAll(`　`, ``);
    return [{ "type": "text", "text": `【検索結果】\n${info.filter(el => el[1].includes(param)).map(el => `${el[1]}(${el[(new Date().getFullYear()) - 2024 + 2]}組)\n→ ${el[0]}`).join(`\n`) || `該当者無し`}` }];
  },
  /**カスタムリンク発行
   * @param  {object}   usrData - DB
   * @return {object[]}
   */
  customUrl: async (usrData) => {
    return [{ "type": "text", "text": `以下のフォームから設定を変更できます\n${envVars.conn.lmfUrl}?srcId=usr&srcKey=${envVars.conn.usrKey}&id=${usrData.usrId}&pw=${usrData.pw}` }];
  },
  /**編集許可　　　　ポストバック
   * @param  {object}   usrData - DB
   * @return {object[]}
   */
  gssAuth: async (usrData) => {
    usrData.actionType = `gssAuth`;
    return [{ "type": "text", "text": `Googleアカウントのアドレスを入力してください\n学校のでも可能です\n※システム自体には記録されませんが、シートの編集者一覧には表示されます` }];
  },
  /**編集許可　　　　許可
   * @param  {object}   usrData - DB
   * @param  {string}   param   - 対象アドレス
   * @return {object[]}
   */
  gssAuth_do: async (usrData, param) => {
    if (param.match(/^([0-9]|[a-z]|[A-Z]|\.|\+|_|-)+@([0-9]|[a-z]|[A-Z]|\.|-)+\.([a-z]|[A-Z]){2,}$/)) {
      return [{ "type": "text", "text": await myLib.invoke2gas(`gssAuth`, param) }];
    } else {
      usrData.actionType = `gssAuth`;
      return [{ "type": "text", "text": `メールアドレスの形式が違います` }];
    }
  },
  /**石取りゲーム　　ポストバック
   * @param  {object}   usrData - DB
   * @return {object[]}
   */
  stonePick: async (usrData) => {
    usrData.actionType = `stonePick`;
    return [{ "type": "text", "text": `前回の続きからなら「続行」、最初からであれば\n・難易度(E,N,H)\n・石の個数\n・取れる最大の個数\n・先攻/後攻\nをスペース区切りで入力してください\n\nどちらかが最後の1つを取って負けるか、「終了」と入力すると試合終了です。` }];
  },
  /**石取りゲーム　　実行
   * @param  {object}   usrData - DB
   * @param  {string}   param   - 操作
   * @return {object[]}
   */
  stonePick_do: async (usrData, param) => {
    const proc = () => {
      const res = Math.random() < (usrData.stonePick.level === `E` ? 0 : usrData.stonePick.level === `N` ? 0.5 : 1)
        ? (usrData.stonePick.left - 1) % (usrData.stonePick.max + 1) || 1
        : Math.trunc(Math.random() * (usrData.stonePick.max - 1)) + 1;
      usrData.stonePick.left -= res;
      usrData.stonePick.max = usrData.stonePick.left < usrData.stonePick.max ? usrData.stonePick.left : usrData.stonePick.max;
      return res;
    }
    const tpl = () => `\n\n難易度：${usrData.stonePick.level}\n取れる数：1~${usrData.stonePick.max}個\n残り：${usrData.stonePick.left}個`;//procの後に呼び出すこと(変更反映)
    usrData.actionType = `stonePick`;
    let retStr = "";
    param = param.replaceAll(`　`, ` `);
    param = Array.from(param).map(el => el.match(/^[０-９]$/) ? String(`０１２３４５６７８９`.indexOf(el)) : el).join(``);
    if (param === "続行") {
      if (usrData.stonePick) {
        retStr = `先攻はあなたです${tpl()}`;
      } else {
        retStr = `継続中の試合がありません\n新しい試合の条件を指定してください`;
      }
    } else if (param === "終了") {
      usrData.stonePick = null;
      retStr = `対戦ありがとうございました`;
    } else if (usrData.stonePick && param.match(/^[0-9]+$/)) {
      if (Number(param) && Number(param) <= usrData.stonePick.max) {
        usrData.stonePick.left -= Number(param);
        usrData.stonePick.max = usrData.stonePick.left < usrData.stonePick.max ? usrData.stonePick.left : usrData.stonePick.max;
        if (usrData.stonePick.left === 0) {
          usrData.stonePick = null;
          retStr = `私の勝ちです\n対戦ありがとうございました`;
        } else if (usrData.stonePick.left === 1) {
          usrData.stonePick = null;
          retStr = `降参です\n対戦ありがとうございました`;
        } else {
          retStr = `私は${proc()}個取りました${tpl()}`;
        }
      } else {
        retStr = `ルール違反です${tpl()}`
      }
    } else if (param.match(/^[ENH] [0-9]+ [0-9]+ [先後]攻$/u)) {
      usrData.stonePick = {
        level: param.split(` `)[0],
        left: Number(param.split(` `)[1]),
        max: Number(param.split(` `)[2]),
      }
      if (usrData.stonePick.left && usrData.stonePick.max < usrData.stonePick.left) {
        retStr = `${param.split(` `)[3] === "先攻" ? `先攻はあなたです` : `私は${proc()}個取りました`}${tpl()}`;
      } else {
        usrData.stonePick = null;
        retStr = `その条件は使用できません\n指定しなおしてください`
      }
    } else {
      retStr = "指定方法が違います\nやり直してください";
    }
    return [{ "type": "text", "text": retStr }];
  },
  /**クラス登録　　　ポストバック
   * @param  {object} usrData - DB
   * @return {object}
   */
  clsReg: async (usrData) => {
    usrData.actionType = `clsReg`;
    return [{ "type": "text", "text": `クラスを入力してください` }];
  },
  /**クラス登録　　　登録
   * @param  {object} usrData - DB
   * @param  {string} param   - クラス番号かもしれない文字列
   * @return {object}
   */
  clsReg_do: async (usrData, param) => {
    param = param.match(/^[1-6]/)/*　　*/ ? Number(param[0])
      : param.match(/^[１-６]/) ? `０１２３４５６`.indexOf(param[0])
        : null;
    if (param) {
      usrData.cls = param;
      return [{ "type": "text", "text": `クラスの登録が完了しました` }];
    } else {
      usrData.actionType = `clsReg`;
      return [{ "type": "text", "text": `正しいクラスを入力してください。` }];
    }
  },
  /**ユーザー認証用PW送信
   * @param  {object} usrData - DB
   * @param  {string} param   - 認証文字列
   * @return {object}
   */
  authSend: async (usrData, param) => {
    param = Number(Array.from(param).map(el => el.match(/^[0-9]$/) ? el : String(`０１２３４５６７８９`.indexOf(el))).join(``));
    if (5 <= usrData.antiMailSpam) {
      return [{ "type": "text", "text": `一定回数以上の再試行を確認したためロックがかかりました\nこれ以降のメッセージは処理しません` }];
    } else if (1 <= param && param <= 238) {
      usrData.stNum = Number(param);
      usrData.onetimePw = Array(8).fill().reduce(pre => pre += '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 62)], ``);
      await myLib.invoke2gas(`authSend`, `${String(param).padStart(3, `0`)}${usrData.onetimePw}`);
      usrData.antiMailSpam += 1;
      return [{ "type": "text", "text": `次に、メルアド宛に送信した認証用パスワードを入力してください\nアドレスを間違えた場合は再度入力できますが、一定回数以上の再試行を行うとロックがかかります` }];
    } else {
      return [{ "type": "text", "text": `正しいアドレスを入力してください。` }];
    }
  },
  /**ユーザー認証
   * @param  {object} usrData - DB
   * @param  {string} param   - 認証文字列
   * @return {object}
   */
  auth: async (usrData, param) => {
    if (usrData.onetimePw && usrData.onetimePw === param) {
      delete usrData.onetimePw;
      usrData.auth = true;
      usrData.actionType = `clsReg`;
      return [{ "type": "text", "text": `ありがとうございます\n認証完了です！\nあとはクラスを入力すれば準備完了です` }, ...await line_indiv.repRm()];
    } else {
      return [{ "type": "text", "text": `認証に失敗しました\n間違いがないか確認のうえ、再度入力をお願いします` }];
    }
  },
  /**ReadMe
   * @return {object[]}
   */
  repRm: async () => {
    const info = [
      [`時間割`, `"週"は明日から1週間分、"日"は今日から1週間後までの間の1日(選択)の予定を取得します。内容は"カスタム"から設定できます。\n※範囲外の日付は送信しないでください(送信は可能ですが返信できません)`],
      [`クラス通知`, `Classroomからのメールをシステムに自動転送するように設定することで、Classroomの新規投稿(お知らせ等)を取得できます。取得は投稿から最大10分遅延し、通知が20件を超えると古いものから破棄されていきます。`],
      [`クラス通知(続き)`, `[やり方]\n①PCから学校のアカウントでgmailを開く\n②メール転送の設定から転送先アドレスに"antares.fori5system@gmail.com"を追加\n③時々リロードして承認されるのを待つ(10分以内に自動で承認します)\n④承認されたら""no-reply@classroom.google.com""からのメールを"antares.fori5system@gmail.com"に自動転送するよう設定`],
      [`電車`, `"カスタム"で設定した路線の、次の電車と遅延情報を取得できます。\nスプレッドシートの"電車"を編集することで路線を追加できます。`],
      [`カフェ`, `"取得"から今週のカフェのメニューの画像を取得できます。...が、それには毎週誰かが写真を"投稿"からアップロードする必要があります。\n※自動削除はしないので日付をよく確認してください。`],
      [`スプレッドシート`, `このシステムの情報源です。月間予定表が発表されたら、誰かがそれをここに書き写さないと予定が送信できません。また、クラス別シートに小テストの予定などを入力しておけば"予定"に反映されます。`],
      [`スプレッドシート(続き)`, `それ以外の機能等は開けば書いてあります。\n※スプレッドシートにアクセスするためには、"スプレッドシート編集権限"からメルアドを送信してください。`],
      [`アドレス検索`, `名前から学校のメルアドを検索できます。ただし微妙に信憑性が低いです`],
      [`カスタム`, `"予定"と"電車"の送信内容をカスタマイズするためのリンクを取得します。\n※リンクは共有しないでください。`],
      [`石取りゲーム`, `なんとなく作ってみた石取りゲームです。`],
      [`クラス登録`, `年度替わり用。`],
      [`ソースコード`, `興味があれば。\nちなみに言語は全てJSです。`],
    ];
    return [
      { "type": "text", "text": `↓機能一覧↓` },
      {
        "type": `flex`,
        "altText": `ReadMe`,
        "contents": {
          "type": `carousel`, "contents": info.map((el) => ({
            "type": `bubble`,
            "size": `mega`,
            "direction": `ltr`,
            "header": {
              "type": `box`,
              "layout": `vertical`,
              "paddingTop": `10px`,
              "paddingBottom": `10px`,
              "contents": [{
                "type": `text`,
                "text": el[0],
                "weight": `bold`,
                "size": `20px`,
                "align": "center",
              }],
            },
            "body": {
              "type": `box`,
              "layout": `vertical`,
              "paddingAll": `20px`,
              "contents": [{
                "type": `text`,
                "text": el[1],
                "weight": `regular`,
                "size": `15px`,
                "wrap": true
              }],
            },
            "styles": {
              "header": {
              },
              "body": {
                "separator": true,
                "separatorColor": `#000000`
              },
            }
          }))
        }
      },
    ];
  },
}

/**第二階層 LINEカスタム
 * @param {string} method - HTTPmethod
 * @param {string} id - ユーザーid
 * @param {string} pw - ユーザーpw
 * @param {string} body - JSONオブジェクト(POSTの場合)
*/
const exe_lineCustom = async (method, id, pw, body) => {
  const contInvoke = async () => `
  <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <meta charset="utf-8">
      <title>はちまきBot設定画面</title>
      <style type="text/css">
        body {
          display: block;
          position: relative;
          margin: 0%;
          padding: 5vw 5vw 5vw 5vw;
          background: rgb(253, 245, 230);
          div {
            h1 {
              display: block;
              position: relative;
              margin: 0%;
              padding: 0%;
              text-align: center;
              font-size: 8vw;
            }
            /*外枠*/
            .cont {
              display: block;
              position: relative;
              margin: 2% 0% 0% 0%;
              padding: 1% 2% 2% 2%;
              background: rgb(0, 255, 255);
              border-radius: 5vw 5vw 5vw 5vw;
              h2 {
                display: block;
                position: relative;
                margin: 0%;
                padding: 0%;
                text-align: center;
                font-size: 5vw;
              }
              /*内枠*/
              div {
                display: block;
                position: relative;
                margin: 0%;
                padding: 0%;
                background: rgb(253, 245, 230);
                border-radius: 0vw 0vw 5vw 5vw;
                /* 項目 */
                div {
                  display: block;
                  position: relative;
                  margin: 0%;
                  padding: 1% 0% 1% 8%;
                  p {
                    display: block;
                    position: relative;
                    margin: 0%;
                    padding: 0%;
                    text-align: left;
                    font-size: 2.5vw;
                    color: red;
                  }
                  input[type=checkbox] {
                    display: none;
                  }
                  label {
                    display: block;
                    position: relative;
                    margin: 0% 0% 0% 0%;
                    padding: 0% 0% 0% 0%;
                    font-size: 3.5vw;
                  }
                  label::before {
                    position: absolute;
                    margin: 0% 0% 0% 0%;
                    padding: 0% 0% 0% 0%;
                    width: 3.5vw;
                    height: 3.5vw;
                    top: 0.3vw;
                    left: -5.5vw;
                    content: '';
                    background-color: #fff;
                    border-color: rgb(128, 128, 128);
                    border-style: solid;
                    border-width: 0.4vw;
                    border-radius: 50% 50% 50% 50%;
                  }
                  label::after {
                    position: absolute;
                    margin: 0% 0% 0% 0%;
                    padding: 0% 0% 0% 0%;
                    width: 2vw;
                    height: 3.5vw;
                    top: -1.3vw;
                    left: -4.5vw;
                    content: '';
                    border-color: rgb(0, 0, 205);
                    border-style: solid;
                    border-width: 0vw 1vw 1vw 0vw;
                    border-radius: 0%;
                    transform: rotate(45deg);
                    opacity: 0;
                  }
                  input[type=checkbox]:checked+label::before {
                    border-color: #000000;
                  }
                  input[type=checkbox]:checked+label::after {
                    opacity: 1;
                  }
                }
              }
            }
            .submit {
              display: block;
              position: relative;
              margin: 4% 0% 0% 0%;
              padding: 0%;
              text-align: center;
              input[type=button] {
                display: none;
              }
              label {
                display: block;
                position: relative;
                margin: 0%;
                padding: 0%;
                left: 20%;
                width: 60%;
                height: 6vw;
                font-size: 4vw;
                background-color: rgb(0, 255, 255);
                border-style: solid;
                border-width: 0vw;
                border-radius: 5vw 5vw 5vw 5vw;
              }
              p {
                display: block;
                position: relative;
                margin: 0%;
                padding: 2% 0% 0% 0%;
                text-align: center;
                font-size: 3vw;
                color: red;
              }
            }
          }
        }
      </style>
      <script>
        function weatherCheck(parent) {
          if (document.querySelector("#" + parent + "_weatherS").checked) {
            document.querySelector("#" + parent + "_weather_msg").innerHTML = "";
          } else {
            document.querySelector("#" + parent + "_weatherD").checked = false;
            document.querySelector("#" + parent + "_weather_msg").innerHTML = "天気概要を選択している場合のみ選択可";
          }
        }
        function trainCheck() {
          const cbs = Array.from(document.querySelectorAll("#train > div > div")).map(el => el.querySelector("input"));
          const checkNum = cbs.reduce((pre, cur) => pre += cur.checked, 0);
          if (checkNum <= 1) {
            cbs.forEach(el => el.disabled = el.checked ? true : false);
            document.querySelector("#train_msg").innerHTML = "最小選択数は1です";
          } else if (10 <= checkNum) {
            cbs.forEach(el => el.disabled = el.checked ? false : true);
            document.querySelector("#train_msg").innerHTML = "最大選択数は10です";
          } else {
            cbs.forEach(el => el.disabled = false);
            document.querySelector("#train_msg").innerHTML = "";
          }
        }
        function submitFunc() {
          document.querySelector("form.submit #submit").disabled = true;
          document.querySelector("form.submit label").style.backgroundColor = "rgb(95,158,160)";
          Array.from(document.querySelectorAll("#train > div > div")).map(el => el.querySelector("input")).forEach(el => el.disabled = false);

          fetch(window.location.href, {method: "POST",headers: {"Content-Type": "application/json"},body: JSON.stringify({
              "skd_d":Array.from(document.querySelectorAll("form.cont#skd_d > div > div")).reduce((pre,cur)=>({...pre,[cur.querySelector("input").name]:cur.querySelector("input").checked}),{}),
              "skd_w":Array.from(document.querySelectorAll("form.cont#skd_w > div > div")).reduce((pre,cur)=>({...pre,[cur.querySelector("input").name]:cur.querySelector("input").checked}),{}),
              "train":Array.from(document.querySelectorAll("form.cont#train > div > div")).reduce((pre,cur)=>[...pre,cur.querySelector("input").checked ? cur.querySelector("input").id : null],[]).filter(Boolean),
          })})
            .then(res => {
              document.querySelector("div#before").style.display = "none";
              document.querySelector("div#after").style.display  = "block";
            })
            .catch(e => {
              document.querySelector("form.submit #error_msg").innerHTML = "送信に失敗しました  再読み込みしてやり直してください";
            });
        }
      </script>
    </head>
    <body>
      <div id="before" style="display: block;">
        <h1>はちまきBot設定画面</h1>
        <form class="cont" id="skd_d">
          <h2>予定の送信内容（日）</h2>
          <div>
            <div>
              <input type="checkbox" id="d_weatherS" name="weatherS" ${usrInfo.custom.skd_d.weatherS ? `checked` : ``} value="1" onclick="weatherCheck('d')">
              <label for="d_weatherS">天気 概要(天気のみ)</label>
            </div>
            <div>
              <input type="checkbox" id="d_weatherD" name="weatherD" ${usrInfo.custom.skd_d.weatherD ? `checked` : ``} value="1" onclick="weatherCheck('d')">
              <label for="d_weatherD">天気 詳細(降水確率+気温)</label>
              <p id="d_weather_msg"></p>
            </div>
            <div>
              <input type="checkbox" id="d_event"    name="event"    ${usrInfo.custom.skd_d.event ? `checked` : ``} value="1">
              <label for="d_event">行事予定</label>
            </div>
            <div>
              <input type="checkbox" id="d_cafe"     name="cafe"     ${usrInfo.custom.skd_d.cafe ? `checked` : ``} value="1">
              <label for="d_cafe">カフェの営業状況</label>
            </div>
            <div>
              <input type="checkbox" id="d_sdRoom"   name="sdRoom"   ${usrInfo.custom.skd_d.sdRoom ? `checked` : ``} value="1">
              <label for="d_sdRoom">自習室の開放状況</label>
            </div>
            <div>
              <input type="checkbox" id="d_anime"    name="anime"    ${usrInfo.custom.skd_d.anime ? `checked` : ``} value="1">
              <label for="d_anime">アニメ(シートに記入しておく必要あり)</label>
            </div>
          </div>
        </form>
        <form class="cont" id="skd_w">
          <h2>予定の送信内容（週）</h2>
          <div>
            <div>
              <input type="checkbox" id="w_weatherS" name="weatherS" ${usrInfo.custom.skd_w.weatherS ? `checked` : ``} value="1" onclick="weatherCheck('w')">
              <label for="w_weatherS">天気 概要(天気のみ)</label>
            </div>
            <div>
              <input type="checkbox" id="w_weatherD" name="weatherD" ${usrInfo.custom.skd_w.weatherD ? `checked` : ``} value="1" onclick="weatherCheck('w')">
              <label for="w_weatherD">天気 詳細(降水確率+気温)</label>
              <p id="w_weather_msg"></p>
            </div>
            <div>
              <input type="checkbox" id="w_event"    name="event"    ${usrInfo.custom.skd_w.event ? `checked` : ``} value="1">
              <label for="w_event">行事予定</label>
            </div>
            <div>
              <input type="checkbox" id="w_cafe"     name="cafe"     ${usrInfo.custom.skd_w.cafe ? `checked` : ``} value="1">
              <label for="w_cafe">カフェの営業状況</label>
            </div>
            <div>
              <input type="checkbox" id="w_sdRoom"   name="sdRoom"   ${usrInfo.custom.skd_w.sdRoom ? `checked` : ``} value="1">
              <label for="w_sdRoom">自習室の開放状況</label>
            </div>
            <div>
              <input type="checkbox" id="w_anime"    name="anime"    ${usrInfo.custom.skd_w.anime ? `checked` : ``} value="1">
              <label for="w_anime">アニメ(シートに記入しておく必要あり)</label>
            </div>
          </div>
        </form>
        <form class="cont" id="train">
          <h2>電車の送信内容</h2>
            <div>${Object.keys(JSON.parse(await myLib.ddb.cacheGet(`trainTt`))).map((tName, idx, ary) =>
    `<div>
                  ${idx ? `` : `<p id="train_msg"></p>`}
                  <input type="checkbox" id="${tName}" name="train" ${usrInfo.custom.train.includes(tName) ? `checked` : ``} value="1" onclick="trainCheck()">
                  <label for="${tName}">${tName}</label>
                </div>`
  ).join(``)
    }</div>
        </form>
        <form class="submit">
          <input type="button" id="submit" onclick="submitFunc()">
          <label for="submit">変更を適用する</label>
          <p id="error_msg"></p>
        </form>
      </div>
      <div id="after" style="display: none;"><h1 style='padding: 40vh 0vh 0vh 0vh;font-size:12vw'>送信完了</h1>
        <h2 style='font-size:4vw;text-align: center;'>再度設定するには再読み込みしてください</h2>
      </div>
    </body>
  </html>`;
  const confSet = async () => {
    usrInfo.custom = JSON.parse(body);
    await myLib.ddb.put(envVars.ddb.lineUsrs, usrInfo);
  };
  const usrInfo = await myLib.ddb.fetch(envVars.ddb.lineUsrs, { "usrId": id });
  return pw && usrInfo.pw === pw
    ? { statusCode: 200, headers: { "Content-Type": "text/html" }, body: method === `GET` ? await contInvoke() : await confSet() }
    : { statusCode: 403 };
}



/*第二階層 GAS受信*/
const exe_gas = async (postDate) => {
  if (postDate.status === 200) {
    for (let mail of postDate.data) {
      if (mail.type === `cls`) {
        /*
        await myLib.ddb.put(envVars.ddb.stNums,{
          "stNum"  :Number(mail.to),
          "clsInfo":[
            ...((await myLib.ddb.fetch(envVars.ddb.stNums,{"stNum":Number(mail.to)})).clsInfo||[]),
            JSON.stringify(mail.data),
          ].slice(0,21)
        });
        */
      } else if (mail.type === `pvt`) {
        mail = mail.data;
        await new myLib.disc()
          .author(mail.from)
          .embeds(mail.subject, mail.url, mail.body, null, null, mail.date)
          .send(envVars.disc.mail[mail.to?.find?.(add => envVars.disc.mail[add.trim?.()]) || `other`]);
      };
    };
    return { statusCode: 200 };
  } else if (postDate.status === 500) {
    const e = Error(postDate.error.message);
    e.subName = postDate.error.name;
    e.subStack = postDate.error.stack;
    throw e;
  };
}


/*第二階層 日間リセット*/
const exe_daily = async () => {
  const gssData = await myLib.invoke2gas(`daily`);//※GSSの生データ({sheet:ary[][]})

  const wetherRssItem = (await myLib.https(`https://www.data.jma.go.jp/developer/xml/feed/regular.xml`)).split(`<entry>`).slice(1).find(item => item.includes(`【神奈川県府県週間天気予報】`));
  const wetherRssData = await myLib.https(wetherRssItem.slice(wetherRssItem.indexOf(`<id>`) + 4, wetherRssItem.indexOf(`</id>`)));
  const weathrOffset = Number(Number(wetherRssData.match(/\<TargetDateTime\>[0-9]{4}\-[0-9]{2}\-([0-9]{2})T[0-9]{2}\:[0-9]{2}\:[0-9]{2}\+09\:00\<\/TargetDateTime\>/)[1]) === new Date().getDate());//今日からなら+1 明日からなら+0([0]=(type="○○以前)のため)

  //要素ごとに8日分の配列を作って最後にマージ
  await myLib.ddb.cacheSet(`skd`, JSON.stringify(
    [
      //全体予定
      gssData.monthSkd.map(row => ({
        event: (String(row[0]) || "無し").replaceAll(`\\n`, `\n`),
        tt: String(row[1]) || `通常`,
        cafe: row[2] ? `営業` : `休業`,
        sdRoom: row[3] ? `開放` : `閉鎖`,
      })),
      //クラス予定
      gssData.clsSkds.reduce((pre, clsSkd, clsIdx) => {
        clsSkd.forEach((row, rIdx) => {
          pre[rIdx].clss[clsIdx + 1] = {
            report: (String(row[0]) || "無し").replaceAll(`\\n`, `\n`),
            cls: row.slice(1).reduce((pre, cell, cIdx) => {
              pre[Math.trunc(cIdx / 2)].push(String(cell) || `-`);
              return pre;
            }, Array(7).fill().map(_ => [])),//ここの7は日付数ではなく授業数なので修正のつもりで破壊しないように
          }
        });
        return pre;
      }, Array(8).fill().map(_ => ({ clss: [] }))),
      //アニメ
      Array(8).fill().map((_, idx) => (
        {
          anime: (gssData.anime.map(row =>
            String(row[0])[0] === [`日`, `月`, `火`, `水`, `木`, `金`, `土`][(new Date().getDay() + idx) % 7] ? `${row[1]}　${row[2]}` : null
          ).filter(Boolean)).join(`\n`) || `無し`
        }
      )),
      //天気予報
      Array(8).fill().map((_, idx) => ({
        weather: {
          weather: wetherRssData.split(`type="基本天気`).toSpliced(0, 1, "")[idx + weathrOffset]?.match(/>(.+?)</)?.[1] || `不明`,
          rain: (wetherRssData.split(`type="日降水確`).toSpliced(0, 1, "")[idx + weathrOffset]?.match(/>(.+?)</)?.[1] || `?`) + `%`,
          tmpLow: (wetherRssData.split(`type="最低気温`).toSpliced(0, 1, "")[idx + weathrOffset]?.match(/>(.+?)</)?.[1] || `?`) + `°C`,
          tmpHigh: (wetherRssData.split(`type="最高気温`).toSpliced(0, 1, "")[idx + weathrOffset]?.match(/>(.+?)</)?.[1] || `?`) + `°C`,
        }
      })),
    ].reduce((pre, dataEl) => {
      for (let dayNum = 0; dayNum < 8; dayNum++) {
        Object.assign(pre[dayNum], dataEl[dayNum]);
      }
      return pre;
    }, Array(8).fill().map(_ => ({})))
  ));

  const trainRes = {};
  let holidayInfo = false;
  try {
    holidayInfo = await myLib.https(`https://api.national-holidays.jp/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, `0`)}/${String(new Date().getDate()).padStart(2, `0`)}`);
    //※祝日でなければ404が返る
  } catch (e) { }
  const kind = (holidayInfo || !new Date().getDay()) ? 4 : new Date().getDay() === 6 ? 2 : 1;//何故か3が無いため注意
  for (const info of gssData.train.filter(el => el[0] && el[1] && el[2] && el[3] && el[4])) {
    try {
      trainRes[`${info[0]} ${info[1]}駅 ${info[2]}方面`] = {
        tt: (await myLib.https(`${info[3].match(/^(https\:\/\/transit\.yahoo\.co\.jp\/timetable\/[0-9]+\/[0-9]+)/)[1]}?kind=${kind}`)).split(`<tr id="hh_`).slice(1).reduce((pre, cur, idx, ary) => {
          pre[cur[1] === `"` ? cur.slice(0, 1) : cur.slice(0, 2)] = (idx !== ary.length - 1 ? cur : cur.slice(0, cur.indexOf(`</tbody>`))).split(`<dt>`).slice(1).map(el => el[1] === `<` ? el.slice(0, 1) : el.slice(0, 2))
          return pre;
        }, Array(24).fill().map(_ => [])).map((el, hIdx) => el.map(min => hIdx * 60 + Number(min))).flat(),
        delay: info[4],
      }
    } catch (e) {
      trainRes[`${info[0]} ${info[1]}駅 ${info[2]}方面`] = null;
    }
  }
  await myLib.ddb.cacheSet(`trainTt`, JSON.stringify(trainRes));

  await myLib.ddb.cacheSet(`addLs`, JSON.stringify(gssData.addLs.map(row => [row[0], `${row[2]}${row[3]}`, row[4] || `-`, row[5] || `-`, row[6] || `-`])));

  const exeLog = await myLib.ddb.cacheGet(`exeLog`);
  await new myLib.disc()
    .fields(`requests`, `${exeLog.ctr.toLocaleString().padStart(7, ` `)}/10,000,000`)
    .fields(`GB-s`, `${Math.trunc(exeLog.gbs).toLocaleString().padStart(7, ` `)}/ 4,000,000`)
    .embeds(`SystemReport ${new Date().expAdds([, , -1]).getMonth() + 1}/${new Date().expAdds([, , -1]).getDate()}`)
    .send(envVars.disc.log.run);
}

//fin.