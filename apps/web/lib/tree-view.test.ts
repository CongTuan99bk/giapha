import { describe, expect, it } from "vitest";
import { fitView, focusView, generationRows, MAX_ZOOM, visibleNodes, wrapName, zoomAt } from "./tree-view";
import type { TreeNode } from "./types";

const node = (id: string, x: number, y: number, depth: number): TreeNode => ({
  personId: id,
  x,
  y,
  width: 160,
  height: 72,
  depth,
  isSpouse: false,
  hasHiddenChildren: false,
  person: {
    id,
    fullName: id,
    gender: "male",
    birthYear: null,
    deathYear: null,
    isLiving: true,
    generation: depth + 1,
    inClan: true,
    hasAvatar: false,
  },
});

describe("wrapName", () => {
  it("tên ngắn giữ một dòng", () => expect(wrapName("Nguyễn Văn An")).toEqual(["Nguyễn Văn An"]));
  it("tên vừa hai dòng", () => expect(wrapName("Nguyễn Đức Trường Giang")).toEqual(["Nguyễn Đức Trường", "Giang"]));
  it("tên rất dài giữ tên gọi ở dòng 2", () => {
    const [a, b] = wrapName("Tôn Nữ Thị Công Huyền Tôn Nữ Diệu Hạnh Phương", 14);
    expect(b).toBe("Hạnh Phương");
    expect(a!.endsWith("…")).toBe(true);
    expect(a!.length).toBeLessThanOrEqual(14);
  });
  it("một từ quá dài bị cắt", () => {
    const r = wrapName("Aaaaaaaaaaaaaaaaaaaaaaaaa", 10);
    expect(r[0].length).toBeLessThanOrEqual(10);
  });
});

describe("khung nhìn", () => {
  it("fitView không phóng to quá 100% và căn giữa", () => {
    const v = fitView(400, 200, 1000, 800);
    expect(v.k).toBe(1);
    expect(v.x).toBe(300);
  });
  it("fitView thu nhỏ cây lớn", () => {
    const v = fitView(4000, 1000, 1000, 800);
    expect(v.k).toBeCloseTo((1000 - 96) / 4000);
  });
  it("zoomAt giữ điểm dưới con trỏ đứng yên", () => {
    const v = { x: 10, y: 20, k: 1 };
    const z = zoomAt(v, 2, 110, 120);
    // điểm cây (100,100) trước ở (110,120), sau vẫn ở đó
    expect(100 * z.k + z.x).toBeCloseTo(110);
    expect(100 * z.k + z.y).toBeCloseTo(120);
    expect(zoomAt(v, 100, 0, 0).k).toBe(MAX_ZOOM);
  });
  it("focusView đặt nút giữa màn hình theo chiều ngang", () => {
    const v = focusView({ x: 500, y: 300, width: 160, height: 72 }, 1000, 800);
    expect((500 + 80) * v.k + v.x).toBe(500);
  });
  it("visibleNodes lọc nút ngoài màn hình", () => {
    const nodes = [node("a", 0, 0, 0), node("b", 5000, 0, 0)];
    expect(visibleNodes(nodes, { x: 0, y: 0, k: 1 }, 1000, 800).map((n) => n.personId)).toEqual(["a"]);
  });
  it("generationRows gom theo độ sâu", () => {
    const rows = generationRows([node("a", 0, 0, 0), node("b", 0, 144, 1), node("c", 200, 150, 1)]);
    expect(rows.get(1)).toEqual({ top: 144, bottom: 222 });
  });
});
