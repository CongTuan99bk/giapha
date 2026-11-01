-- Gia Phả Cội Nguồn — bảo vệ dữ liệu ở tầng cơ sở dữ liệu
--   1. Row-Level Security theo dòng họ (ADR-003, NFR-SEC-01)
--   2. Tìm kiếm không dấu (FR-PERSON-05)
--   3. Ràng buộc toàn vẹn phả hệ: không tự làm cha mẹ mình, không vòng lặp tổ tiên,
--      không nối người giữa hai dòng họ (BR-TREE-02, phòng thủ nhiều lớp)
--
-- Cách dùng trong ứng dụng (mỗi request / transaction):
--   SELECT set_config('app.clan_id', '<uuid dòng họ>', true);
--   SELECT set_config('app.user_id', '<uuid người dùng>', true);
-- Role ứng dụng KHÔNG phải superuser và KHÔNG có BYPASSRLS.
-- Worker tổng hợp số liệu nhiều dòng họ và trang super-admin dùng role riêng có BYPASSRLS
-- (tạo trong infra/docker/postgres/init.sql, không tạo trong migration).

-- ───────────────────────── 1. Row-Level Security ─────────────────────────

CREATE OR REPLACE FUNCTION app_current_clan() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.clan_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_current_user() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'branches', 'persons', 'person_facts', 'unions', 'parent_child',
    'media', 'albums', 'categories', 'posts',
    'events', 'event_occurrences', 'event_subscriptions', 'places',
    'site_settings', 'contacts', 'contact_messages',
    'analytics_daily', 'analytics_dims',
    'edit_requests', 'donations', 'imports', 'exports', 'support_grants'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (clan_id = app_current_clan()) WITH CHECK (clan_id = app_current_clan())',
      t
    );
  END LOOP;
END $$;

-- Thành viên: xem trong dòng họ hiện tại, hoặc các dòng họ của chính mình (để chọn dòng họ)
ALTER TABLE "clan_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clan_members" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "clan_members"
  USING (clan_id = app_current_clan() OR user_id = app_current_user())
  WITH CHECK (clan_id = app_current_clan());

-- Nhật ký: chỉ bản ghi của dòng họ hiện tại; bản ghi cấp nền tảng (clan_id null) chỉ role BYPASSRLS thấy
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "audit_logs"
  USING (clan_id = app_current_clan())
  WITH CHECK (clan_id = app_current_clan());

-- ───────────────────────── 2. Tìm kiếm, chỉ mục ─────────────────────────

-- unaccent() không IMMUTABLE nên không dùng được cho cột sinh tự động → dùng trigger
CREATE OR REPLACE FUNCTION persons_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.name_unaccent := lower(unaccent(replace(replace(NEW.full_name, 'đ', 'd'), 'Đ', 'D')));
  NEW.birth_year := NULLIF(NEW.birth_date ->> 'year', '')::int;
  RETURN NEW;
END $$;

CREATE TRIGGER persons_before_write
  BEFORE INSERT OR UPDATE OF full_name, birth_date ON "persons"
  FOR EACH ROW EXECUTE FUNCTION persons_before_write();

CREATE INDEX "persons_lineage_path_gist_idx" ON "persons" USING GIST ("lineage_path");

-- ───────────────────────── 3. Toàn vẹn phả hệ ─────────────────────────

ALTER TABLE "unions" ADD CONSTRAINT "unions_distinct_partners_chk"
  CHECK ("partner_b_id" IS NULL OR "partner_a_id" <> "partner_b_id");
ALTER TABLE "unions" ADD CONSTRAINT "unions_order_index_chk" CHECK ("order_index" >= 1);
ALTER TABLE "parent_child" ADD CONSTRAINT "parent_child_birth_order_chk" CHECK ("birth_order" >= 1);
ALTER TABLE "persons" ADD CONSTRAINT "persons_generation_chk" CHECK ("generation" IS NULL OR "generation" >= 1);
ALTER TABLE "analytics_daily" ADD CONSTRAINT "analytics_daily_nonneg_chk"
  CHECK ("page_views" >= 0 AND "unique_visitors" >= 0 AND "member_views" >= 0);

-- Hôn phối: hai người phải cùng dòng họ với hôn phối
CREATE OR REPLACE FUNCTION unions_check_clan() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM persons p
    WHERE p.id IN (NEW.partner_a_id, NEW.partner_b_id) AND p.clan_id <> NEW.clan_id
  ) THEN
    RAISE EXCEPTION 'CROSS_CLAN_REFERENCE: hôn phối % nối người của dòng họ khác', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER unions_check_clan
  BEFORE INSERT OR UPDATE OF partner_a_id, partner_b_id, clan_id ON "unions"
  FOR EACH ROW EXECUTE FUNCTION unions_check_clan();

-- Cha mẹ – con: cùng dòng họ, không tự làm cha mẹ mình, không tạo vòng lặp tổ tiên
CREATE OR REPLACE FUNCTION parent_child_check() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  u unions%ROWTYPE;
BEGIN
  SELECT * INTO u FROM unions WHERE id = NEW.union_id;
  IF u.clan_id <> NEW.clan_id
     OR NOT EXISTS (SELECT 1 FROM persons WHERE id = NEW.child_id AND clan_id = NEW.clan_id) THEN
    RAISE EXCEPTION 'CROSS_CLAN_REFERENCE: quan hệ con nối dữ liệu của dòng họ khác'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.child_id IN (u.partner_a_id, u.partner_b_id) THEN
    RAISE EXCEPTION 'SELF_PARENT: một người không thể là cha/mẹ của chính mình'
      USING ERRCODE = 'check_violation';
  END IF;
  -- child_id có là tổ tiên của cha/mẹ trong hôn phối này không?
  IF EXISTS (
    WITH RECURSIVE ancestors(id) AS (
      SELECT unnest(ARRAY[u.partner_a_id, u.partner_b_id])
      UNION
      SELECT x.pid
      FROM ancestors a
      JOIN parent_child pc ON pc.child_id = a.id
      JOIN unions un ON un.id = pc.union_id
      CROSS JOIN LATERAL (VALUES (un.partner_a_id), (un.partner_b_id)) AS x(pid)
      WHERE x.pid IS NOT NULL
    )
    SELECT 1 FROM ancestors WHERE id = NEW.child_id
  ) THEN
    RAISE EXCEPTION 'ANCESTOR_CYCLE: thêm quan hệ này tạo vòng lặp tổ tiên'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER parent_child_check
  BEFORE INSERT OR UPDATE OF union_id, child_id, clan_id ON "parent_child"
  FOR EACH ROW EXECUTE FUNCTION parent_child_check();
