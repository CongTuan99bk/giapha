import { formatPhone } from "@/lib/format";
import type { PublicSite } from "@/lib/types";

/** zalo.me nhận số dạng 0xxxxxxxxx (số Việt Nam) */
const zaloLink = (phone: string) => (phone.startsWith("+84") ? `https://zalo.me/0${phone.slice(3)}` : null);

/** Ban liên lạc trên trang công khai: số điện thoại có nút Gọi / Zalo, email bấm là mở thư */
export function ContactList({ contacts }: { contacts: PublicSite["contacts"] }) {
  if (contacts.length === 0) return <p className="text-reu">Ban liên lạc chưa cập nhật thông tin.</p>;
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {contacts.map((c, i) => (
        <li key={i} className="rounded-md border border-[#d6c9ae] bg-the px-5 py-4">
          <p className="text-sm text-son-dam">{c.role}</p>
          <p className="font-serif text-xl">{c.name}</p>
          {c.phone && (
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <a href={`tel:${c.phone}`} className="font-medium tabular-nums text-then underline-offset-4 hover:underline">
                {formatPhone(c.phone)}
              </a>
              <a href={`tel:${c.phone}`} className="text-sm font-medium text-son underline-offset-4 hover:underline">
                Gọi
              </a>
              {zaloLink(c.phone) && (
                <a href={zaloLink(c.phone)!} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-son underline-offset-4 hover:underline">
                  Zalo
                </a>
              )}
            </p>
          )}
          {c.email && (
            <p className="mt-1">
              <a href={`mailto:${c.email}`} className="break-all text-then underline-offset-4 hover:underline">
                {c.email}
              </a>
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
