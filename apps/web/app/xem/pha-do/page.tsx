"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";
import { FormError } from "@/components/field";
import { PublicPersonPanel } from "@/components/tree/public-person-panel";
import { TreeCanvas } from "@/components/tree/tree-canvas";
import { publicMediaUrl, usePublicTree } from "@/lib/public";

const avatarSrc = (id: string) => publicMediaUrl(id, "sm");

function PublicTree() {
  const params = useSearchParams();
  const router = useRouter();
  const tree = usePublicTree();
  const selectedId = params.get("nguoi");
  const [focus, setFocus] = useState<{ personId: string; nonce: number } | null>(null);
  const select = useCallback(
    (id: string | null, center = false) => {
      router.replace(id ? `/xem/pha-do?nguoi=${id}` : "/xem/pha-do", { scroll: false });
      if (id && center) setFocus({ personId: id, nonce: Date.now() });
    },
    [router],
  );

  if (tree.error) return <div className="p-6"><FormError message={tree.error.message} /></div>;
  if (!tree.data) return <p className="p-6 text-reu">Đang vẽ phả đồ…</p>;
  if (tree.data.nodes.length === 0) return <p className="mx-auto max-w-md p-10 text-center font-serif text-xl text-reu">Phả đồ công khai chưa có ai.</p>;
  return (
    <>
      <TreeCanvas
        layout={tree.data}
        clanId=""
        avatarSrc={avatarSrc}
        selectedId={selectedId}
        onSelect={(id) => select(id, window.matchMedia("(max-width: 767px)").matches)}
        focus={focus}
      />
      {selectedId && <PublicPersonPanel personId={selectedId} onSelect={(id) => select(id, true)} onClose={() => select(null)} />}
    </>
  );
}

export default function PublicTreePage() {
  return (
    <Suspense>
      <PublicTree />
    </Suspense>
  );
}
