-- Đăng nhập bằng số điện thoại (email không còn bắt buộc) và yêu cầu tham gia dòng họ chờ quản lý duyệt.

-- Tài khoản: email HOẶC số điện thoại (dạng +84…, chuẩn hoá ở API)
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
ALTER TABLE "users" ADD CONSTRAINT "users_login_id_check" CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL);
ALTER TABLE "users" ADD CONSTRAINT "users_phone_format_check" CHECK ("phone" IS NULL OR "phone" ~ '^\+[0-9]{8,15}$');

-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "join_requests" (
    "id" UUID NOT NULL,
    "clan_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "message" TEXT,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'pending',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "join_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "join_requests_clan_id_user_id_key" ON "join_requests"("clan_id", "user_id");

-- CreateIndex
CREATE INDEX "join_requests_clan_id_status_idx" ON "join_requests"("clan_id", "status");

-- AddForeignKey
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Ràng buộc nghiệp vụ (ngoài schema.prisma)
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_message_check" CHECK (char_length("message") <= 500);

-- Row-Level Security: chỉ thấy yêu cầu của dòng họ hiện tại
ALTER TABLE "join_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "join_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "join_requests"
  USING (clan_id = app_current_clan())
  WITH CHECK (clan_id = app_current_clan());
