"use client";

import { FormError } from "@/components/field";
import { formatPhone } from "@/lib/format";
import { useDeleteMessage, useMarkMessage, useMessages } from "@/lib/queries";
import type { ContactMessage } from "@/lib/types";

/** Lời nhắn khách gửi từ trang công khai: chưa xử lý ở trên, đã xử lý gấp lại bên dưới */
export function MessagesInbox({ clanId }: { clanId: string }) {
  const list = useMessages(clanId);
  if (!list.data || list.data.items.length === 0) return null;
  const open = list.data.items.filter((m) => !m.handledAt);
  const done = list.data.items.filter((m) => m.handledAt);
  return (
    <section id="loi-nhan" className="mt-12 scroll-mt-4 border-t border-ngoc-200 pt-8">
      <h2 className="font-serif text-2xl">Lời nhắn của khách{open.length > 0 && ` (${open.length} chưa trả lời)`}</h2>
      <p className="mt-1 max-w-prose text-reu">Gửi từ mục Liên hệ trên trang công khai. Gọi điện hoặc gửi email lại cho khách, xong thì đánh dấu đã trả lời.</p>
      {open.length > 0 ? (
        <ul className="mt-6 divide-y divide-ngoc-200 border-y border-ngoc-200">
          {open.map((m) => (
            <MessageRow key={m.id} clanId={clanId} m={m} />
          ))}
        </ul>
      ) : (
        <p className="mt-6">Đã trả lời hết lời nhắn.</p>
      )}
      {done.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-son">Đã trả lời ({done.length})</summary>
          <ul className="mt-2 divide-y divide-ngoc-200 opacity-80">
            {done.map((m) => (
              <MessageRow key={m.id} clanId={clanId} m={m} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function MessageRow({ clanId, m }: { clanId: string; m: ContactMessage }) {
  const mark = useMarkMessage(clanId);
  const remove = useDeleteMessage(clanId);
  const isEmail = m.replyTo.includes("@");
  const contact = isEmail ? m.replyTo : formatPhone(m.replyTo);
  const href = isEmail ? `mailto:${m.replyTo}` : `tel:${m.replyTo}`;
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-medium">{m.name}</span>
        <a href={href} className="text-son underline-offset-4 hover:underline">
          {contact}
        </a>
        <span className="text-sm text-reu">{new Date(m.createdAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}</span>
      </div>
      <p className="mt-1 whitespace-pre-line">{m.message}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn-phu" disabled={mark.isPending} onClick={() => mark.mutate({ id: m.id, handled: !m.handledAt })}>
          {m.handledAt ? "Chuyển lại chưa trả lời" : "Đã trả lời"}
        </button>
        <button
          type="button"
          className="rounded px-3 py-2 text-sm text-loi hover:bg-son-nhat"
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm(`Xoá lời nhắn của ${m.name}?`)) remove.mutate(m.id);
          }}
        >
          Xoá
        </button>
      </div>
      <FormError message={mark.error?.message ?? remove.error?.message} />
    </li>
  );
}
