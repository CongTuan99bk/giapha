/**
 * Tạo dữ liệu GIẢ để chạy thử: 1 tài khoản chủ sở hữu, 1 dòng họ, ~60 người qua 6 đời.
 * Tên người, tên làng đều bịa — không phải dữ liệu thật.
 *
 *   pnpm --filter @coinguon/api seed
 *   (cần APP_DATABASE_URL, PLATFORM_DATABASE_URL; tuỳ chọn SEED_EMAIL, SEED_PASSWORD)
 *
 * Chỉ chạy khi hệ thống CHƯA có dòng họ nào (không bao giờ ghi đè dữ liệu thật).
 */
import "reflect-metadata";
import { randomBytes } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { PersonCreateInput } from "@coinguon/schemas";
import { AppModule } from "./app.module.js";
import { AuthService } from "./auth/auth.service.js";
import { ClansService } from "./clans/clans.service.js";
import { loadConfig } from "./config.js";
import { Database, type Tx } from "./db/database.js";
import { MediaService } from "./media/media.service.js";
import { PersonsService } from "./persons/persons.service.js";
import { sampleBanners } from "./seed-art.js";
import { SiteService } from "./site/site.service.js";

/** PRNG có hạt giống — chạy lại cho ra cùng một cây. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MALE_NAMES = ["Thành", "Đức", "Minh", "Quang", "Hùng", "Phúc", "Lộc", "Khang", "Tín", "Nghĩa", "Bảo", "Huy", "Long", "Sơn", "Trung", "Vinh"];
const FEMALE_NAMES = ["Lan", "Huệ", "Cúc", "Mai", "Hạnh", "Thảo", "Liên", "Nga", "Trâm", "Vy", "Hoa", "Ngân", "Yến", "Diệp"];
const OTHER_SURNAMES = ["Trần", "Lê", "Hồ", "Võ", "Đặng", "Huỳnh", "Ngô", "Bùi", "Tôn", "Hoàng"];
const SURNAME = "Phan";
const MIDDLE = ["Văn", "Đình", "Hữu", "Công"]; // tên đệm theo đời (giả)

export interface SeedResult {
  email: string;
  password: string;
  clanId: string;
  personCount: number;
}

export async function seed(opts: { email: string; password: string; generations?: number }): Promise<SeedResult> {
  const config = loadConfig();
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(config), { logger: ["error"] });
  try {
    const db = app.get(Database);
    const existing = await db.app.selectFrom("clans").select("id").executeTakeFirst();
    if (existing) throw new Error("Hệ thống đã có dòng họ — seed chỉ chạy trên database trống.");

    const { user } = await app.get(AuthService).register({ email: opts.email, password: opts.password, name: "Ban quản lý (dữ liệu mẫu)" });
    const clan = await app.get(ClansService).create(user.id, {
      name: "Họ Phan Văn – làng Mẫu (dữ liệu giả)",
      slug: "ho-phan-mau",
      surname: SURNAME,
      originPlace: "Làng Mẫu, tỉnh Thử Nghiệm (địa danh giả)",
    });
    const persons = app.get(PersonsService);
    const rand = mulberry32(1945);
    const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
    const actor = { clanId: clan.id, userId: user.id };
    const maxGen = opts.generations ?? 6;
    let count = 0;

    const lifeDates = (birthYear: number): Pick<PersonCreateInput, "isLiving" | "birthDate" | "deathDate"> => {
      const age = 55 + Math.floor(rand() * 35);
      const deathYear = birthYear + age;
      const living = deathYear > 2025;
      const birthDate =
        birthYear < 1900
          ? { calendar: "solar" as const, precision: "approx" as const, year: birthYear }
          : { calendar: "solar" as const, precision: "year" as const, year: birthYear };
      if (living) return { isLiving: true, birthDate, deathDate: null };
      // Đời trước hay ghi ngày mất theo âm lịch; đời sau theo dương lịch
      const deathDate =
        deathYear < 1960
          ? { calendar: "lunar" as const, precision: "day" as const, year: deathYear, month: 1 + Math.floor(rand() * 12), day: 1 + Math.floor(rand() * 29) }
          : { calendar: "solar" as const, precision: "day" as const, year: deathYear, month: 1 + Math.floor(rand() * 12), day: 1 + Math.floor(rand() * 28) };
      return { isLiving: false, birthDate, deathDate };
    };

    const male = (gen: number, given: string, birthYear: number): PersonCreateInput => ({
      fullName: `${SURNAME} ${MIDDLE[(gen - 1) % MIDDLE.length]} ${given}`,
      gender: "male",
      otherNames: [],
      ...lifeDates(birthYear),
    });
    const female = (surname: string, given: string, birthYear: number): PersonCreateInput => ({
      fullName: `${surname} Thị ${given}`,
      gender: "female",
      otherNames: [],
      ...lifeDates(birthYear),
    });

    await db.withClan(actor, async (trx: Tx) => {
      const grow = async (personId: string, gen: number, birthYear: number) => {
        if (gen >= maxGen) return;
        const wife = await persons.addSpouse(trx, actor, personId, {
          type: "marriage",
          person: female(pick(OTHER_SURNAMES), pick(FEMALE_NAMES), birthYear + 2 + Math.floor(rand() * 4)),
        });
        count++;
        // Đời đầu đông con hơn, đời sau ít dần để cây vừa phải (~60 người)
        const kids = gen <= 2 ? 3 : gen === 3 ? 2 : 1 + Math.floor(rand() * 2);
        let year = birthYear + 22 + Math.floor(rand() * 6);
        for (let i = 0; i < kids; i++) {
          const isSon = i === 0 || rand() < 0.55;
          const child = await persons.addChild(trx, actor, personId, {
            unionId: wife.unionId,
            relation: "biological",
            person: isSon ? male(gen + 1, pick(MALE_NAMES), year) : female(SURNAME, pick(FEMALE_NAMES), year),
          });
          count++;
          // Chỉ con trai nối dõi tiếp (phụ hệ); con gái lấy chồng ngoài họ
          if (isSon && (i === 0 || gen < 4)) await grow(child.person.id, gen + 1, year);
          year += 2 + Math.floor(rand() * 4);
        }
      };

      const root = await persons.create(trx, actor, {
        ...male(1, "Mẫu", 1858),
        otherNames: [{ type: "hieu", value: "Phúc Hậu (giả)" }],
        isLiving: false,
        birthDate: { calendar: "lunar", precision: "approx", year: 1858 },
        deathDate: { calendar: "lunar", precision: "day", year: 1926, month: 3, day: 12 },
      });
      count++;
      await grow(root.id, 1, 1858);
    });

    // Trang chủ: 3 ảnh banner minh hoạ tự vẽ + câu đối dân gian + khẩu hiệu
    const owner = { ...actor, memberId: "", role: "owner" as const, personId: null };
    const art = await sampleBanners();
    await db.withClan(actor, async (trx: Tx) => {
      const media = app.get(MediaService);
      const uploaded = [];
      for (const a of art) uploaded.push(await media.upload(trx, owner, a.data, a.caption));
      await app.get(SiteService).updateHome(trx, owner, {
        banners: uploaded.map((m) => ({ mediaId: m.id })),
        couplet: { left: "Cây có cội mới nảy cành xanh lá", right: "Nước có nguồn mới bể rộng sông sâu" },
        motto: "Uống nước nhớ nguồn",
      });
    });

    return { email: opts.email, password: opts.password, clanId: clan.id, personCount: count };
  } finally {
    await app.close();
  }
}

// Chạy trực tiếp: node dist/seed.js
if (import.meta.url === `file://${process.argv[1]}`) {
  const email = process.env.SEED_EMAIL || "quanly@giapha.test";
  const password = process.env.SEED_PASSWORD || randomBytes(9).toString("base64url");
  seed({ email, password })
    .then((r) => {
      console.log(`Đã tạo dữ liệu mẫu: ${r.personCount} người.`);
      console.log(`Đăng nhập bằng: ${r.email} / ${r.password}`);
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    });
}
