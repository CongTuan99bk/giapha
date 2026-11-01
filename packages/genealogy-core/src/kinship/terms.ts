/**
 * Bảng xưng hô dạng dữ liệu (BR-KIN-02, FR-KIN-02).
 *
 * LƯU Ý (KI-001): bảng này là bản khởi đầu, CHƯA được người am hiểu gia phả duyệt.
 * Cách gọi khác nhau giữa các vùng và cả giữa các gia đình; mọi thay đổi ở đây
 * phải đi kèm cập nhật bộ test `test/kinship.test.ts`.
 */
export type KinshipVariant = "bac" | "trung" | "nam";

export interface KinshipTerms {
  /** Đã được người am hiểu duyệt hay chưa */
  reviewed: boolean;
  father: string;
  mother: string;
  husband: string;
  wife: string;
  /** Tổ tiên trực hệ theo khoảng cách đời: [1] cha/mẹ dùng riêng, 2 = ông/bà, 3 = cụ, 4 = kỵ */
  grandfather: string;
  grandmother: string;
  greatGrandparent: string;
  greatGreatGrandparent: string;
  /** Hậu duệ theo khoảng cách đời: 1 con, 2 cháu, 3 chắt, 4 chút, 5 chít */
  descendants: readonly [string, string, string, string, string];
  olderBrother: string;
  olderSister: string;
  younger: string;
  /** Anh/chị/em của cha */
  paternal: { elderMale: string; elderFemale: string; youngerMale: string; youngerFemale: string };
  /** Anh/chị/em của mẹ */
  maternal: { elderMale: string; elderFemale: string; youngerMale: string; youngerFemale: string };
  /** Vợ/chồng của người được gọi bằng các từ trên */
  spouseOf: Record<string, { ifMale?: string; ifFemale?: string }>;
}

const BAC: KinshipTerms = {
  reviewed: false,
  father: "bố",
  mother: "mẹ",
  husband: "chồng",
  wife: "vợ",
  grandfather: "ông",
  grandmother: "bà",
  greatGrandparent: "cụ",
  greatGreatGrandparent: "kỵ",
  descendants: ["con", "cháu", "chắt", "chút", "chít"],
  olderBrother: "anh",
  olderSister: "chị",
  younger: "em",
  paternal: { elderMale: "bác", elderFemale: "bác", youngerMale: "chú", youngerFemale: "cô" },
  maternal: { elderMale: "bác", elderFemale: "bác", youngerMale: "cậu", youngerFemale: "dì" },
  spouseOf: {
    bác: { ifMale: "bác gái", ifFemale: "bác trai" },
    chú: { ifMale: "thím" },
    cô: { ifFemale: "chú" },
    cậu: { ifMale: "mợ" },
    dì: { ifFemale: "chú" },
  },
};

const NAM: KinshipTerms = {
  ...BAC,
  father: "ba",
  mother: "má",
  // Miền Nam: chị của cha gọi cô, anh/chị của mẹ gọi cậu/dì như em của mẹ
  paternal: { elderMale: "bác", elderFemale: "cô", youngerMale: "chú", youngerFemale: "cô" },
  maternal: { elderMale: "cậu", elderFemale: "dì", youngerMale: "cậu", youngerFemale: "dì" },
  spouseOf: {
    bác: { ifMale: "bác gái", ifFemale: "bác trai" },
    chú: { ifMale: "thím" },
    cô: { ifFemale: "dượng" },
    cậu: { ifMale: "mợ" },
    dì: { ifFemale: "dượng" },
  },
};

/** Miền Trung: tạm dùng bảng miền Bắc với cha/mẹ gọi "ba/mạ" — cần người am hiểu bổ sung. */
const TRUNG: KinshipTerms = { ...BAC, father: "ba", mother: "mạ" };

export const KINSHIP_TERMS: Readonly<Record<KinshipVariant, KinshipTerms>> = {
  bac: BAC,
  trung: TRUNG,
  nam: NAM,
};
