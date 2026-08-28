// NOTE: v5: にold-v4としてコピーする際に削除(シークレットをハードコードしていたため)
var keys = {
  line: ``,
  gas: ``,
  usr: ``,
};

function handler(event) {
  if (
    (event.request.querystring.srcId.value === `line` &&
      event.request.querystring.srcKey.value === keys.line) ||
    (event.request.querystring.srcId.value === `gas` &&
      event.request.querystring.srcKey.value === keys.gas) ||
    (event.request.querystring.srcId.value === `usr` &&
      event.request.querystring.srcKey.value === keys.usr)
  ) {
    return event.request;
  } else {
    return { statusCode: 403 };
  }
}
