// NOTE: v5: v4でははちまきBOTと個人用の両方の機能を詰め込んでるため注意

//第零階層 各種設定&汎用関数▽
"use strict";

// NOTE: v5: old-v4としてコピーする際に削除(シークレットをハードコードしていたため)
const conf = {
  lmfUrl: ``,
  lmfKey: ``,
  gasKey: ``,
  gssId: ``,
  myAdd: ``,
  mailBkLs: [
    //parseのキーと弾きたい文字列のペア
    [`subject`, `Review edits to your Apps Script project`],
    [`body`, `連載記事アラート`],
    [`subject`, `steamウィッシュリスト`],
  ],
};

//Dateプロトタイプ拡張
Object.assign(Date.prototype, {
  dateMethods: [
    `FullYear`,
    `Month`,
    `Date`,
    `Hours`,
    `Minutes`,
    `Seconds`,
    `Milliseconds`,
  ],
  /**7単位別加算
   * @param  {number[]} addAry - 年,月,日,時,分,秒,ミリ秒(0埋め/省略可)
   * @return {Date}
   */
  expAdds: function (addAry) {
    return addAry.reduce((pre, addVal, idx) => {
      pre[`set${this.dateMethods[idx]}`](
        addVal + pre[`get${this.dateMethods[idx]}`](),
      );
      return pre;
    }, new Date(this));
  },
  /**7単位別設定
   * @param  {number[]} setAry - 年,月,日,時,分,秒,ミリ秒(nullかundefined埋め/省略可)
   * @return {Date}
   */
  expSets: function (setAry) {
    return setAry.reduce((pre, setVal, idx) => {
      pre[`set${this.dateMethods[idx]}`](setVal);
      return pre;
    }, new Date(this));
  },
  /**曜日
   * @return {string}
   */
  expDayJP: function () {
    return `日月火水木金土`[this.getDay()];
  },
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
      switch (
        fmt[i] //NOTE:iへの加算が必要なため三項演算子使用不可
      ) {
        case `Y`:
          if (fmt[i + 3] === `Y`) {
            retDate.setFullYear(Number(tgt.slice(i, i + 4)));
            i += 3;
          } else {
            retDate.setFullYear(Number(tgt.slice(i, i + 2)));
            retDate.expAdds([100]);
            i += 1;
          }
          break;
        case `M`:
          if (fmt[i + 2] !== `M`) {
            retDate.setMonth(Number(tgt.slice(i, i + 2)) - 1);
            i += 1;
          } else {
            retDate.setMonth(
              Number(
                [
                  `Jan`,
                  `Feb`,
                  `Mar`,
                  `Apr`,
                  `May`,
                  `Jun`,
                  `Jul`,
                  `Aug`,
                  `Sep`,
                  `Oct`,
                  `Nov`,
                  `Dec`,
                ].indexOf(tgt.slice(i, i + 3)),
              ),
            );
            i += 2;
          }
          break;
        case `D`:
          {
            retDate.setDate(Number(tgt.slice(i, i + 2)));
            i += 1;
          }
          break;
        case `H`:
          {
            retDate.setHours(Number(tgt.slice(i, i + 2)));
            i += 1;
          }
          break;
        case `m`:
          {
            retDate.setMinutes(Number(tgt.slice(i, i + 2)));
            i += 1;
          }
          break;
        case `S`: {
          retDate.setSeconds(Number(tgt.slice(i, i + 2)));
          i += 1;
        }
      }
    }
    if (msecRst) {
      retDate.setMilliseconds(0);
    }
    if (secRst) {
      retDate.setSeconds(0);
    }
    return retDate;
  },
});
//第零階層 各種設定&汎用関数△

