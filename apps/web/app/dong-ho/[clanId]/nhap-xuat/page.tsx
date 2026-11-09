"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { FormError } from "@/components/field";
import { PersonPicker } from "@/components/person-picker";
import { useClan, useCommitImport, useImportHistory, usePerson, useRevertImport, useTreeExportInfo } from "@/lib/queries";
import { ROLE_RANK } from "@/lib/roles";
import type { ImportCheck, ImportColumn, ImportHistoryItem, Paper, PdfLayout, PersonListItem } from "@/lib/types";
import { uploadImportFile } from "@/lib/upload";

const COLUMN_LABEL: Record<ImportColumn, string> = {
  ma: "Mã",
  hoTen: "Họ và tên",
  gioiTinh: "Giới tính",
  maCha: "Mã cha",
  maMe: "Mã mẹ",
  quanHe: "Quan hệ với cha mẹ",
  thuTu: "Thứ tự con",
  maVoChong: "Mã vợ/chồng",
  tenKhac: "Tên khác",
  ngaySinh: "Ngày sinh",
  daMat: "Đã mất",
  ngayMat: "Ngày mất",
  ngayGio: "Ngày giỗ (âm lịch)",
  queQuan: "Quê quán",
  ngheNghiep: "Nghề nghiệp",
  noiAnTang: "Nơi an táng",
  tieuSu: "Tiểu sử, ghi chú",
};

const PAPERS: Array<{ v: Paper; label: string }> = [
  { v: "A4", label: "A4" },
  { v: "A3", label: "A3" },
  { v: "A2", label: "A2" },
  { v: "A1", label: "A1" },
  { v: "A0", label: "A0" },
  { v: "cuon", label: "Giấy cuộn (in bạt)" },
];
const LAYOUTS: Array<{ v: PdfLayout; label: string; hint: string }> = [
  { v: "tu-dong", label: "Tự động", hint: "Vừa một trang nếu chữ còn đọc được, không thì chia nhiều trang" },
  { v: "mot-trang", label: "Gọn một trang", hint: "Thu nhỏ cả cây vào một tờ" },
  { v: "nhieu-trang", label: "Chia nhiều trang để ghép", hint: "Chữ to dễ đọc, in xong dán các trang cạnh nhau" },
];

/** Nhập – xuất: in phả đồ (PDF/SVG), xuất danh sách Excel, nhập phả từ Excel */
export default function ImportExportPage() {
  return (
    <Suspense fallback={null}>
      <ImportExport />
    </Suspense>
  );
}

function ImportExport() {
  const { clanId } = useParams<{ clanId: string }>();
  const clan = useClan(clanId);
  const role = clan.data?.role;
  const canEdit = role ? ROLE_RANK[role] >= ROLE_RANK.editor : false;
  const isAdmin = role ? ROLE_RANK[role] >= ROLE_RANK.admin : false;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-8">
        <h1 className="font-serif text-3xl">Nhập – xuất</h1>
        <p className="mt-1 max-w-prose text-reu">In phả đồ ra giấy, lưu danh sách ra Excel{isAdmin ? ", hoặc nhập cả phả từ file Excel" : ""}.</p>
        <ExportTree clanId={clanId} />
        {canEdit && (
          <section aria-labelledby="xuat-excel" className="mt-12 border-t border-ngoc-200 pt-8">
            <h2 id="xuat-excel" className="font-serif text-2xl">
              Danh sách Excel
            </h2>
            <p className="mt-1 max-w-prose text-reu">
              Mọi người trong phả, mỗi người một dòng, đúng các cột của file mẫu nhập. Muốn thêm cả một nhánh: thêm dòng mới vào file này rồi nhập lại — dòng của người
              đã có được giữ nguyên.
            </p>
            <a href={`/api/v1/clans/${clanId}/export/persons.xlsx`} className="btn-phu mt-4 inline-flex" download>
              Xuất danh sách Excel
            </a>
          </section>
        )}
        {isAdmin && <ImportSection clanId={clanId} />}
      </div>
    </div>
  );
}

