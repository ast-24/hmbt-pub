export enum RoomRidge {
  Study = "Study",
  Exchange = "Exchange",
  Ground = "Ground",
}

export enum RoomID {
  // 学習棟 1F

  CaligraphyRoom = "CalligraphyRoom",
  ArtAndCraftRoom = "ArtAndCraftRoom",
  MetalWoodWorkingRoom = "MetalWoodWorkingRoom",
  CookingRoom = "CookingRoom",
  SewingRoom = "SewingRoom",
  C11 = "C11",
  C12 = "C12",
  MusicRoom = "MusicRoom",
  AudioVisualRoom = "AudioVisualRoom",
  EnvironmentalScienceLab = "EnvironmentalScienceLab",
  AnalysisLab1 = "AnalysisLab1",
  AnalysisLab2 = "AnalysisLab2",
  ElectronMicroscopeLab1 = "ElectronMicroscopeLab1",
  ElectronMicroscopeLab2 = "ElectronMicroscopeLab2",
  NanometerialObservationRoom = "NanometerialObservationRoom",
  NanomaterialGenerationLab = "NanomaterialGenerationLab",
  FieldworkLab = "FieldworkLab",

  // 学習棟 2F

  Call1 = "Call1",
  Call2 = "Call2",
  Call3 = "Call3",
  Call4 = "Call4",
  PresentationStudio1 = "PresentationStudio1",
  PresentationStudio2 = "PresentationStudio2",
  C21 = "C21",
  C22 = "C22",
  C23 = "C23",
  N21 = "N21",
  N22 = "N22",
  S21 = "S21",
  StudyHall1 = "StudyHall1",
  StudyHall2 = "StudyHall2",
  ITFoundationLab = "ITFoundationLab",
  PCHardwareLab = "PCHardwareLab",
  ComputerRoom1 = "ComputerRoom1",
  ComputerRoom2 = "ComputerRoom2",
  ComputerRoom3 = "ComputerRoom3",
  ProgrammingLab1 = "ProgrammingLab1",
  ProgrammingLab2 = "ProgrammingLab2",
  MultimediaLab = "MultimediaLab",
  Library = "Library",
  MeetingRoom1 = "MeetingRoom1",
  MeetingRoom2 = "MeetingRoom2",
  MeetingRoom3 = "MeetingRoom3",

  // 学習棟 3F

  ChemistryLab1 = "ChemistryLab1",
  ChemistryLab2 = "ChemistryLab2",
  PhysicsLab = "PhysicsLab",
  EarthScienceLab = "EarthScienceLab",
  BiologyLab1 = "BiologyLab1",
  BiologyLab2 = "BiologyLab2",
  LectureRoom = "LectureRoom",
  ScienceResearchLab = "ScienceResearchLab",
  N31 = "N31",
  N32 = "N32",
  C31 = "C31",
  C32 = "C32",
  CleanBenchRoom = "CleanBenchRoom",
  EnvironmentalBioscienceLab = "EnvironmentalBioscienceLab",
  LowTemperatureLab = "LowTemperatureLab",
  LifeScienceLab = "LifeScienceLab",
  S31 = "S31",
  S32 = "S32",
  S33 = "S33",
  S34 = "S34",
  S35 = "S35",
  S36 = "S36",
  S37 = "S37",
  S38 = "S38",

  // 学習棟 4F

  S41 = "S41",
  S42 = "S42",
  S43 = "S43",
  S44 = "S44",
  S45 = "S45",
  S46 = "S46",
  S47 = "S47",
  S48 = "S48",

  // 学習棟 5F

  S51 = "S51",
  S52 = "S52",
  S53 = "S53",
  S54 = "S54",
  S55 = "S55",
  S56 = "S56",
  S57 = "S57",
  S58 = "S58",

  // 交流棟 1F

  Hall = "Hall",
  ExchangeCenter = "ExchangeCenter",
  JudoKendoRoom = "JudoKendoRoom",

  // 交流棟 2F

  HealthLectureRoom = "HealthLectureRoom",
  Arena = "Arena",

  // グラウンド

  Ground = "Ground",
}

export type Room = {
  id: RoomID;
  displayName: string;
  ridge: RoomRidge;
  floor?: number;
};