//第一階層 起動部＿メール
function mail() {
  if (GmailApp.getInboxUnreadCount()) {
    const sendData = { data: [] };
    try {
      GmailApp.getMessagesForThreads(
        GmailApp.search(`is:unread`, 0, 500),
      ).forEach((thread) => {
        const message = thread[0];
        if (
          message.getTo().match(/^.*<?y15274[0-9]{3}@edu.city.yokohama.jp>?$/u)
        ) {
          //学校アドレスの処理(classroomのみ送信)
          if (
            message.getFrom().match(/^.*<?no-reply@classroom.google.com>?$/u) &&
            message
              .getSubject()
              .match(/^新しい(お知らせ|課題|資料): 「[\s\S]*」$/u)
          ) {
            const body = message.getPlainBody().split(`\r\n`);
            const idxA = body.findIndex((el) => el.includes(`通知設定` /*　*/));
            const idxB = body.findIndex((el) => el.includes(`詳細を表示` /**/));
            const parse = {
              room: body.slice(idxA + 2, idxA + 2 + 1)[0].trim(),
              type: body.slice(idxA + 4, idxA + 4 + 1)[0].slice(3),
              title: body.slice(idxA + 6, idxB)[0].trim(),
              text:
                body
                  .slice(idxA + 6 + 1, idxB)
                  .slice(1)
                  ?.join(``)
                  .replaceAll(` `, ``)
                  .replaceAll(`　`, ``)
                  .replaceAll(`。`, `。\n`)
                  .replaceAll(`・`, `\n・`)
                  .replaceAll(/[\n]+/g, `\n`) || `-`,
              link: body.slice(idxB + 1, idxB + 1 + 1)[0].slice(53, -38),
              time: body.slice(idxB + 2, idxB + 2 + 1)[0],
              author: body
                .slice(idxB + 2, idxB + 2 + 1)[0]
                .match(/投稿者: (.*)$/)[1],
            };
            const dateAry = parse.time
              .match(
                /投稿日:\s*(\d{1,2}):(\d{2})\s*(午前|午後),\s*(\d{1,2})月\s*(\d{1,2})\s*\((\w+)\)/,
              )
              .slice(1);
            parse.time = `${dateAry[3]}/${dateAry[4]} ${Number(dateAry[0]) + (dateAry[2] === `午後` ? 12 : 0)}:${dateAry[1]}`;
            sendData.data.push({
              type: `cls`,
              to: message
                .getTo()
                .match(/^.*<?y15274([0-9]{3})@edu.city.yokohama.jp>?$/u)[1],
              data: parse,
            });
          }
          thread.forEach(
            (message) => message.markRead() /*message.moveToTrash()*/,
          );
        } else {
          //個人アドレスの処理(条件に合致すれば自動転送承認)　メール回収用アドレス自体に来たものは既読、それ以外は削除
          if (
            message.getTo() === conf.myAdd &&
            message
              .getSubject()
              .match(
                /^（横浜市教育委員会 の転送の確認 - y15274[0-9]{3}@edu.city.yokohama.jp からメールを受信$/u,
              )
          ) {
            UrlFetchApp.fetch(
              message
                .getPlainBody()
                .match(
                  /からこのアドレスにメールを自動転送するには、以下のリンクをクリックしてリクエストを確認してください。\r\n\r\n(.*)\r\n\r\nリンクをクリックしても機能しない場合は、ブラウザで新しいウィンドウを開き、URL を貼り付けてください。/u,
                )[1],
              {
                method: "POST",
                contentType: "application/x-www-form-urlencoded",
              },
            );
            sendData.data.push({
              type: `pvt`,
              data: {
                from: `i5system`,
                to: [conf.myAdd],
                subject: `転送リクエスト承認`,
                body: `アドレス：${message.getSubject().match(/^^（横浜市教育委員会 の転送の確認 - (y15274[0-9]{3}@edu.city.yokohama.jp) からメールを受信$$/u)[1]}`,
                url: `https://mail.google.com/mail/u/0/#inbox/${message.getId()}`,
                date: message.getDate(),
              },
            });
            thread.forEach((message) => message.markRead());
          } else {
            const parse = {
              type: `pvt`,
              data: {
                from: message.getFrom(),
                to: `${message.getTo()},${message.getCc()},${message.getBcc()}`
                  .split(`,`)
                  .filter(Boolean),
                subject: message.getSubject(),
                body: message
                  .getPlainBody()
                  .replaceAll(`\n`, ` `)
                  .replaceAll(`\r\n`, ` `)
                  .slice(0, 400),
                url: `https://mail.google.com/mail/u/0/#inbox/${message.getId()}`,
                date: message.getDate(),
              },
            };
            if (!conf.mailBkLs.some((el) => parse[el[0]]?.includes(el[1]))) {
              sendData.data.push(parse);
            }
            thread.forEach(
              (message) =>
                message.getTo() === conf.myAdd
                  ? message.markRead()
                  : message.markRead() /*message.moveToTrash()*/,
            ); //dev
          }
        }
      });
      sendData.status = 200;
    } catch (e) {
      sendData.status = 500;
      sendData.error = {
        name: e.name,
        message: e.message,
        stack: e.stack,
      };
    } finally {
      if (sendData.data[0] || sendData.error) {
        UrlFetchApp.fetch(`${conf.lmfUrl}?srcId=gas&srcKey=${conf.lmfKey}`, {
          method: `POST`,
          contentType: `application/json`,
          payload: JSON.stringify(sendData),
        });
      }
    }
  }
}

