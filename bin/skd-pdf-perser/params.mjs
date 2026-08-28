const params = {
  pdf_name: "【生徒用】４月５月行事予定",

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
    date: { min: 55, max: 85 },
    change: { min: 90, max: 115 },
    grade: { min: 120, max: 135 },
    timetables: {
      1: { min: 140, max: 165 },
      2: { min: 170, max: 190 },
      3: { min: 195, max: 215 },
      4: { min: 220, max: 245 },
      5: { min: 270, max: 290 },
      6: { min: 290, max: 320 },
      7: { min: 320, max: 340 },
    },
    cafe: { min: 250, max: 260 },
    study_room: { min: 350, max: 365 },
    event_hs: { min: 370, max: 450 },
  },
};

export default params;