function ExportTree({ clanId }: { clanId: string }) {
  const params = useSearchParams();
  const fromParam = params.get("nguoi");
  const initial = usePerson(clanId, fromParam);
  const [from, setFrom] = useState<PersonListItem | null | undefined>(undefined);
  const root = from === undefined ? (initial.data ? ({ id: initial.data.id, fullName: initial.data.fullName } as PersonListItem) : null) : from;
  const [depth, setDepth] = useState("");
  const [paper, setPaper] = useState<Paper>("A3");
  const [layout, setLayout] = useState<PdfLayout>("tu-dong");
  const [photos, setPhotos] = useState(true);

  const q = new URLSearchParams({ paper, layout, ...(root ? { rootId: root.id } : {}), ...(depth ? { depth } : {}) });
  const info = useTreeExportInfo(clanId, q.toString());
  const withPhotos = new URLSearchParams(q);
  withPhotos.set("anh", photos ? "1" : "0");
  const d = info.data;

  return (
    <section aria-labelledby="in-pha-do" className="mt-8">
      <h2 id="in-pha-do" className="font-serif text-2xl">
        In phả đồ
      </h2>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <PersonPicker clanId={clanId} label="Bắt đầu từ (để trống: từ thuỷ tổ)" value={root} onChange={(p) => setFrom(p)} />
        </div>
        <label className="block">
          <span className="nhan">Số đời</span>
          <select className="o-nhap" value={depth} onChange={(e) => setDepth(e.target.value)}>
            <option value="">Tất cả các đời</option>
            {[2, 3, 4, 5, 6, 8, 10].map((n) => (
              <option key={n} value={n}>
                {n} đời
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="nhan">Khổ giấy</span>
          <select className="o-nhap" value={paper} onChange={(e) => setPaper(e.target.value as Paper)}>
            {PAPERS.map((p) => (
              <option key={p.v} value={p.v}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {paper !== "cuon" && (
          <fieldset className="sm:col-span-2">
            <legend className="nhan">Cách in</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {LAYOUTS.map((l) => (
                <label key={l.v} className="flex cursor-pointer gap-2 rounded-md border border-ngoc-200 bg-giay px-3 py-2 has-[:checked]:border-thep has-[:checked]:bg-thep-nhat/40">
                  <input type="radio" name="cach-in" checked={layout === l.v} onChange={() => setLayout(l.v)} className="mt-1 accent-son" />
                  <span>
                    <span className="font-medium">{l.label}</span>
                    <span className="block text-sm text-reu">{l.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <label className="flex items-center gap-2 sm:col-span-2">
          <input type="checkbox" checked={photos} onChange={(e) => setPhotos(e.target.checked)} className="h-4 w-4 accent-son" />
          Kèm ảnh chân dung
        </label>
      </div>

      <div className="mt-5 rounded-md border border-[#d6c9ae] bg-do/60 px-5 py-4" aria-live="polite">
        {info.error && <FormError message={info.error.message} />}
        {d && (
          <>
            <p>
              <strong className="font-medium">
                {d.people.toLocaleString("vi-VN")} người, {d.generations} đời
              </strong>{" "}
              → {d.pages.toLocaleString("vi-VN")} trang {paper === "cuon" ? "giấy cuộn" : paper}
              {d.pages > 1 ? ` (ghép ${d.rows} hàng × ${d.cols} cột)` : ""}, mỗi trang {d.pageWidthCm.toLocaleString("vi-VN")} × {d.pageHeightCm.toLocaleString("vi-VN")} cm.
            </p>
            <p className="mt-1 text-sm text-reu">Chữ tên khi in cao khoảng {d.nameHeightMm.toLocaleString("vi-VN")} mm.</p>
            {!d.readable && (
              <p className="mt-2 text-sm text-loi">
                Chữ quá nhỏ để đọc. Hãy chọn “Chia nhiều trang để ghép”, khổ giấy lớn hơn, hoặc in từng nhánh (chọn người bắt đầu, bớt số đời).
              </p>
            )}
            {d.pages > 30 && (
              <p className="mt-2 text-sm text-loi">Nhiều trang quá để ghép. Nên in từng nhánh: chọn người bắt đầu là trưởng mỗi chi, hoặc bớt số đời.</p>
            )}
          </>
        )}
        {!d && !info.error && <p className="text-reu">Đang tính số trang…</p>}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <a href={`/api/v1/clans/${clanId}/export/tree.pdf?${withPhotos}`} className="btn-chinh" download>
          Tải PDF để in
        </a>
        <a href={`/api/v1/clans/${clanId}/export/tree.svg?${withPhotos}`} className="btn-phu" download>
          Tải SVG (hình vector)
        </a>
      </div>
      <p className="mt-2 text-sm text-reu">SVG phóng to bao nhiêu cũng không vỡ — hợp để gửi tiệm in khổ lớn hoặc chỉnh sửa bằng phần mềm đồ hoạ.</p>
    </section>
  );
}

function ImportSection({ clanId }: { clanId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportCheck | null>(null);
  const [created, setCreated] = useState<number | null>(null);
  const commit = useCommitImport(clanId);
  const history = useImportHistory(clanId, true);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setResult(null);
    setCreated(null);
    setChecking(true);
    try {
      setResult(await uploadImportFile(clanId, file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không kiểm tra được file.");
    } finally {
      setChecking(false);
      void history.refetch();
    }
  }

  return (
    <section id="nhap" aria-labelledby="nhap-excel" className="mt-12 scroll-mt-4 border-t border-ngoc-200 pt-8">
      <h2 id="nhap-excel" className="font-serif text-2xl">
        Nhập từ Excel
      </h2>
      <ol className="mt-3 max-w-prose list-decimal space-y-1 pl-5">
        <li>
          Tải file mẫu, điền mỗi người một dòng: <strong className="font-medium">Mã</strong>, <strong className="font-medium">Họ và tên</strong>, Mã cha, Mã mẹ, Mã vợ/chồng…
          (xem trang “Hướng dẫn” và “Ví dụ” trong file).
        </li>
        <li>Tải file đã điền lên. Hệ thống kiểm tra trước, chưa ghi gì vào phả.</li>
        <li>Không có lỗi thì xem lại số người, số đời rồi bấm Xác nhận nhập. Nhập xong vẫn hoàn tác được trong 24 giờ.</li>
      </ol>
      <div className="mt-5 flex flex-wrap gap-3">
        <a href={`/api/v1/clans/${clanId}/import/template.xlsx`} className="btn-phu" download>
          Tải file mẫu
        </a>
        <input
          ref={input}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          aria-label="Chọn file Excel để nhập"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            void pick(f);
          }}
        />
        <button type="button" className="btn-chinh" disabled={checking || commit.isPending} onClick={() => input.current?.click()}>
          {checking ? "Đang kiểm tra file…" : "Chọn file Excel để nhập"}
        </button>
      </div>
      <div className="mt-4">
        <FormError message={error} />
      </div>

      {result && !result.ok && (
        <div className="mt-4 rounded-md border border-loi/30 bg-son-nhat/60 px-5 py-4">
          <h3 className="font-serif text-xl text-loi">
            {result.errorCount.toLocaleString("vi-VN")} lỗi trong “{result.fileName}” — chưa nhập gì
          </h3>
          <p className="mt-1 text-sm">Sửa các dòng dưới đây trong file Excel rồi tải lên lại. File đánh dấu lỗi tô đỏ đúng ô cần sửa.</p>
          <a href={`/api/v1/clans/${clanId}/imports/${result.id}/errors.xlsx`} className="btn-phu mt-3 inline-flex" download>
            Tải file đánh dấu lỗi
          </a>
          <IssueTable issues={result.errors} />
          {result.errorCount > result.errors.length && <p className="mt-2 text-sm text-reu">Còn {result.errorCount - result.errors.length} lỗi nữa — xem trong file đánh dấu lỗi.</p>}
        </div>
      )}

      {result?.ok && result.summary && created === null && (
        <div className="mt-4 rounded-md border border-thep/60 bg-thep-nhat/50 px-5 py-4">
          <h3 className="font-serif text-xl">File “{result.fileName}” hợp lệ</h3>
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            <li>
              <strong className="font-medium">{result.summary.newPeople.toLocaleString("vi-VN")} người mới</strong>
              {result.summary.generations && ` (đời ${result.summary.generations[0]} đến đời ${result.summary.generations[1]})`}, trong đó {result.summary.deceased.toLocaleString("vi-VN")} người đã mất
            </li>
            {result.summary.rootName && <li>Thuỷ tổ: {result.summary.rootName}</li>}
            <li>
              {result.summary.newUnions.toLocaleString("vi-VN")} cặp vợ chồng, {result.summary.links.toLocaleString("vi-VN")} quan hệ cha mẹ – con
            </li>
            {result.summary.skippedExisting > 0 && <li>{result.summary.skippedExisting.toLocaleString("vi-VN")} dòng là người đã có trong phả — bỏ qua, không sửa</li>}
          </ul>
          {result.warnings.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-son">{result.warnings.length} lưu ý (không bắt buộc sửa)</summary>
              <IssueTable issues={result.warnings} />
            </details>
          )}
          <FormError message={commit.error?.message} />
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              className="btn-chinh"
              disabled={commit.isPending}
              onClick={() => commit.mutate(result.id, { onSuccess: (r) => setCreated(r.created), onSettled: () => void history.refetch() })}
            >
              {commit.isPending ? "Đang nhập…" : `Xác nhận nhập ${result.summary.newPeople.toLocaleString("vi-VN")} người`}
            </button>
            <button type="button" className="btn-phu" onClick={() => setResult(null)}>
              Huỷ
            </button>
          </div>
        </div>
      )}

      {created !== null && (
        <div role="status" className="mt-4 rounded-md border border-thep/60 bg-thep-nhat/50 px-5 py-4">
          <p className="font-serif text-xl">Đã nhập {created.toLocaleString("vi-VN")} người.</p>
          <p className="mt-1">
            <Link href={`/dong-ho/${clanId}/pha-do`} className="font-medium text-son underline-offset-4 hover:underline">
              Mở phả đồ
            </Link>{" "}
            để xem. Nhập nhầm thì hoàn tác ở “Lịch sử nhập” bên dưới trong 24 giờ.
          </p>
        </div>
      )}

      <History clanId={clanId} items={history.data ?? []} />
    </section>
  );
}

function IssueTable({ issues }: { issues: Array<{ row: number; column: ImportColumn | null; message: string }> }) {
  return (
    <div className="mt-3 max-h-96 overflow-auto rounded border border-ngoc-200 bg-giay">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-giay text-reu">
          <tr>
            <th className="px-3 py-1.5 font-normal">Dòng</th>
            <th className="px-3 py-1.5 font-normal">Cột</th>
            <th className="px-3 py-1.5 font-normal">Cần sửa</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((e, i) => (
            <tr key={i} className="border-t border-ngoc-200 align-top">
              <td className="px-3 py-1.5 tabular-nums">{e.row}</td>
              <td className="whitespace-nowrap px-3 py-1.5">{e.column ? COLUMN_LABEL[e.column] : ""}</td>
              <td className="px-3 py-1.5">{e.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STATUS: Record<ImportHistoryItem["status"], string> = {
  checked: "Đã kiểm tra, chưa nhập",
  failed: "Có lỗi, chưa nhập",
  done: "Đã nhập",
  reverted: "Đã hoàn tác",
};

function History({ clanId, items }: { clanId: string; items: ImportHistoryItem[] }) {
  const revert = useRevertImport(clanId);
  if (items.length === 0) return null;
  const when = (s: string) => new Date(s).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
  return (
    <div className="mt-10">
      <h3 className="font-serif text-xl">Lịch sử nhập</h3>
      <FormError message={revert.error?.message} />
      <ul className="mt-3 divide-y divide-ngoc-200 border-y border-ngoc-200">
        {items.map((h) => (
          <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-medium">{h.fileName || "File Excel"}</p>
              <p className="text-sm text-reu">
                {STATUS[h.status]}
                {h.summary && (h.status === "done" || h.status === "reverted") ? ` · ${h.summary.newPeople.toLocaleString("vi-VN")} người` : ""}
                {h.status === "failed" ? ` · ${h.errorCount} lỗi` : ""} · {when(h.committedAt ?? h.createdAt)}
                {h.by ? ` · ${h.by}` : ""}
              </p>
            </div>
            {h.canRevert && (
              <button
                type="button"
                className="btn-nguy"
                disabled={revert.isPending}
                onClick={() => {
                  if (window.confirm(`Hoàn tác lần nhập “${h.fileName}”? ${h.summary?.newPeople ?? ""} người vừa nhập sẽ bị xoá khỏi phả.`)) revert.mutate(h.id);
                }}
              >
                Hoàn tác lần nhập này
              </button>
            )}
          </li>
        ))}
      </ul>
      {items.some((h) => h.canRevert) && <p className="mt-2 text-sm text-reu">Hoàn tác được trong 24 giờ sau khi nhập.</p>}
    </div>
  );
}
