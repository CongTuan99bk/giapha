import type { ReactNode } from "react";
import { AuthShowcase } from "./auth-showcase";

/** Khung trang đăng nhập/đăng ký: bên trái là gian thờ họ (tên dòng họ, ảnh nhà thờ, câu đối), bên phải là form. */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <AuthShowcase />
      <main className="flex items-start justify-center px-4 py-10 md:items-center md:px-12">
        <div className="w-full max-w-sm">
          <h1 className="font-serif text-3xl">{title}</h1>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
