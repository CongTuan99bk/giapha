-- Lời mời vào dòng họ bằng link (FR-CLAN-02). Mã trong link chỉ lưu dạng sha256.

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "clan_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "role" "ClanRole" NOT NULL DEFAULT 'member',
    "email" CITEXT,
    "person_id" UUID,
    "created_by" UUID,
    "max_uses" INTEGER NOT NULL DEFAULT 1,
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_clan_id_idx" ON "invitations"("clan_id");

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Ràng buộc nghiệp vụ (ngoài schema.prisma)
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_uses_check" CHECK ("max_uses" BETWEEN 1 AND 100 AND "use_count" BETWEEN 0 AND "max_uses");
-- Lời mời không bao giờ cấp quyền chủ sở hữu
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_check" CHECK ("role" <> 'owner');

-- Row-Level Security: chỉ thấy lời mời của dòng họ hiện tại.
-- Tra lời mời theo mã (khi người nhận chưa là thành viên) dùng role coinguon_platform, chỉ khớp đúng token_hash.
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "invitations"
  USING (clan_id = app_current_clan())
  WITH CHECK (clan_id = app_current_clan());
