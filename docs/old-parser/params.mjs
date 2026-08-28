const params = {
  pdf_name: "【生徒用】２月３月行事予定",

  log_records_name: "parsed_records",

  log_merged_records_name: "merged_records",

  output_csv_name: "parsed_schedule",

  /*
        - trace
        - warn
        - error
    */
  log_level: "trace",

  header_under_border: 1120,

  row_clearance: 4,

  col_ranges: {
    date: { min: 39, max: 74 },
    change: { min: 70, max: 97 },
    event_hs: { min: 88, max: 269 },
    grade: { min: 271, max: 288 },
    timetables: {
      1: { min: 298, max: 321 },
      2: { min: 318, max: 342 },
      3: { min: 340, max: 364 },
      4: { min: 361, max: 385 },
      5: { min: 405, max: 429 },
      6: { min: 426, max: 450 },
      7: { min: 448, max: 472 },
    },
    cafe: { min: 390, max: 403 },
    study_room: { min: 475, max: 492 },
  },
};

export default params;
