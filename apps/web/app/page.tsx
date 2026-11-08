import { shareMetadata } from "@/lib/share-metadata";
import { HomeClient } from "./home-client";

/** Gửi link trang chủ (tên miền) cũng có ảnh và tên dòng họ */
// dựng sẵn, làm mới 5 phút/lần (phải là số cố định để Next đọc được lúc build)
export const revalidate = 300;

export const generateMetadata = () => shareMetadata("/");

export default function Home() {
  return <HomeClient />;
}
