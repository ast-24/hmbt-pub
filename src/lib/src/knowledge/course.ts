export enum SubjectID {
  Japanese = "Japanese",
  Math = "Math",
  Science = "Science",
  SocialStudies = "SocialStudies",
  English = "English",
  ScienceLiteracy = "ScienceLiteracy",
  PhysicalEducation = "PhysicalEducation",
  LongHomeRoom = "LongHomeRoom",
}

export type Subject = {
  id: SubjectID;
  displayName: string;
};

export const Subjects = {
  [SubjectID.Japanese]: {
    id: SubjectID.Japanese,
    displayName: "国語",
  },
  [SubjectID.Math]: {
    id: SubjectID.Math,
    displayName: "数学",
  },
  [SubjectID.Science]: {
    id: SubjectID.Science,
    displayName: "理科",
  },
  [SubjectID.SocialStudies]: {
    id: SubjectID.SocialStudies,
    displayName: "社会",
  },
  [SubjectID.English]: {
    id: SubjectID.English,
    displayName: "英語",
  },
  [SubjectID.ScienceLiteracy]: {
    id: SubjectID.ScienceLiteracy,
    displayName: "サイエンスリテラシー",
  },
  [SubjectID.PhysicalEducation]: {
    id: SubjectID.PhysicalEducation,
    displayName: "保健体育",
  },
  [SubjectID.LongHomeRoom]: {
    id: SubjectID.LongHomeRoom,
    displayName: "LHR",
  },
} as const satisfies Record<SubjectID, Subject>;

export enum CourseID {
  LogicalJapanese = "LogicalJapanese",
  ModernLiteratureAdvancedExploration = "ModernLiteratureAdvancedExploration",
  ClassicalLiteratureAdvancedExploration = "ClassicalLiteratureAdvancedExploration",
  ClassicalLiteratureExploration = "ClassicalLiteratureExploration",
  EssayWritingResearch = "EssayWritingResearch",

  Math3 = "Math3",
  MathExploration = "MathExploration",
  MathResearch = "MathResearch",

  Physics = "Physics",
  Chemistry = "Chemistry",
  Biology = "Biology",
  EarthScience = "EarthScience",

  PhysicsExploration = "PhysicsExploration",
  ChemistryExploration = "ChemistryExploration",
  BiologyExploration = "BiologyExploration",
  EarthScienceExploration = "EarthScienceExploration",

  PhysicsResearch = "PhysicsResearch",
  ChemistryResearch = "ChemistryResearch",
  BiologyResearch = "BiologyResearch",
  EarthScienceResearch = "EarthScienceResearch",

  InformationResearch = "InformationResearch",

  WorldHistoryExploration = "WorldHistoryExploration",
  JapaneseHistoryExploration = "JapaneseHistoryExploration",
  GeographyExploration = "GeographyExploration",
  Ethics = "Ethics",
  PoliticalEconomics = "PoliticalEconomics",

  ComprehensionSkills = "ComprehensionSkills",
  ProductionSkills = "ProductionSkills",
  EnglishSyntaxExploration = "EnglishSyntaxExploration",
  EnglishSyntaxResearch = "EnglishSyntaxResearch",
  PracticalEnglish = "PracticalEnglish",

  ScienceLiteracy3 = "ScienceLiteracy3",

  PhysicalEducation = "PhysicalEducation",

  LongHomeRoom = "LongHomeRoom",
}

export type Course = {
  id: CourseID;
  displayName: string;
  shortDisplayName: string;
  subject: SubjectID;
};

