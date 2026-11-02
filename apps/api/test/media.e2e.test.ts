import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootApp, Client, resetDatabase } from "./helpers.js";

let app: INestApplication;
let mediaDir: string;
let owner: Client;
let member: Client;
let outsider: Client;
let clanId: string;
let personId: string;

/** Ảnh JPEG 1200×800 có EXIF xoay 90° và toạ độ GPS — để kiểm tra xoay đúng và xoá metadata */
async function photoWithGps(): Promise<Buffer> {
  return sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 142, g: 43, b: 33 } } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExifMerge({ IFD0: { Make: "MayAnhRiengTu" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "21/1 1/1 0/1" } })
    .toBuffer();
}

it("ảnh thử có đúng EXIF xoay + GPS (để các kiểm tra bên dưới có ý nghĩa)", async () => {
  const meta = await sharp(await photoWithGps()).metadata();
  expect(meta.orientation).toBe(6);
  expect(meta.exif?.includes(Buffer.from("MayAnhRiengTu"))).toBe(true);
});

const upload = (c: Client, buf: Buffer, name = "anh.jpg", caption?: string) => {
  const req = c.agent.post(`/api/v1/clans/${clanId}/media`).set("X-CSRF-Token", c.csrf).attach("file", buf, name);
  return caption ? req.field("caption", caption) : req;
};

async function fetchImage(c: Client, url: string) {
  const res = await c.agent
    .get(url)
    .buffer(true)
    .parse((r, cb) => {
      const parts: Buffer[] = [];
      r.on("data", (d: Buffer) => parts.push(d));
      r.on("end", () => cb(null, Buffer.concat(parts)));
    });
  return res;
}

beforeAll(async () => {
  await resetDatabase();
  mediaDir = mkdtempSync(join(tmpdir(), "coinguon-media-"));
  app = await bootApp({ MEDIA_DIR: mediaDir, MEDIA_MAX_MB: "1" });
  owner = new Client(app);
  await owner.register("owner-media@example.com", "Chủ họ");
  clanId = (await owner.post("/clans", { name: "Họ Đặng", slug: "ho-dang", surname: "Đặng" })).body.id;
  personId = (await owner.post(`/clans/${clanId}/persons`, { fullName: "Đặng Văn Tổ", gender: "male", isLiving: false })).body.id;
  const inv = await owner.post(`/clans/${clanId}/invitations`, { role: "member" });
  member = new Client(app);
  await member.register("member-media@example.com", "Thành viên");
  await member.post(`/invitations/${inv.body.token}/accept`);
  outsider = new Client(app);
  await outsider.register("outsider-media@example.com", "Người ngoài");
  await outsider.post("/clans", { name: "Họ Khác", slug: "ho-khac-media", surname: "Khác" });
});
afterAll(async () => {
  await app.close();
  rmSync(mediaDir, { recursive: true, force: true });
});

