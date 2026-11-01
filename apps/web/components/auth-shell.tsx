import type { ReactNode } from "react";

/** Khung trang đăng nhập/đăng ký: bên trái là tên sản phẩm trên nền sơn then, bên phải là form. */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="flex flex-col justify-between bg-then px-6 py-8 text-ngoc-50 md:px-12 md:py-14">
        <p className="font-serif text-2xl text-thep-nhat md:text-[2.75rem] md:leading-[1.1]">Gia Phả Cội Nguồn</p>
        <p className="mt-6 max-w-sm font-serif text-lg leading-relaxed text-ngoc-200 md:text-xl">
          Ghi lại các đời trong họ, ngày giỗ của từng cụ, và cách con cháu gọi nhau — để người sau biết mình từ đâu.
        </p>
      </aside>
      <main className="flex items-start justify-center px-4 py-10 md:items-center md:px-12">
        <div className="w-full max-w-sm">
          <h1 className="font-serif text-3xl">{title}</h1>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
