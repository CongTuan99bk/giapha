import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="font-serif text-3xl">Không tìm thấy trang này</h1>
      <p className="mt-3 text-reu">Đường dẫn có thể đã đổi, hoặc bạn chưa được mời vào dòng họ này.</p>
      <Link href="/" className="btn-chinh mt-8">
        Về trang gia phả
      </Link>
    </main>
  );
}
