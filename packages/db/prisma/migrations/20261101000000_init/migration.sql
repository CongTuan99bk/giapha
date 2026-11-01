-- Gia Phả Cội Nguồn — migration khởi tạo (bảng, enum, khoá, chỉ mục)
-- Viết theo đúng quy ước sinh SQL của Prisma cho schema.prisma.
-- CI chạy `prisma migrate diff --from-migrations ... --to-schema-datamodel ... --exit-code`
-- để bảo đảm file này khớp schema.

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "ltree";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- CreateEnum
CREATE TYPE "ClanRole" AS ENUM ('owner', 'admin', 'editor', 'member');
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'unknown');
CREATE TYPE "Privacy" AS ENUM ('public', 'members', 'hidden');
CREATE TYPE "ChildRelation" AS ENUM ('biological', 'adopted', 'step');
CREATE TYPE "UnionType" AS ENUM ('marriage', 'partnership', 'other');
CREATE TYPE "LineageMode" AS ENUM ('patrilineal', 'matrilineal');
CREATE TYPE "KinshipVariant" AS ENUM ('bac', 'trung', 'nam');
CREATE TYPE "Day30Rule" AS ENUM ('day29', 'nextMonthDay1');
CREATE TYPE "PostStatus" AS ENUM ('draft', 'scheduled', 'published');
CREATE TYPE "Visibility" AS ENUM ('public', 'members');
CREATE TYPE "EventType" AS ENUM ('death_anniversary', 'clan_meeting', 'grave_visit', 'festival', 'other');
CREATE TYPE "PlaceType" AS ENUM ('ancestral_hall', 'grave', 'other');
CREATE TYPE "EditRequestStatus" AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE "JobStatus" AS ENUM ('queued', 'running', 'done', 'failed');
CREATE TYPE "AnalyticsDimension" AS ENUM ('page', 'person', 'referrer', 'device');