describe("Tải ảnh lên", () => {
  let media: { id: string; width: number; height: number; urls: Record<string, string> };

  it("xoay theo EXIF, tạo đủ các cỡ, trả về đường dẫn", async () => {
    const res = await upload(owner, await photoWithGps(), "nha-tho.jpg", "Nhà thờ họ");
    expect(res.status).toBe(201);
    media = res.body;
    expect(media).toMatchObject({ width: 800, height: 1200, caption: "Nhà thờ họ" });
    expect(Object.keys(media.urls).sort()).toEqual(["lg", "md", "orig", "sm"]);
    expect(readdirSync(join(mediaDir, clanId, media.id)).sort()).toEqual(["lg.webp", "md.webp", "orig.jpg", "sm.webp"]);
  });

  it("file gốc tải về KHÔNG còn EXIF/GPS; ảnh nhỏ là WebP vuông 320", async () => {
    const orig = await fetchImage(owner, media.urls.orig!);
    expect(orig.status).toBe(200);
    expect(orig.headers["content-type"]).toContain("image/jpeg");
    const meta = await sharp(orig.body as Buffer).metadata();
    expect(meta.exif).toBeUndefined();
    expect([meta.width, meta.height]).toEqual([800, 1200]);

    const sm = await fetchImage(owner, media.urls.sm!);
    expect(sm.headers["content-type"]).toContain("image/webp");
    expect(sm.headers["cache-control"]).toContain("private");
    const smMeta = await sharp(sm.body as Buffer).metadata();
    expect([smMeta.format, smMeta.width, smMeta.height]).toEqual(["webp", 320, 320]);
  });

  it("thành viên xem được ảnh nhưng không tải lên được; người ngoài không xem được", async () => {
    expect((await fetchImage(member, media.urls.md!)).status).toBe(200);
    expect((await upload(member, await photoWithGps())).status).toBe(403);
    expect((await fetchImage(outsider, media.urls.md!)).status).toBe(404);
  });

  it("từ chối file không phải ảnh, thiếu file, ảnh quá dung lượng", async () => {
    const txt = await upload(owner, Buffer.from("day khong phai la anh"), "virus.jpg");
    expect(txt.status).toBe(422);
    expect(txt.body.code).toBe("UNSUPPORTED_IMAGE");

    const none = await owner.agent.post(`/api/v1/clans/${clanId}/media`).set("X-CSRF-Token", owner.csrf).field("caption", "x");
    expect(none.status).toBe(422);
    expect(none.body.code).toBe("FILE_REQUIRED");

    // ảnh nhiễu ngẫu nhiên ~3 MB > giới hạn 1 MB của bản test
    const noise = Buffer.alloc(1000 * 1000 * 3);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) >>> 24;
    const big = await sharp(noise, { raw: { width: 1000, height: 1000, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
    const tooBig = await upload(owner, big, "to.png");
    expect(tooBig.status).toBe(413);
    expect(tooBig.body.code).toBe("FILE_TOO_LARGE");
  });

  it("biến thể không hợp lệ / thử thoát thư mục → lỗi, không đọc file ngoài", async () => {
    expect((await owner.get(`/clans/${clanId}/media/${media.id}/..%2F..%2Fetc`)).status).toBe(422);
    expect((await owner.get(`/clans/${clanId}/media/khong-phai-uuid/sm`)).status).toBe(422);
  });

  it("ảnh chân dung: đặt cho người, hiện trên phả đồ; xoá ảnh thì gỡ khỏi người và xoá file", async () => {
    const set = await owner.put(`/clans/${clanId}/persons/${personId}/avatar`, { mediaId: media.id });
    expect(set.status).toBe(200);
    expect(set.body.avatarMediaId).toBe(media.id);
    const tree = await owner.get(`/clans/${clanId}/tree`);
    expect(tree.body.nodes[0].person).toMatchObject({ hasAvatar: true, avatarMediaId: media.id });

    expect((await member.put(`/clans/${clanId}/persons/${personId}/avatar`, { mediaId: null })).status).toBe(403);

    expect((await owner.delete(`/clans/${clanId}/media/${media.id}`)).status).toBe(204);
    expect(existsSync(join(mediaDir, clanId, media.id))).toBe(false);
    expect((await owner.get(`/clans/${clanId}/persons/${personId}`)).body.avatarMediaId).toBeNull();
    expect((await owner.get(`/clans/${clanId}/media/${media.id}/sm`)).status).toBe(404);
  });

  it("ảnh của dòng họ khác không đặt làm chân dung được", async () => {
    const otherClan = (await outsider.get("/me/clans")).body[0].id;
    const res = await outsider.agent
      .post(`/api/v1/clans/${otherClan}/media`)
      .set("X-CSRF-Token", outsider.csrf)
      .attach("file", await photoWithGps(), "a.jpg");
    expect(res.status).toBe(201);
    const steal = await owner.put(`/clans/${clanId}/persons/${personId}/avatar`, { mediaId: res.body.id });
    expect(steal.status).toBe(422);
    expect(steal.body.code).toBe("MEDIA_NOT_FOUND");
  });
});

describe("Trang chủ: banner, câu đối", () => {
  it("mặc định trống, có thống kê", async () => {
    const res = await member.get(`/clans/${clanId}/site/home`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ banners: [], couplet: null, motto: null, templeAddress: null, stats: { people: 1, generations: 1 } });
  });

  it("quản trị đặt nhiều banner theo thứ tự + câu đối; ảnh xoá thì tự rơi khỏi banner", async () => {
    const a = (await upload(owner, await photoWithGps(), "a.jpg", "Nhà thờ họ")).body;
    const b = (await upload(owner, await photoWithGps(), "b.jpg")).body;
    const put = await owner.put(`/clans/${clanId}/site/home`, {
      banners: [{ mediaId: b.id, caption: "Lễ giỗ tổ" }, { mediaId: a.id }],
      couplet: { left: "Tổ tiên công đức muôn đời thịnh", right: "Con cháu đoàn kết vạn đại vinh" },
      motto: "Uống nước nhớ nguồn",
    });
    expect(put.status).toBe(200);
    expect(put.body.banners.map((x: { id: string; caption: string }) => [x.id, x.caption])).toEqual([
      [b.id, "Lễ giỗ tổ"],
      [a.id, "Nhà thờ họ"],
    ]);
    expect(put.body.couplet.left).toBe("Tổ tiên công đức muôn đời thịnh");

    await owner.delete(`/clans/${clanId}/media/${b.id}`);
    const after = await member.get(`/clans/${clanId}/site/home`);
    expect(after.body.banners.map((x: { id: string }) => x.id)).toEqual([a.id]);
    expect(after.body.motto).toBe("Uống nước nhớ nguồn");
  });

  it("chỉ quản trị sửa được; ảnh không tồn tại bị từ chối", async () => {
    expect((await member.put(`/clans/${clanId}/site/home`, { banners: [], couplet: null, motto: null })).status).toBe(403);
    const bad = await owner.put(`/clans/${clanId}/site/home`, {
      banners: [{ mediaId: "00000000-0000-4000-8000-000000000000" }],
      couplet: null,
      motto: null,
    });
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe("MEDIA_NOT_FOUND");
  });
});
