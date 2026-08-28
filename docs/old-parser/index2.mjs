import fs from 'fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import params from './params.mjs';

async function main() {
    const logger = (levels, msg) => { if (levels.includes(params.log_level)) console.log(msg); };

    const pdfData = fs.readFileSync(`pdfs/${params.pdf_name}.pdf`);
    const pdf = await new pdfjs.getDocument({ data: new Uint8Array(pdfData) }).promise;

    const pages = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        pages.push(await procPage(logger, page));
    }

    pages.sort((a, b) => {
        const a_date = a[0].date;
        const b_date = b[0].date;
        if (a_date.mon !== b_date.mon) {
            return a_date.mon - b_date.mon;
        } else {
            return a_date.day - b_date.day;
        }
    });

    const flattened_pages = pages.flat();

    const csv_data = to_csv(flattened_pages);

    fs.writeFileSync(`${params.output_csv_name}.csv`, csv_data, 'utf-8');

    console.log("処理正常終了\n");
}

async function procPage(logger, page) {
    const contents_raw = await page.getTextContent();

    const contents = contents_raw.items
        .filter((item) => item.str && item.str.trim() !== '')
        .map((item) => {
            return {
                str: item.str.trim(),
                x_coord: item.transform[4],
                y_coord: item.transform[5],
                height: item.height,
                width: item.width,
            };
        });

    const records = split_records(logger, contents);

    fs.writeFileSync(`logs/${params.log_records_name}_page${page.pageNumber}.json`,
        JSON.stringify(records, null, 4), 'utf-8');

    const merged_records = merge_records_by_date(records);

    fs.writeFileSync(`logs/${params.log_merged_records_name}_page${page.pageNumber}.json`,
        JSON.stringify(merged_records, null, 4), 'utf-8');

    return merged_records;
}

function split_records(logger, contents) {
    // Y座標降順ソート(物理的に上から下へ)
    const contents_y_desc =
        contents.sort((a, b) => b.y_coord - a.y_coord);

    const records_scattered = []; // [{},{},{}][] という形式
    const contents_buffer = []; // まだ日付に送達していないアイテム群
    let last_date_y_coord = null;

    for (const item of contents_y_desc) {
        const col_res = col_match(logger, item);
        if (!col_res) continue;

        if (col_res.date) {
            // バッファの内容と日付を一緒に新しいレコードとして追加
            records_scattered.push([...contents_buffer, col_res]);
            contents_buffer.length = 0;
            last_date_y_coord = item.y_coord;
        } else {
            if (last_date_y_coord !== null &&
                // NOTE: 上(=Y座標大)から処理してるので必ず正になる
                last_date_y_coord - item.y_coord <= params.row_clearance) {
                // clearance範囲内なら、現在のレコード(最後に追加した日付の行)に追加
                records_scattered.at(-1).push(col_res);
            } else {
                // clearance範囲外なら、バッファに保存(次の日付の行に属する)
                last_date_y_coord = null;
                contents_buffer.push(col_res);
            }
        }
    }

    // 最後に残ったバッファのアイテムを最後のレコードに追加
    if (contents_buffer.length > 0 && records_scattered.length > 0) {
        records_scattered.at(-1).push(...contents_buffer);
    }

    const records = records_scattered.map((record_items) => {
        const record = {};
        for (const col_res of record_items) {
            Object.assign(record, col_res);
        }
        return record;
    });

    return records;
}

