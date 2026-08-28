export enum TrainTimetableID {
  JrTsurumiLine_TsurumiOno_Tsurumi = "jr_tsurumi_line_tsurumi_ono_tsurumi",
  JrTsurumiLine_Tsurumi_TsurumiOno = "jr_tsurumi_line_tsurumi_tsurumi_ono",
  JrKeihinTohoku_Tsurumi_Tokyo = "jr_keihin_tohoku_tsurumi_tokyo",
  JrKeihinTohoku_Tsurumi_Yokohama = "jr_keihin_tohoku_tsurumi_yokohama",
  KeikyuMain_KeikyuTsurumi_Shinagawa = "keikyu_main_keikyu_tsurumi_shinagawa",
  KeikyuMain_KeikyuTsurumi_Yokohama = "keikyu_main_keikyu_tsurumi_yokohama",
  KeikyuMain_KagetsuSojiji_Shinagawa = "keikyu_main_kagetsu_sojiji_shinagawa",
  KeikyuMain_KagetsuSojiji_Yokohama = "keikyu_main_kagetsu_sojiji_yokohama",
}

export type TrainTimetable = {
  id: TrainTimetableID;
  line: string;
  station: string;
  direction: string;
};

export const TrainTimetables = {
  [TrainTimetableID.JrTsurumiLine_TsurumiOno_Tsurumi]: {
    id: TrainTimetableID.JrTsurumiLine_TsurumiOno_Tsurumi,
    line: "JR鶴見線",
    station: "鶴見小野",
    direction: "鶴見",
  },
  [TrainTimetableID.JrTsurumiLine_Tsurumi_TsurumiOno]: {
    id: TrainTimetableID.JrTsurumiLine_Tsurumi_TsurumiOno,
    line: "JR鶴見線",
    station: "鶴見",
    direction: "鶴見小野",
  },
  [TrainTimetableID.JrKeihinTohoku_Tsurumi_Tokyo]: {
    id: TrainTimetableID.JrKeihinTohoku_Tsurumi_Tokyo,
    line: "JR京浜東北線",
    station: "鶴見",
    direction: "東京",
  },
  [TrainTimetableID.JrKeihinTohoku_Tsurumi_Yokohama]: {
    id: TrainTimetableID.JrKeihinTohoku_Tsurumi_Yokohama,
    line: "JR京浜東北線",
    station: "鶴見",
    direction: "横浜",
  },
  [TrainTimetableID.KeikyuMain_KeikyuTsurumi_Shinagawa]: {
    id: TrainTimetableID.KeikyuMain_KeikyuTsurumi_Shinagawa,
    line: "京急本線",
    station: "京急鶴見",
    direction: "品川",
  },
  [TrainTimetableID.KeikyuMain_KeikyuTsurumi_Yokohama]: {
    id: TrainTimetableID.KeikyuMain_KeikyuTsurumi_Yokohama,
    line: "京急本線",
    station: "京急鶴見",
    direction: "横浜",
  },
  [TrainTimetableID.KeikyuMain_KagetsuSojiji_Shinagawa]: {
    id: TrainTimetableID.KeikyuMain_KagetsuSojiji_Shinagawa,
    line: "京急本線",
    station: "花月総持寺",
    direction: "品川",
  },
  [TrainTimetableID.KeikyuMain_KagetsuSojiji_Yokohama]: {
    id: TrainTimetableID.KeikyuMain_KagetsuSojiji_Yokohama,
    line: "京急本線",
    station: "花月総持寺",
    direction: "横浜",
  },
} as const satisfies Record<TrainTimetableID, TrainTimetable>;

