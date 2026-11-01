"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";
import { FormError } from "@/components/field";
import { PersonForm } from "@/components/person-form";
import { PersonPanel } from "@/components/tree/person-panel";
import { TreeCanvas } from "@/components/tree/tree-canvas";
import { useAddPerson, useClan, useTree } from "@/lib/queries";
import { ROLE_RANK } from "@/lib/roles";

function TreeScreen() {
  const { clanId } = useParams<{ clanId: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const clan = useClan(clanId);
  const tree = useTree(clanId);
  const selectedId = params.get("nguoi");
  const [focus, setFocus] = useState<{ personId: string; nonce: number } | null>(null);

  // Người đang chọn nằm trên URL (?nguoi=...) để gửi link và nút Quay lại hoạt động đúng
  const select = useCallback(
    (id: string | null, center = false) => {
      router.replace(id ? `/dong-ho/${clanId}?nguoi=${id}` : `/dong-ho/${clanId}`, { scroll: false });
      if (id && center) setFocus({ personId: id, nonce: Date.now() });
    },
    [clanId, router],
  );

  if (clan.error || tree.error) return <div className="p-6"><FormError message={(clan.error ?? tree.error)!.message} /></div>;
  if (!clan.data || !tree.data) return <p className="p-6 text-reu">Đang vẽ phả đồ…</p>;

  const canEdit = ROLE_RANK[clan.data.role] >= ROLE_RANK.editor;
  if (tree.data.nodes.length === 0) {
    return canEdit ? <FirstPerson clanId={clanId} surname={clan.data.surname} /> : (
      <p className="mx-auto max-w-md p-10 text-center font-serif text-xl text-reu">Phả đồ chưa có ai. Ban quản lý sẽ nhập dần.</p>
    );
  }

  return (
    <>
      <TreeCanvas
        layout={tree.data}
        selectedId={selectedId}
        // Trên điện thoại bảng thông tin che nửa dưới → đưa người được chọn lên trên
        onSelect={(id) => select(id, window.matchMedia("(max-width: 767px)").matches)}
        focus={focus}
      />
      {selectedId && (
        <PersonPanel clan={clan.data} personId={selectedId} canEdit={canEdit} onSelect={(id) => select(id, true)} onClose={() => select(null)} />
      )}
    </>
  );
}

/** Phả đồ trống: nhập người đầu tiên — thường là thuỷ tổ (người xa nhất còn biết tên). */
function FirstPerson({ clanId, surname }: { clanId: string; surname: string }) {
  const add = useAddPerson(clanId);
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-lg px-4 py-10">
        <h1 className="font-serif text-3xl">Bắt đầu từ thuỷ tổ</h1>
        <p className="mt-3 text-reu">
          Nhập người xa nhất trong họ mà gia đình còn biết tên. Sau đó bấm vào người này trên phả đồ để thêm vợ, con, cháu… Nếu sau này
          biết thêm đời trên, bạn vẫn thêm cha mẹ cho thuỷ tổ được.
        </p>
        <div className="mt-8">
          <PersonForm
            initial={{ fullName: `${surname} `, gender: "male", isLiving: false }}
            submitLabel="Thêm vào phả đồ"
            onCancel={() => history.back()}
            onSubmit={(person) => add.mutateAsync({ kind: "first", person })}
          />
        </div>
      </div>
    </div>
  );
}

export default function TreePage() {
  return (
    <Suspense>
      <TreeScreen />
    </Suspense>
  );
}