function col_match(logger, item) {
    if (params.header_under_border < item.y_coord) {
        logger(["trace","warn"], `ヘッダー下限ボーダーによりアイテムを無視: ${JSON.stringify(item)}`);
        return null;
    }
    if (params.col_ranges.date.min <= item.x_coord && item.x_coord <= params.col_ranges.date.max) {
        let re_res = item.str.match(/^(\d{1,2})\/(\d{1,2})[月火水木金土日]$/);
        if (!re_res) {
            throw new Error(`日付カラム正規表現不一致: ${JSON.stringify(item)}`);
        }
        const mon = parseInt(re_res[1], 10);
        const day = parseInt(re_res[2], 10);
        logger(["trace"], `日付カラムマッチ: ${mon}/${day} : ${JSON.stringify(item)}`);
        return {
            date: { mon, day }
        }
    }
    if (params.col_ranges.change.min <= item.x_coord && item.x_coord <= params.col_ranges.change.max) {
        let res = item.str;
        if (res.startsWith("短縮")) {
            res = res.replace("短縮", "");
        }
        logger(["trace"], `変更カラムマッチ: ${JSON.stringify(item)}`);
        return { change: res };
    }
    if (params.col_ranges.event_hs.min <= item.x_coord && item.x_coord <= params.col_ranges.event_hs.max) {
        logger(["trace"], `行事カラムマッチ: ${JSON.stringify(item)}`);
        return { event_hs: item.str };
    }
    if (params.col_ranges.grade.min <= item.x_coord && item.x_coord <= params.col_ranges.grade.max) {
        let grade = null;
        switch (item.str) {
            case "①":
                grade = 1;
                break;
            case "②":
                grade = 2;
                break;
            case "③":
                grade = 3;
                break;
        }
        if (grade === null) {
            throw new Error(`学年カラム不明値: ${JSON.stringify(item)}`);
        }
        logger(["trace"], `学年カラムマッチ: ${grade}年次 : ${JSON.stringify(item)}`);
        return { grade };
    }
    if (params.col_ranges.cafe.min <= item.x_coord && item.x_coord <= params.col_ranges.cafe.max) {
        let open = false;
        if (item.str === "〇") {
            open = true;
        }
        logger(["trace"], `カフェテリアカラムマッチ: Open=${open} : ${JSON.stringify(item)}`);
        return { cafe: open };
    }
    if (params.col_ranges.study_room.min <= item.x_coord && item.x_coord <= params.col_ranges.study_room.max) {
        let avable = null;
        if (item.str == "〇") {
            avable = true;
        } else if (item.str == "✕") {
            avable = false;
        }
        logger(["trace"], `自習室カラムマッチ: Open=${avable} : ${JSON.stringify(item)}`);
        return { study_room: avable };
    }
    for (let i = 1; i <= 7; i++) {
        const range = params.col_ranges.timetables[i];
        if (range.min <= item.x_coord && item.x_coord <= range.max) {
            logger(["trace"], `時間割カラムマッチ: ${i}限 : ${JSON.stringify(item)}`);
            return { [`timetable_${i}`]: item.str };
        }
    }
    logger(["trace","warn"], `いずれのカラムにもマッチしなかったアイテムを無視: ${JSON.stringify(item)}`);
    return null;
}

function merge_records_by_date(records) {
    const merged_records = [];

    if (records.length % 3 !== 0) {
        throw new Error(`行数が3の倍数になっていない: ${records.length}`);
    }
    for (let i = 0; i < records.length; i += 3) {
        const row_1 = records[i];
        const row_2 = records[i + 1];
        const row_3 = records[i + 2];

        if (row_1.date.mon !== row_2.date.mon || row_1.date.day !== row_2.date.day ||
            row_1.date.mon !== row_3.date.mon || row_1.date.day !== row_3.date.day) {
            throw new Error(`3行セットの日付が一致しない: ${i}行目`);
        }

        if (( row_1.grade && row_2.grade && row_3.grade) && (row_1.grade !== 1 || row_2.grade !== 2 || row_3.grade !== 3)) {
            throw new Error(`3行セットの学年が1,2,3年次になっていない: ${i}行目`);
        }

        const date = row_1.date;

        const change = merge_cells([row_1.change, row_2.change, row_3.change], '\n');

        const event_hs = merge_cells([row_1.event_hs, row_2.event_hs, row_3.event_hs], '\n');

        const cafe = row_1.cafe || row_2.cafe || row_3.cafe;

        const study_room = row_1.study_room || row_2.study_room || row_3.study_room;

        const timetables = {};
        for (let j = 1; j <= 7; j++) {
            // 対象は2年次のみ
            timetables[j] = row_2[`timetable_${j}`] || null;
        }

        const merged_record_item = {
            date,
            change,
            event_hs,
            cafe,
            study_room,
            timetables,
        }

        merged_records.push(merged_record_item);
    }

    return merged_records;
}

function merge_cells(cells, join) {
    const res = [];
    for (const cell of cells) {
        if (cell && !res.includes(cell)) {
            res.push(cell);
        }
    }
    if (join != null) {
        return res.join(join);
    } else {
        return res;
    }
}

function to_csv(records) {
    const lines = [];
    for (const record of records) {
        const line_elems = [];
        line_elems.push(record.date.mon);
        line_elems.push(record.date.day);
        line_elems.push(record.event_hs || "");
        line_elems.push(record.change || "");
        line_elems.push(record.cafe ? "TRUE" : "FALSE");
        line_elems.push(record.study_room ? "TRUE" : "FALSE");
        for (let i = 1; i <= 7; i++) {
            line_elems.push(record.timetables[i] || "");
        }
        lines.push(line_elems.map((elem) => `"${String(elem).replaceAll("\"", "\"\"")}"`).join(','));
    }
    return lines.join('\n');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