export const Rooms = {
  // 学習棟 1F
  CalligraphyRoom: {
    id: RoomID.CaligraphyRoom,
    displayName: "書道室",
    ridge: RoomRidge.Study,
    floor: 1,
  },
  ArtAndCraftRoom: {
    id: RoomID.ArtAndCraftRoom,
    displayName: "美術工芸室",
    ridge: RoomRidge.Study,
    floor: 1,
  },
  MetalWoodWorkingRoom: {
    id: RoomID.MetalWoodWorkingRoom,
    displayName: "金工木工室",
    ridge: RoomRidge.Study,
    floor: 1,
  },
  CookingRoom: {
    id: RoomID.CookingRoom,
    displayName: "調理室",
    ridge: RoomRidge.Study,
    floor: 1,
  },
  SewingRoom: {
    id: RoomID.SewingRoom,
    displayName: "被服室",
    ridge: RoomRidge.Study,
    floor: 1,
  },
  C11: {
    id: RoomID.C11,
    displayName: "C11",
    ridge: RoomRidge.Study,
    floor: 1,
  },
  C12: {
    id: RoomID.C12,
    displayName: "C12",
    ridge: RoomRidge.Study,
    floor: 1,
  },
  MusicRoom: {
    id: RoomID.MusicRoom,
    displayName: "音楽室",
    ridge: RoomRidge.Study,
    floor: 1,
  },
  AudioVisualRoom: {
    id: RoomID.AudioVisualRoom,
    displayName: "視聴覚室",
    ridge: RoomRidge.Study,
    floor: 1,
  },
  EnvironmentalScienceLab: {
    id: RoomID.EnvironmentalScienceLab,
    displayName: "環境実験室",
    ridge: RoomRidge.Study,
    floor: 1,
  },
  AnalysisLab1: {
    id: RoomID.AnalysisLab1,
    displayName: "分析室1",
    ridge: RoomRidge.Study,
    floor: 1,
  },
  AnalysisLab2: {
    id: RoomID.AnalysisLab2,
    displayName: "分析室2",
    ridge: RoomRidge.Study,
    floor: 1,
  },
  ElectronMicroscopeLab1: {
    id: RoomID.ElectronMicroscopeLab1,
    displayName: "電子顕微鏡室1",
    ridge: RoomRidge.Study,
    floor: 1,
  },
  ElectronMicroscopeLab2: {
    id: RoomID.ElectronMicroscopeLab2,
    displayName: "電子顕微鏡室2",
    ridge: RoomRidge.Study,
    floor: 1,
  },
  NanometerialObservationRoom: {
    id: RoomID.NanometerialObservationRoom,
    displayName: "ナノ材料評価室",
    ridge: RoomRidge.Study,
    floor: 1,
  },
  NanomaterialGenerationLab: {
    id: RoomID.NanomaterialGenerationLab,
    displayName: "ナノ材料創製室",
    ridge: RoomRidge.Study,
    floor: 1,
  },
  FieldworkLab: {
    id: RoomID.FieldworkLab,
    displayName: "屋外実習室",
    ridge: RoomRidge.Study,
    floor: 1,
  },

  // 学習棟 2F
  Call1: {
    id: RoomID.Call1,
    displayName: "CALL教室1",
    ridge: RoomRidge.Study,
    floor: 2,
  },
  Call2: {
    id: RoomID.Call2,
    displayName: "CALL教室2",
    ridge: RoomRidge.Study,
    floor: 2,
  },
  Call3: {
    id: RoomID.Call3,
    displayName: "CALL教室3",
    ridge: RoomRidge.Study,
    floor: 2,
  },
  Call4: {
    id: RoomID.Call4,
    displayName: "CALL教室4",
    ridge: RoomRidge.Study,
    floor: 2,
  },
  PresentationStudio1: {
    id: RoomID.PresentationStudio1,
    displayName: "プレゼンテーションスタジオ1",
    ridge: RoomRidge.Study,
    floor: 2,
  },
  PresentationStudio2: {
    id: RoomID.PresentationStudio2,
    displayName: "プレゼンテーションスタジオ2",
    ridge: RoomRidge.Study,
    floor: 2,
  },
  C21: {
    id: RoomID.C21,
    displayName: "C21",
    ridge: RoomRidge.Study,
    floor: 2,
  },
  C22: {
    id: RoomID.C22,
    displayName: "C22",
    ridge: RoomRidge.Study,
    floor: 2,
  },
  C23: {
    id: RoomID.C23,
    displayName: "C23",
    ridge: RoomRidge.Study,
    floor: 2,
  },
  N21: {
    id: RoomID.N21,
    displayName: "N21",
    ridge: RoomRidge.Study,
    floor: 2,
  },
  N22: {
    id: RoomID.N22,
    displayName: "N22",
    ridge: RoomRidge.Study,
    floor: 2,
  },
  S21: {
    id: RoomID.S21,
    displayName: "S21",
    ridge: RoomRidge.Study,
    floor: 2,
  },
  StudyHall1: {
    id: RoomID.StudyHall1,
    displayName: "自習室1",
    ridge: RoomRidge.Study,
    floor: 2,
  },
  StudyHall2: {
    id: RoomID.StudyHall2,
    displayName: "自習室2",
    ridge: RoomRidge.Study,
    floor: 2,
  },
  ITFoundationLab: {
    id: RoomID.ITFoundationLab,
    displayName: "情報基礎実習室",
    ridge: RoomRidge.Study,
    floor: 2,
  },
  PCHardwareLab: {
    id: RoomID.PCHardwareLab,
    displayName: "ハードウェア実習室",
    ridge: RoomRidge.Study,
    floor: 2,
  },
  ComputerRoom1: {
    id: RoomID.ComputerRoom1,
    displayName: "情報教室1",
    ridge: RoomRidge.Study,
    floor: 2,
  },
  ComputerRoom2: {
    id: RoomID.ComputerRoom2,
    displayName: "情報教室2",
    ridge: RoomRidge.Study,
    floor: 2,
  },
  ComputerRoom3: {
    id: RoomID.ComputerRoom3,
    displayName: "情報教室3",
    ridge: RoomRidge.Study,
    floor: 2,
  },
  ProgrammingLab1: {
    id: RoomID.ProgrammingLab1,
    displayName: "プログラミング実習室1",
    ridge: RoomRidge.Study,
    floor: 2,
  },
  ProgrammingLab2: {
    id: RoomID.ProgrammingLab2,
    displayName: "プログラミング実習室2",
    ridge: RoomRidge.Study,
    floor: 2,
  },
  MultimediaLab: {
    id: RoomID.MultimediaLab,
    displayName: "マルチメディア実習室",
    ridge: RoomRidge.Study,
    floor: 2,
  },
  Library: {
    id: RoomID.Library,
    displayName: "図書室",
    ridge: RoomRidge.Study,
    floor: 2,
  },
  MeetingRoom1: {
    id: RoomID.MeetingRoom1,
    displayName: "大会議室",
    ridge: RoomRidge.Study,
    floor: 2,
  },
  MeetingRoom2: {
    id: RoomID.MeetingRoom2,
    displayName: "中会議室",
    ridge: RoomRidge.Study,
    floor: 2,
  },
  MeetingRoom3: {
    id: RoomID.MeetingRoom3,
    displayName: "小会議室",
    ridge: RoomRidge.Study,
    floor: 2,
  },

  // 学習棟 3F
  ChemistryLab1: {
    id: RoomID.ChemistryLab1,
    displayName: "化学実験室1",
    ridge: RoomRidge.Study,
    floor: 3,
  },
  ChemistryLab2: {
    id: RoomID.ChemistryLab2,
    displayName: "化学実験室2",
    ridge: RoomRidge.Study,
    floor: 3,
  },
  PhysicsLab: {
    id: RoomID.PhysicsLab,
    displayName: "物理実験室",
    ridge: RoomRidge.Study,
    floor: 3,
  },
  EarthScienceLab: {
    id: RoomID.EarthScienceLab,
    displayName: "地学実験室",
    ridge: RoomRidge.Study,
    floor: 3,
  },
  BiologyLab1: {
    id: RoomID.BiologyLab1,
    displayName: "生物実験室1",
    ridge: RoomRidge.Study,
    floor: 3,
  },
  BiologyLab2: {
    id: RoomID.BiologyLab2,
    displayName: "生物実験室2",
    ridge: RoomRidge.Study,
    floor: 3,
  },
  LectureRoom: {
    id: RoomID.LectureRoom,
    displayName: "レクチャールーム",
    ridge: RoomRidge.Study,
    floor: 3,
  },
  ScienceResearchLab: {
    id: RoomID.ScienceResearchLab,
    displayName: "理科研究室",
    ridge: RoomRidge.Study,
    floor: 3,
  },
  N31: {
    id: RoomID.N31,
    displayName: "N31",
    ridge: RoomRidge.Study,
    floor: 3,
  },
  N32: {
    id: RoomID.N32,
    displayName: "N32",
    ridge: RoomRidge.Study,
    floor: 3,
  },
  C31: {
    id: RoomID.C31,
    displayName: "C31",
    ridge: RoomRidge.Study,
    floor: 3,
  },
  C32: {
    id: RoomID.C32,
    displayName: "C32",
    ridge: RoomRidge.Study,
    floor: 3,
  },
  CleanBenchRoom: {
    id: RoomID.CleanBenchRoom,
    displayName: "クリーンベンチルーム",
    ridge: RoomRidge.Study,
    floor: 3,
  },
  EnvironmentalBioscienceLab: {
    id: RoomID.EnvironmentalBioscienceLab,
    displayName: "環境生命実験室",
    ridge: RoomRidge.Study,
    floor: 3,
  },
  LowTemperatureLab: {
    id: RoomID.LowTemperatureLab,
    displayName: "低温実験室",
    ridge: RoomRidge.Study,
    floor: 3,
  },
  LifeScienceLab: {
    id: RoomID.LifeScienceLab,
    displayName: "生命科学実験室",
    ridge: RoomRidge.Study,
    floor: 3,
  },
  S31: {
    id: RoomID.S31,
    displayName: "S31",
    ridge: RoomRidge.Study,
    floor: 3,
  },
  S32: {
    id: RoomID.S32,
    displayName: "S32",
    ridge: RoomRidge.Study,
    floor: 3,
  },
  S33: {
    id: RoomID.S33,
    displayName: "S33",
    ridge: RoomRidge.Study,
    floor: 3,
  },
  S34: {
    id: RoomID.S34,
    displayName: "S34",
    ridge: RoomRidge.Study,
    floor: 3,
  },
  S35: {
    id: RoomID.S35,
    displayName: "S35",
    ridge: RoomRidge.Study,
    floor: 3,
  },
  S36: {
    id: RoomID.S36,
    displayName: "S36",
    ridge: RoomRidge.Study,
    floor: 3,
  },
  S37: {
    id: RoomID.S37,
    displayName: "S37",
    ridge: RoomRidge.Study,
    floor: 3,
  },
  S38: {
    id: RoomID.S38,
    displayName: "S38",
    ridge: RoomRidge.Study,
    floor: 3,
  },

  // 学習棟 4F
  S41: {
    id: RoomID.S41,
    displayName: "S41",
    ridge: RoomRidge.Study,
    floor: 4,
  },
  S42: {
    id: RoomID.S42,
    displayName: "S42",
    ridge: RoomRidge.Study,
    floor: 4,
  },
  S43: {
    id: RoomID.S43,
    displayName: "S43",
    ridge: RoomRidge.Study,
    floor: 4,
  },
  S44: {
    id: RoomID.S44,
    displayName: "S44",
    ridge: RoomRidge.Study,
    floor: 4,
  },
  S45: {
    id: RoomID.S45,
    displayName: "S45",
    ridge: RoomRidge.Study,
    floor: 4,
  },
  S46: {
    id: RoomID.S46,
    displayName: "S46",
    ridge: RoomRidge.Study,
    floor: 4,
  },
  S47: {
    id: RoomID.S47,
    displayName: "S47",
    ridge: RoomRidge.Study,
    floor: 4,
  },
  S48: {
    id: RoomID.S48,
    displayName: "S48",
    ridge: RoomRidge.Study,
    floor: 4,
  },

  // 学習棟 5F
  S51: {
    id: RoomID.S51,
    displayName: "S51",
    ridge: RoomRidge.Study,
    floor: 5,
  },
  S52: {
    id: RoomID.S52,
    displayName: "S52",
    ridge: RoomRidge.Study,
    floor: 5,
  },
  S53: {
    id: RoomID.S53,
    displayName: "S53",
    ridge: RoomRidge.Study,
    floor: 5,
  },
  S54: {
    id: RoomID.S54,
    displayName: "S54",
    ridge: RoomRidge.Study,
    floor: 5,
  },
  S55: {
    id: RoomID.S55,
    displayName: "S55",
    ridge: RoomRidge.Study,
    floor: 5,
  },
  S56: {
    id: RoomID.S56,
    displayName: "S56",
    ridge: RoomRidge.Study,
    floor: 5,
  },
  S57: {
    id: RoomID.S57,
    displayName: "S57",
    ridge: RoomRidge.Study,
    floor: 5,
  },
  S58: {
    id: RoomID.S58,
    displayName: "S58",
    ridge: RoomRidge.Study,
    floor: 5,
  },

  // 交流棟 1F
  Hall: {
    id: RoomID.Hall,
    displayName: "ホール",
    ridge: RoomRidge.Exchange,
    floor: 1,
  },
  ExchangeCenter: {
    id: RoomID.ExchangeCenter,
    displayName: "交流センター",
    ridge: RoomRidge.Exchange,
    floor: 1,
  },
  JudoKendoRoom: {
    id: RoomID.JudoKendoRoom,
    displayName: "柔剣道場",
    ridge: RoomRidge.Exchange,
    floor: 1,
  },

  // 交流棟 2F
  HealthLectureRoom: {
    id: RoomID.HealthLectureRoom,
    displayName: "保健講義室",
    ridge: RoomRidge.Exchange,
    floor: 2,
  },
  Arena: {
    id: RoomID.Arena,
    displayName: "アリーナ",
    ridge: RoomRidge.Exchange,
    floor: 2,
  },

  // グラウンド
  Ground: {
    id: RoomID.Ground,
    displayName: "グラウンド",
    ridge: RoomRidge.Ground,
  },
} as const satisfies Record<RoomID, Room>;
