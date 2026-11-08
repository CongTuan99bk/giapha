import type { ReactNode } from "react";
import { PublicShell } from "@/components/public-shell";
import { shareMetadata } from "@/lib/share-metadata";

// dựng sẵn, làm mới 5 phút/lần (phải là số cố định để Next đọc được lúc build)
export const revalidate = 300;

/** Thẻ xem trước khi chia sẻ link trang công khai */
export const generateMetadata = () => shareMetadata("/xem");

/** Trang công khai của dòng họ: ai cũng xem được, chỉ người đã khuất */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
