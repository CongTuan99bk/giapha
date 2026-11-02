/** Các phần dùng chung giữa trang chủ thành viên và trang công khai. */

/** Một vế câu đối dựng đứng: mỗi chữ một dòng, chữ vàng trên nền son. */
export function CoupletPanel({ text, side }: { text: string; side: "trái" | "phải" }) {
  const words = text.split(/\s+/).filter(Boolean);
  const size = words.length <= 7 ? "text-[1.35rem]" : words.length <= 9 ? "text-[1.15rem]" : "text-base";
  return (
    <div className="hidden bg-son-dam p-1.5 md:block" aria-label={`Câu đối vế ${side}: ${text}`} role="note">
      <div className={`flex h-full flex-col items-center justify-evenly border border-thep/70 py-3 font-serif capitalize leading-none text-thep-nhat ${size}`} aria-hidden>
        {words.map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>
    </div>
  );
}

/** Địa chỉ nhà thờ họ kèm nút mở Google Maps (tìm theo địa chỉ, không cần toạ độ) */
export function TempleAddress({ address }: { address: string }) {
  const map = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  return (
    <p className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="text-reu">Nhà thờ họ:</span>
      <span className="font-serif text-lg">{address}</span>
      <a href={map} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-son underline-offset-4 hover:underline">
        Chỉ đường
      </a>
    </p>
  );
}
