-- Bảng domains bị sót RLS ở migration đầu (phát hiện bởi test "mọi bảng có clan_id đều bật RLS", 2026-11-02).
-- Tên miền là thông tin công khai và cần tra theo hostname trước khi biết dòng họ (website công khai),
-- nên cho ĐỌC tự do; THÊM/SỬA/XOÁ chỉ trong dòng họ hiện tại.
ALTER TABLE "domains" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "domains" FORCE ROW LEVEL SECURITY;
CREATE POLICY public_read ON "domains" FOR SELECT USING (true);
CREATE POLICY tenant_insert ON "domains" FOR INSERT WITH CHECK (clan_id = app_current_clan());
CREATE POLICY tenant_update ON "domains" FOR UPDATE USING (clan_id = app_current_clan()) WITH CHECK (clan_id = app_current_clan());
CREATE POLICY tenant_delete ON "domains" FOR DELETE USING (clan_id = app_current_clan());
