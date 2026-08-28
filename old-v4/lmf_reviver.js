//第零階層 各種設定&汎用関数▽
const envVars = {
    lmf: {                                         //Lambda関数名
        main: process.env.lmf_main,//メイン処理用
    },
    ddb: {                                         //DynamoDBのテーブル名
        cache: process.env.ddb_cache,//キャッシュ用
    },
}

const myLib = {
    //DynamoDB操作
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
        scan: async (tableName,) => myLib.ddb.d2nCast((await new myLib.ddb.mod.DynamoDBClient().send(new myLib.ddb.mod.ScanCommand({ TableName: tableName, }))).Item || []),
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
};
//第零階層 各種設定&汎用関数△

exports.handler = async () => {
    const lamCl = require("@aws-sdk/client-lambda");
    await (new lamCl.LambdaClient())
        .send(new lamCl.DeleteFunctionConcurrencyCommand({
            FunctionName: envVars.lmf.main,
        }));
    const preRes = await myLib.ddb.cacheGet(`exeLog`);
    preRes.ctr = 0;
    preRes.gbs = 0;
    await myLib.ddb.cacheSet(`exeLog`, preRes);
}










