"use client";

import { TempleAddress } from "@/components/clan-home-parts";
import { ContactList } from "@/components/contact-list";
import { ContactMessageForm } from "@/components/contact-message-form";
import { PublicCounter } from "@/components/public-counter";
import { usePublicSite } from "@/lib/public";

export default function PublicContactPage() {
  const site = usePublicSite();
  if (!site.data) return null;
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-8">
        <h1 className="font-serif text-3xl">Ban liên lạc</h1>
        <p className="mb-6 mt-1 text-reu">Con cháu xa quê muốn bổ sung gia phả, hỏi ngày giỗ, đường về nhà thờ họ — xin liên hệ:</p>
        <ContactList contacts={site.data.contacts} />
        {site.data.home.templeAddress && (
          <div className="mt-8 border-t border-ngoc-200 pt-6">
            <TempleAddress address={site.data.home.templeAddress} />
          </div>
        )}
        <section aria-labelledby="gui-loi-nhan" className="mt-10 border-t border-ngoc-200 pt-8">
          <h2 id="gui-loi-nhan" className="font-serif text-2xl">
            Gửi lời nhắn cho ban quản lý
          </h2>
          <p className="mb-5 mt-1 text-reu">Không tiện gọi điện? Để lại lời nhắn, ban quản lý sẽ liên lạc lại.</p>
          <ContactMessageForm />
        </section>
        <PublicCounter />
      </div>
    </div>
  );
}