-- CreateTable
CREATE TABLE "clans" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "origin_place" TEXT,
    "lineage_mode" "LineageMode" NOT NULL DEFAULT 'patrilineal',
    "kinship_variant" "KinshipVariant" NOT NULL DEFAULT 'bac',
    "day30_rule" "Day30Rule" NOT NULL DEFAULT 'day29',
    "root_person_id" UUID,
    "tree_code_hash" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "locked_at" TIMESTAMPTZ,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "clans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "domains" (
    "id" UUID NOT NULL,
    "clan_id" UUID NOT NULL,
    "hostname" TEXT NOT NULL,
    "verified_at" TIMESTAMPTZ,
    "ssl_status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT NOT NULL,
    "password_hash" TEXT,
    "google_id" TEXT,
    "email_verified" TIMESTAMPTZ,
    "totp_secret" TEXT,
    "is_platform_admin" BOOLEAN NOT NULL DEFAULT false,
    "failed_logins" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clan_members" (
    "id" UUID NOT NULL,
    "clan_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "ClanRole" NOT NULL DEFAULT 'member',
    "branch_scope_id" UUID,
    "person_id" UUID,
    "person_link_confirmed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clan_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_grants" (
    "id" UUID NOT NULL,
    "clan_id" UUID NOT NULL,
    "granted_by" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_grants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "clan_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "root_person_id" UUID,
    "parent_branch_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "persons" (
    "id" UUID NOT NULL,
    "clan_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "name_unaccent" TEXT NOT NULL DEFAULT '',
    "other_names" JSONB NOT NULL DEFAULT '[]',
    "gender" "Gender" NOT NULL DEFAULT 'unknown',
    "is_living" BOOLEAN NOT NULL DEFAULT true,
    "birth_date" JSONB,
    "death_date" JSONB,
    "death_anniv_lunar" JSONB,
    "birth_year" INTEGER,
    "generation" INTEGER,
    "in_clan" BOOLEAN NOT NULL DEFAULT true,
    "lineage_path" ltree,
    "branch_id" UUID,
    "biography" JSONB,
    "avatar_media_id" UUID,
    "privacy" "Privacy" NOT NULL DEFAULT 'members',
    "blood_type_enc" BYTEA,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "person_facts" (
    "id" UUID NOT NULL,
    "clan_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "date_from" JSONB,
    "date_to" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "person_facts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "unions" (
    "id" UUID NOT NULL,
    "clan_id" UUID NOT NULL,
    "partner_a_id" UUID NOT NULL,
    "partner_b_id" UUID,
    "type" "UnionType" NOT NULL DEFAULT 'marriage',
    "order_index" INTEGER NOT NULL DEFAULT 1,
    "start_date" JSONB,
    "end_date" JSONB,
    "end_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "unions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "parent_child" (
    "clan_id" UUID NOT NULL,
    "union_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "relation" "ChildRelation" NOT NULL DEFAULT 'biological',
    "birth_order" INTEGER NOT NULL,

    CONSTRAINT "parent_child_pkey" PRIMARY KEY ("union_id","child_id")
);

CREATE TABLE "media" (
    "id" UUID NOT NULL,
    "clan_id" UUID NOT NULL,
    "album_id" UUID,
    "storage_key" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "caption" TEXT,
    "uploaded_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "albums" (
    "id" UUID NOT NULL,
    "clan_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "Visibility" NOT NULL DEFAULT 'public',
    "cover_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "albums_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "clan_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "posts" (
    "id" UUID NOT NULL,
    "clan_id" UUID NOT NULL,
    "category_id" UUID,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "cover_id" UUID,
    "status" "PostStatus" NOT NULL DEFAULT 'draft',
    "visibility" "Visibility" NOT NULL DEFAULT 'public',
    "published_at" TIMESTAMPTZ,
    "author_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "clan_id" UUID NOT NULL,
    "type" "EventType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "person_id" UUID,
    "lunar_rule" JSONB,
    "solar_date" DATE,
    "repeat_yearly" BOOLEAN NOT NULL DEFAULT false,
    "remind_days" INTEGER NOT NULL DEFAULT 3,
    "place_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_occurrences" (
    "id" UUID NOT NULL,
    "clan_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "solar_date" DATE NOT NULL,
    "lunar_date" JSONB NOT NULL,
    "reminded_at" TIMESTAMPTZ,

    CONSTRAINT "event_occurrences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_subscriptions" (
    "id" UUID NOT NULL,
    "clan_id" UUID NOT NULL,
    "event_id" UUID,
    "user_id" UUID,
    "email" CITEXT NOT NULL,
    "remind_days" INTEGER NOT NULL DEFAULT 3,
    "unsubscribe_token" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "places" (
    "id" UUID NOT NULL,
    "clan_id" UUID NOT NULL,
    "type" "PlaceType" NOT NULL,
    "name" TEXT NOT NULL,
    "person_id" UUID,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "address" TEXT,
    "photo_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "site_settings" (
    "clan_id" UUID NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("clan_id")
);

CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "clan_id" UUID NOT NULL,
    "member_id" UUID,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "phone" TEXT,
    "email" CITEXT,
    "zalo" TEXT,
    "photo_media_id" UUID,
    "public_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "consent_at" TIMESTAMPTZ,
    "consent_by" UUID,
    "consent_note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contact_messages" (
    "id" UUID NOT NULL,
    "clan_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "reply_to" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handled_at" TIMESTAMPTZ,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "analytics_daily" (
    "clan_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "page_views" INTEGER NOT NULL DEFAULT 0,
    "unique_visitors" INTEGER NOT NULL DEFAULT 0,
    "member_views" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "analytics_daily_pkey" PRIMARY KEY ("clan_id","date")
);

CREATE TABLE "analytics_dims" (
    "clan_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "dimension" "AnalyticsDimension" NOT NULL,
    "key" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "analytics_dims_pkey" PRIMARY KEY ("clan_id","date","dimension","key")
);

CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "clan_id" UUID,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "via_support" BOOLEAN NOT NULL DEFAULT false,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "edit_requests" (
    "id" UUID NOT NULL,
    "clan_id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "diff" JSONB NOT NULL,
    "note" TEXT,
    "status" "EditRequestStatus" NOT NULL DEFAULT 'pending',
    "reviewer_id" UUID,
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ,

    CONSTRAINT "edit_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "donations" (
    "id" UUID NOT NULL,
    "clan_id" UUID NOT NULL,
    "donor_person_id" UUID,
    "donor_name" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "purpose" TEXT,
    "date" DATE NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "imports" (
    "id" UUID NOT NULL,
    "clan_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "format" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "summary" JSONB,
    "errors" JSONB,
    "created_ids" JSONB,
    "committed_at" TIMESTAMPTZ,
    "reverted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exports" (
    "id" UUID NOT NULL,
    "clan_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "format" TEXT NOT NULL,
    "scope" JSONB NOT NULL DEFAULT '{}',
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "storage_key" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ,

    CONSTRAINT "exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clans_slug_key" ON "clans"("slug");
CREATE UNIQUE INDEX "domains_hostname_key" ON "domains"("hostname");
CREATE INDEX "domains_clan_id_idx" ON "domains"("clan_id");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
CREATE UNIQUE INDEX "clan_members_clan_id_user_id_key" ON "clan_members"("clan_id", "user_id");
CREATE INDEX "support_grants_clan_id_expires_at_idx" ON "support_grants"("clan_id", "expires_at");
CREATE INDEX "branches_clan_id_idx" ON "branches"("clan_id");
CREATE INDEX "persons_clan_id_generation_idx" ON "persons"("clan_id", "generation");
CREATE INDEX "persons_clan_id_deleted_at_idx" ON "persons"("clan_id", "deleted_at");
CREATE INDEX "persons_name_unaccent_trgm_idx" ON "persons" USING GIN ("name_unaccent" gin_trgm_ops);
CREATE INDEX "person_facts_person_id_idx" ON "person_facts"("person_id");
CREATE INDEX "unions_clan_id_idx" ON "unions"("clan_id");
CREATE INDEX "unions_partner_b_id_idx" ON "unions"("partner_b_id");
CREATE UNIQUE INDEX "unions_partner_a_id_partner_b_id_key" ON "unions"("partner_a_id", "partner_b_id");
CREATE INDEX "parent_child_child_id_idx" ON "parent_child"("child_id");
CREATE UNIQUE INDEX "parent_child_union_id_birth_order_key" ON "parent_child"("union_id", "birth_order");
CREATE UNIQUE INDEX "media_storage_key_key" ON "media"("storage_key");
CREATE INDEX "media_clan_id_album_id_idx" ON "media"("clan_id", "album_id");
CREATE INDEX "albums_clan_id_idx" ON "albums"("clan_id");
CREATE UNIQUE INDEX "categories_clan_id_slug_key" ON "categories"("clan_id", "slug");
CREATE INDEX "posts_clan_id_status_published_at_idx" ON "posts"("clan_id", "status", "published_at");
CREATE UNIQUE INDEX "posts_clan_id_slug_key" ON "posts"("clan_id", "slug");
CREATE INDEX "events_clan_id_type_idx" ON "events"("clan_id", "type");
CREATE INDEX "event_occurrences_clan_id_solar_date_idx" ON "event_occurrences"("clan_id", "solar_date");
CREATE UNIQUE INDEX "event_occurrences_event_id_solar_date_key" ON "event_occurrences"("event_id", "solar_date");
CREATE UNIQUE INDEX "event_subscriptions_unsubscribe_token_key" ON "event_subscriptions"("unsubscribe_token");
CREATE UNIQUE INDEX "event_subscriptions_clan_id_event_id_email_key" ON "event_subscriptions"("clan_id", "event_id", "email");
CREATE INDEX "places_clan_id_type_idx" ON "places"("clan_id", "type");
CREATE INDEX "contacts_clan_id_sort_order_idx" ON "contacts"("clan_id", "sort_order");
CREATE INDEX "contact_messages_clan_id_created_at_idx" ON "contact_messages"("clan_id", "created_at");
CREATE INDEX "audit_logs_clan_id_at_idx" ON "audit_logs"("clan_id", "at");
CREATE INDEX "audit_logs_clan_id_entity_entity_id_idx" ON "audit_logs"("clan_id", "entity", "entity_id");
CREATE INDEX "edit_requests_clan_id_status_idx" ON "edit_requests"("clan_id", "status");
CREATE INDEX "donations_clan_id_date_idx" ON "donations"("clan_id", "date");
CREATE INDEX "imports_clan_id_created_at_idx" ON "imports"("clan_id", "created_at");
CREATE INDEX "exports_clan_id_created_at_idx" ON "exports"("clan_id", "created_at");

-- AddForeignKey
ALTER TABLE "domains" ADD CONSTRAINT "domains_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clan_members" ADD CONSTRAINT "clan_members_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clan_members" ADD CONSTRAINT "clan_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clan_members" ADD CONSTRAINT "clan_members_branch_scope_id_fkey" FOREIGN KEY ("branch_scope_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "clan_members" ADD CONSTRAINT "clan_members_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "branches" ADD CONSTRAINT "branches_parent_branch_id_fkey" FOREIGN KEY ("parent_branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "persons" ADD CONSTRAINT "persons_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "persons" ADD CONSTRAINT "persons_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "person_facts" ADD CONSTRAINT "person_facts_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "unions" ADD CONSTRAINT "unions_partner_a_id_fkey" FOREIGN KEY ("partner_a_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "unions" ADD CONSTRAINT "unions_partner_b_id_fkey" FOREIGN KEY ("partner_b_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "parent_child" ADD CONSTRAINT "parent_child_union_id_fkey" FOREIGN KEY ("union_id") REFERENCES "unions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "parent_child" ADD CONSTRAINT "parent_child_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media" ADD CONSTRAINT "media_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "posts" ADD CONSTRAINT "posts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_occurrences" ADD CONSTRAINT "event_occurrences_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_subscriptions" ADD CONSTRAINT "event_subscriptions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "places" ADD CONSTRAINT "places_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "clan_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
