import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { headingId, stripForReaders, tableOfContents } from "@/lib/help";

export const metadata: Metadata = { title: "Hướng dẫn sử dụng" };

const textOf = (node: ReactNode): string =>
  typeof node === "string" || typeof node === "number"
    ? String(node)
    : Array.isArray(node)
      ? node.map(textOf).join("")
      : node && typeof node === "object" && "props" in node
        ? textOf((node.props as { children?: ReactNode }).children)
        : "";

/** Trang Trợ giúp: hiển thị docs/help/huong-dan-su-dung.md (chép vào content/help lúc build). */
export default async function HelpPage() {
  const md = stripForReaders(await readFile(join(process.cwd(), "content/help/huong-dan-su-dung.md"), "utf8"));
  const toc = tableOfContents(md);
  return (
    <div className="min-h-dvh">
      <header className="bg-then px-4 py-3 md:px-6">
        <Link href="/" className="font-serif text-xl text-thep-nhat">
          Gia Phả Cội Nguồn
        </Link>
      </header>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[16rem_minmax(0,68ch)]">
        <nav aria-label="Mục lục" className="lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto">
          <details className="rounded-md border border-ngoc-200 bg-giay p-3 lg:border-0 lg:bg-transparent lg:p-0" open>
            <summary className="cursor-pointer font-medium text-reu">Mục lục</summary>
            <ol className="mt-2 space-y-1 text-[0.95rem]">
              {toc.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="text-then hover:text-son">
                    {t.title}
                  </a>
                </li>
              ))}
            </ol>
          </details>
        </nav>
        <article className="tro-giup">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{ h2: ({ children }) => <h2 id={headingId(textOf(children))} className="scroll-mt-6">{children}</h2> }}
          >
            {md}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
}