// ※ shortDisplayNameは一意性が保証されない
// とはいえ重複させているのは同じ人が両方を取る可能性が限りなく低いか不可能なもののみ
// (同科目の研究と探求等)
export const Courses = {
  [CourseID.LogicalJapanese]: {
    id: CourseID.LogicalJapanese,
    displayName: "論理国語",
    shortDisplayName: "論国",
    subject: SubjectID.Japanese,
  },
  [CourseID.ModernLiteratureAdvancedExploration]: {
    id: CourseID.ModernLiteratureAdvancedExploration,
    displayName: "現代文発展探求",
    shortDisplayName: "現文",
    subject: SubjectID.Japanese,
  },
  [CourseID.ClassicalLiteratureAdvancedExploration]: {
    id: CourseID.ClassicalLiteratureAdvancedExploration,
    displayName: "古典発展探求",
    shortDisplayName: "古文",
    subject: SubjectID.Japanese,
  },
  [CourseID.ClassicalLiteratureExploration]: {
    id: CourseID.ClassicalLiteratureExploration,
    displayName: "古典研究",
    shortDisplayName: "古文",
    subject: SubjectID.Japanese,
  },
  [CourseID.EssayWritingResearch]: {
    id: CourseID.EssayWritingResearch,
    displayName: "小論文研究",
    shortDisplayName: "小論",
    subject: SubjectID.Japanese,
  },

  [CourseID.Math3]: {
    id: CourseID.Math3,
    displayName: "理数数学Ⅲ",
    shortDisplayName: "数Ⅲ",
    subject: SubjectID.Math,
  },
  [CourseID.MathExploration]: {
    id: CourseID.MathExploration,
    displayName: "理数数学探求",
    shortDisplayName: "数探",
    subject: SubjectID.Math,
  },
  [CourseID.MathResearch]: {
    id: CourseID.MathResearch,
    displayName: "理数数学研究",
    shortDisplayName: "数研",
    subject: SubjectID.Math,
  },

  [CourseID.Physics]: {
    id: CourseID.Physics,
    displayName: "理数物理",
    shortDisplayName: "物理",
    subject: SubjectID.Science,
  },
  [CourseID.Chemistry]: {
    id: CourseID.Chemistry,
    displayName: "理数化学",
    shortDisplayName: "化学",
    subject: SubjectID.Science,
  },
  [CourseID.Biology]: {
    id: CourseID.Biology,
    displayName: "理数生物",
    shortDisplayName: "生物",
    subject: SubjectID.Science,
  },
  [CourseID.EarthScience]: {
    id: CourseID.EarthScience,
    displayName: "理数地学",
    shortDisplayName: "地学",
    subject: SubjectID.Science,
  },

  [CourseID.PhysicsExploration]: {
    id: CourseID.PhysicsExploration,
    displayName: "理数物理探求",
    shortDisplayName: "物理",
    subject: SubjectID.Science,
  },
  [CourseID.ChemistryExploration]: {
    id: CourseID.ChemistryExploration,
    displayName: "理数化学探求",
    shortDisplayName: "化学",
    subject: SubjectID.Science,
  },
  [CourseID.BiologyExploration]: {
    id: CourseID.BiologyExploration,
    displayName: "理数生物探求",
    shortDisplayName: "生物",
    subject: SubjectID.Science,
  },
  [CourseID.EarthScienceExploration]: {
    id: CourseID.EarthScienceExploration,
    displayName: "理数地学探求",
    shortDisplayName: "地学",
    subject: SubjectID.Science,
  },

  [CourseID.PhysicsResearch]: {
    id: CourseID.PhysicsResearch,
    displayName: "理数物理研究",
    shortDisplayName: "物理",
    subject: SubjectID.Science,
  },
  [CourseID.ChemistryResearch]: {
    id: CourseID.ChemistryResearch,
    displayName: "理数化学研究",
    shortDisplayName: "化学",
    subject: SubjectID.Science,
  },
  [CourseID.BiologyResearch]: {
    id: CourseID.BiologyResearch,
    displayName: "理数生物研究",
    shortDisplayName: "生物",
    subject: SubjectID.Science,
  },
  [CourseID.EarthScienceResearch]: {
    id: CourseID.EarthScienceResearch,
    displayName: "理数地学研究",
    shortDisplayName: "地学",
    subject: SubjectID.Science,
  },

  [CourseID.InformationResearch]: {
    id: CourseID.InformationResearch,
    displayName: "理数情報研究",
    shortDisplayName: "情報",
    subject: SubjectID.Science,
  },

  [CourseID.WorldHistoryExploration]: {
    id: CourseID.WorldHistoryExploration,
    displayName: "世界史探求",
    shortDisplayName: "世界史",
    subject: SubjectID.SocialStudies,
  },
  [CourseID.JapaneseHistoryExploration]: {
    id: CourseID.JapaneseHistoryExploration,
    displayName: "日本史探求",
    shortDisplayName: "日本史",
    subject: SubjectID.SocialStudies,
  },
  [CourseID.GeographyExploration]: {
    id: CourseID.GeographyExploration,
    displayName: "地理探求",
    shortDisplayName: "地理",
    subject: SubjectID.SocialStudies,
  },
  [CourseID.Ethics]: {
    id: CourseID.Ethics,
    displayName: "倫理",
    shortDisplayName: "倫理",
    subject: SubjectID.SocialStudies,
  },
  [CourseID.PoliticalEconomics]: {
    id: CourseID.PoliticalEconomics,
    displayName: "政治経済",
    shortDisplayName: "政経",
    subject: SubjectID.SocialStudies,
  },

  [CourseID.ComprehensionSkills]: {
    id: CourseID.ComprehensionSkills,
    displayName: "ComprehensionSkills",
    shortDisplayName: "CSkills",
    subject: SubjectID.English,
  },
  [CourseID.ProductionSkills]: {
    id: CourseID.ProductionSkills,
    displayName: "ProductionSkills",
    shortDisplayName: "PSkills",
    subject: SubjectID.English,
  },
  [CourseID.EnglishSyntaxExploration]: {
    id: CourseID.EnglishSyntaxExploration,
    displayName: "英語構文探求",
    shortDisplayName: "英構文",
    subject: SubjectID.English,
  },
  [CourseID.EnglishSyntaxResearch]: {
    id: CourseID.EnglishSyntaxResearch,
    displayName: "英語構文研究",
    shortDisplayName: "英構文",
    subject: SubjectID.English,
  },
  [CourseID.PracticalEnglish]: {
    id: CourseID.PracticalEnglish,
    displayName: "PracticalEnglish",
    shortDisplayName: "PracEng",
    subject: SubjectID.English,
  },

  [CourseID.ScienceLiteracy3]: {
    id: CourseID.ScienceLiteracy3,
    displayName: "サイエンスリテラシーⅢ",
    shortDisplayName: "SL",
    subject: SubjectID.Science,
  },

  [CourseID.PhysicalEducation]: {
    id: CourseID.PhysicalEducation,
    displayName: "体育",
    shortDisplayName: "体育",
    subject: SubjectID.PhysicalEducation,
  },

  [CourseID.LongHomeRoom]: {
    id: CourseID.LongHomeRoom,
    displayName: "LHR",
    shortDisplayName: "LHR",
    subject: SubjectID.LongHomeRoom,
  },
} as const satisfies Record<CourseID, Course>;

// 4単位 = 選択ID 2つ分 の選択科目のリスト
// これに入っている場合は、AB/CD/EF/GH/IJの該当ペアの両方が同じ科目になる
// ※必修は3単位が混ざってたりもするため、このリストには含まれない
export const tyingSelectiveCoursePairs: CourseID[] = [
  CourseID.ClassicalLiteratureAdvancedExploration,
  CourseID.MathExploration,
  CourseID.Physics,
  CourseID.Chemistry,
  CourseID.Biology,
  CourseID.EarthScience,
  CourseID.PhysicsExploration,
  CourseID.ChemistryExploration,
  CourseID.BiologyExploration,
  CourseID.EarthScienceExploration,
  CourseID.WorldHistoryExploration,
  CourseID.JapaneseHistoryExploration,
  CourseID.GeographyExploration,
];
