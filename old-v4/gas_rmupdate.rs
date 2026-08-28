// NOTE: v5: old-v4としてコピーする際に削除(シークレットをハードコードしていたため)

const gssUrl    = ``
const linetoken = ``;
const rmDidA    = ``;
const rmDidB    = ``;
const gitUrl    = ``;
const rmAryA = [
  {
    "type"            : "postback",
    "data"            : "skd_w",
    "inputOption"     : "closeRichMenu",
  },
  {
    "type"            : "datetimepicker",
    "data"            : "skd",
    "mode"            : "date"
  },
  {
    "type"            : "postback",
    "data"            : "clsInfo",
    "inputOption"     : "closeRichMenu",
  },
  {
    "type"            : "postback",
    "data"            : "train",
    "inputOption"     : "closeRichMenu",
  },
  {
    "type"            : "postback",
    "data"            : "cafeImgG",
    "inputOption"     : "closeRichMenu",
  },
  {
    "type"            : "postback",
    "data"            : "cafeImgP",
    "inputOption"     : "closeRichMenu",
  },
  {
    "type"            : "uri",
    "uri"             : gssUrl
  },
  {
    "type"            : "richmenuswitch",
    "richMenuAliasId" : "rm_b",
    "data"            : "hoge",
  },
]
const rmAryB = [
  {
    "type"            : "postback",
    "data"            : "addFind",
    "inputOption"     : "closeRichMenu",
  },
  {
    "type"            : "postback",
    "data"            : "customUrl",
    "inputOption"     : "closeRichMenu",
  },
  {
    "type"            : "postback",
    "data"            : "gssAuth",
    "inputOption"     : "closeRichMenu",
  },
  {
    "type"            : "postback",
    "data"            : "repRm",
    "inputOption"     : "closeRichMenu",
  },
  {
    "type"            : "postback",
    "data"            : "stonePick",
    "inputOption"     : "closeRichMenu",
  },
  {
    "type"            : "postback",
    "data"            : "clsReg",
    "inputOption"     : "closeRichMenu",
  },
  {
    "type"            : "uri",
    "uri"             : gitUrl
  },
  {
    "type"            : "richmenuswitch",
    "richMenuAliasId" : "rm_a",
    "data"            : "hoge",
  },
];

function main() {
  const rmAry2rmObj = (rmAry) => ({
    size       :{
      width : 2500,
      height: 1700,
    },
    selected   : true,
    name       : "rm",
    chatBarText: "メニュー",
    areas      : rmAry.map((rmInfo,idx)=>({
      bounds: {
        x     : 650*          (idx%4) ,
        y     : 850*Math.trunc(idx/4),
        width : 650,
        height: 850,
      },
      action:rmInfo,
    })),
  });
  const lineHeader = {"Authorization":`Bearer ${linetoken}`};
  const baseUrl    = `https://api.line.me/v2/bot/richmenu`;
  JSON.parse(              UrlFetchApp.fetch(`${baseUrl}/list`                                          ,{method:"GET"   ,headers:lineHeader}).getContentText()).richmenus?.forEach(rm=>
                           UrlFetchApp.fetch(`${baseUrl}/${rm.richMenuId}`                              ,{method:"DELETE",headers:lineHeader})
  );
  JSON.parse(              UrlFetchApp.fetch(`${baseUrl}/alias/list`                                    ,{method:"GET"   ,headers:lineHeader}).getContentText()).aliases  ?.forEach(rm=>
                           UrlFetchApp.fetch(`${baseUrl}/alias/${rm.richMenuAliasId}`                   ,{method:"DELETE",headers:lineHeader})
  );
  const rmIdA = JSON.parse(UrlFetchApp.fetch(baseUrl                                                    ,{method:"POST"  ,headers:lineHeader,contentType:"application/json",payload:JSON.stringify(rmAry2rmObj(rmAryA))                          }).getContentText()).richMenuId;
                           UrlFetchApp.fetch(`https://api-data.line.me/v2/bot/richmenu/${rmIdA}/content`,{method:"POST"  ,headers:lineHeader,contentType:"image/png"       ,payload:DriveApp.getFileById(rmDidA).getAs(`image/png`)              })                             ;
                           UrlFetchApp.fetch(`${baseUrl}/alias`                                         ,{method:"POST"  ,headers:lineHeader,contentType:"application/json",payload:JSON.stringify({"richMenuAliasId":"rm_a","richMenuId":rmIdA})})                             ;
  const rmIdB = JSON.parse(UrlFetchApp.fetch(baseUrl                                                    ,{method:"POST"  ,headers:lineHeader,contentType:"application/json",payload:JSON.stringify(rmAry2rmObj(rmAryB))                          }).getContentText()).richMenuId;
                           UrlFetchApp.fetch(`https://api-data.line.me/v2/bot/richmenu/${rmIdB}/content`,{method:"POST"  ,headers:lineHeader,contentType:"image/png"       ,payload:DriveApp.getFileById(rmDidB).getAs(`image/png`)              })                             ;
                           UrlFetchApp.fetch(`${baseUrl}/alias`                                         ,{method:"POST"  ,headers:lineHeader,contentType:"application/json",payload:JSON.stringify({"richMenuAliasId":"rm_b","richMenuId":rmIdB})})                             ;
                           UrlFetchApp.fetch(`https://api.line.me/v2/bot/user/all/richmenu/${rmIdA}`    ,{method:"POST"  ,headers:lineHeader,                                                                                                    })                             ;
}






