//第一階層 起動部＿HTTP
function http(httpData) {
  //完了
  const retObj = {};
  try {
    if (
      httpData.parameter.srcId === `lambda` &&
      httpData.parameter.srcKey === conf.gasKey
    ) {
      retObj.data = exe[httpData.parameter.tgt](httpData.parameter.param);
      retObj.statusCode = 200;
    } else {
      retObj.statusCode = 403;
    }
  } catch (e) {
    retObj.statusCode = 500;
    retObj.error = {
      message: e.message,
      subName: e.name,
      subStack: e.stack,
    };
  } finally {
    return ContentService.createTextOutput()
      .setMimeType(ContentService.MimeType.JSON)
      .setContent(JSON.stringify(retObj));
  }
}

//第二階層 HTTP個別処理 ※やり直しが効く設計にして、失敗したらLambdaから蹴り直す
const exe = {
  authSend: (param) => {
    //完了
    GmailApp.getDraft(
      GmailApp.createDraft(
        `y15274${param.slice(0, 3)}@edu.city.yokohama.jp`,
        `ワンタイムパスワードのお知らせ(はちまきBOT管理者より)`,
        `はちまきBOTへの登録ありがとうございます。\n以下がワンタイムパスワードになります。これをはちまきBOTに送信してください。\n\n${param.slice(3, 13)}\n\nもしこの操作を行っていなければ無視して問題ありませんが、気になるのであればy15274053@edu.city.yokohama.jpまで連絡お願いします。`,
      ).getId(),
    ).send();
  },
  gssAuth: (add) => {
    //完了
    const gssCl = SpreadsheetApp.openById(conf.gssId);
    if (
      gssCl
        .getEditors()
        .map((el) => el.getEmail())
        .includes(add)
    ) {
      return `追加済です。`;
    } else {
      gssCl.addEditor(add);
      return `追加完了しました。`;
    }
  },
  daily: () => {
    //完了
    const gssFunc = (ss, rowS, colS, rowE, colE) => {
      //colEが存在すればGETと判定
      rowS =
        rowS.slice?.(0, 4) === `LAST`
          ? ss.getLastRow() + Number(rowS.slice(4))
          : rowS;
      colS =
        colS.slice?.(0, 4) === `LAST`
          ? ss.getLastColumn() + Number(colS.slice(4))
          : colS;
      if (colE) {
        rowE =
          rowE.slice?.(0, 4) === `LAST`
            ? ss.getLastRow() - rowS + 1 + Number(rowE.slice(4)) || 1
            : rowE;
        colE =
          colE.slice?.(0, 4) === `LAST`
            ? ss.getLastColumn() - colS + 1 + Number(colE.slice(4)) || 1
            : colE;
        return ss.getRange(rowS, colS, rowE, colE).getValues();
      } else {
        return ss
          .getRange(
            rowS,
            colS,
            rowE.length,
            rowE.reduce((pre, cur) => Math.max(pre, cur.length), 0),
          )
          .setValues(rowE);
      }
    };
    const gssCl = SpreadsheetApp.openById(conf.gssId);

    const ssObjs = {
      monthSkd: gssCl.getSheetByName(`月間予定表`),
      clsSkd: [`1組`, `2組`, `3組`, `4組`, `5組`, `6組`].map((name) =>
        gssCl.getSheetByName(name),
      ),
      timeTable: gssCl.getSheetByName(`時間割`),
    };

    //行自動更新
    const nowDate = [new Date().getMonth() + 1, new Date().getDate()];
    [ssObjs.monthSkd, ...ssObjs.clsSkd].forEach((ssObj) => {
      let delCtr = -1; //最上段が今日でも必ず+1されるため
      gssFunc(ssObj, 2, 1, 10, 2).some((row) => {
        delCtr++;
        return row[0] == nowDate[0] && row[1] == nowDate[1];
      });
      if (delCtr) {
        ssObj.deleteRows(2, delCtr);
      }
    });

    //予定表自動転記
    const timeTable = gssFunc(ssObjs.timeTable, 2, 3, 30, 7);
    const clsSkds = ssObjs.clsSkd.map((ssObj) =>
      gssFunc(ssObj, 2, 1, `LAST`, 17),
    );
    gssFunc(ssObjs.monthSkd, 2, 1, `LAST`, 13) //月間予定データ [月,日,時程,カフェ,自習室,1,2,3,4,5,6,7][...
      .reduce(
        (preAry, moRow, moRowIdx) => {
          clsSkds.forEach((clsSkd, clsIdx) => {
            preAry[clsIdx][moRowIdx] = [
              moRow[0], //月
              moRow[1], //日
              clsSkd[moRowIdx]?.[2], //提出物
              ...moRow
                .slice(6)
                .map((moCell, moCellIdx) => [
                  [`月`, `火`, `水`, `木`, `金`].includes(moCell?.[0]) &&
                  1 <= Number(moCell?.[1]) &&
                  Number(moCell?.[1]) <= 7
                    ? `${timeTable[clsIdx * 5 + [`月`, `火`, `水`, `木`, `金`].indexOf(moCell[0])][Number(moCell[1]) - 1]} (${moCell})` ||
                      ""
                    : moCell /*　　　　　*/ || "",
                  clsSkd[moRowIdx]?.[3 + moCellIdx * 2 + 1] || "",
                ])
                .flat(),
            ];
          });
          return preAry;
        },
        Array(6)
          .fill()
          .map((el) => (el = [])),
      )
      .forEach((clsData, clsIdx) =>
        gssFunc(ssObjs.clsSkd[clsIdx], 2, 1, clsData),
      );

    //GSSデータ送信
    const sendData = {
      monthSkd: gssFunc(ssObjs.monthSkd /*　　　　　*/, 2, 3, 8, 4),
      clsSkds: ssObjs.clsSkd.map((el) =>
        gssFunc(el /*　　　　　*/, 2, 3, 8, 15),
      ),
      anime: gssFunc(gssCl.getSheetByName(`アニメ` /*　　*/), 2, 1, `LAST`, 3),
      train: gssFunc(gssCl.getSheetByName(`電車` /*　　　*/), 2, 1, `LAST`, 5),
      addLs: gssFunc(gssCl.getSheetByName(`アドレス表`), 3, 1, 238, 6),
    };

    return sendData;
  },
  kill: () => {
    ScriptApp.getProjectTriggers().forEach((trigObj) =>
      ScriptApp.deleteTrigger(trigObj),
    ); //トリガー削除
    //ScriptApp.invalidateAuth();//承認無効化
    //DriveApp.getFileById(ScriptApp.getScriptId()).setTrashed(true);//ゴミ箱に移動
    //よく考えたら下2つはやり過ぎ
  },
};
