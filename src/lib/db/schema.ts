import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  jsonb,
  integer,
  bigint,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const membershipRoleEnum = pgEnum("membership_role", [
  "admin",
  "editor",
  "support",
]);

export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "queued",
  "sending",
  "completed",
  "failed",
]);

export const recipientStatusEnum = pgEnum("recipient_status", [
  "pending",
  "queued",
  "sending",
  "sent",
  "delivered",
  "read",
  "failed",
]);

export const contactFieldTypeEnum = pgEnum("contact_field_type", [
  "text",
  "number",
  "boolean",
  "date",
  "select",
]);

export const tenants = pgTable("tenants", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const tenantIntegrations = pgTable(
  "tenant_integrations",
  {
    tenantId: bigint("tenant_id", { mode: "number" })
      .primaryKey()
      .references(() => tenants.id, { onDelete: "cascade" }),
    phoneNumberId: text("phone_number_id").notNull(),
    /** AES-GCM ciphertext (base64) — use lib/crypto */
    encryptedAccessToken: text("encrypted_access_token").notNull(),
    webhookVerifyToken: text("webhook_verify_token").notNull(),
    appSecret: text("app_secret"),
    graphApiVersion: text("graph_api_version").notNull().default("v21.0"),
    /** WABA id for GET /message_templates (optional until configured) */
    businessAccountId: text("business_account_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("tenant_integrations_phone_idx").on(t.phoneNumberId)],
);

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const tenantMemberships = pgTable(
  "tenant_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    tenantId: bigint("tenant_id", { mode: "number" })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull().default("support"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("tenant_memberships_user_tenant").on(t.userId, t.tenantId),
    index("tenant_memberships_tenant_idx").on(t.tenantId),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .default(sql`next_eight_digit_contacts_id()`),
    tenantId: bigint("tenant_id", { mode: "number" })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    phoneE164: text("phone_e164").notNull(),
    name: text("name"),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("contacts_tenant_phone").on(t.tenantId, t.phoneE164),
    index("contacts_tenant_idx").on(t.tenantId),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .default(sql`next_eight_digit_tags_id()`),
    tenantId: bigint("tenant_id", { mode: "number" })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("tags_tenant_slug").on(t.tenantId, t.slug)],
);

export const contactTags = pgTable(
  "contact_tags",
  {
    contactId: bigint("contact_id", { mode: "number" })
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    tagId: bigint("tag_id", { mode: "number" })
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.contactId, t.tagId] }),
    index("contact_tags_tag_idx").on(t.tagId),
  ],
);

export type ContactCustomFieldConfig = {
  options?: { value: string; label: string }[];
  /** Texto auxiliar exibido na gestão de campos e no formulário de contato. */
  description?: string;
};

export const contactCustomFieldDefinitions = pgTable(
  "contact_custom_field_definitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: bigint("tenant_id", { mode: "number" })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    fieldType: contactFieldTypeEnum("field_type").notNull(),
    config: jsonb("config").$type<ContactCustomFieldConfig | null>(),
    /** Valor usado quando o contato não tem linha em contact_custom_values. */
    defaultValue: jsonb("default_value").$type<unknown>(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("ccfdef_tenant_key").on(t.tenantId, t.key)],
);

export const contactCustomValues = pgTable(
  "contact_custom_values",
  {
    contactId: bigint("contact_id", { mode: "number" })
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => contactCustomFieldDefinitions.id, {
        onDelete: "cascade",
      }),
    /** JSON: string, number, boolean ou string ISO date conforme field_type */
    value: jsonb("value").$type<unknown>(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.contactId, t.fieldId] }),
    index("ccv_field_idx").on(t.fieldId),
  ],
);

export const contactLists = pgTable(
  "contact_lists",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .default(sql`next_eight_digit_contact_lists_id()`),
    tenantId: bigint("tenant_id", { mode: "number" })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("contact_lists_tenant_idx").on(t.tenantId)],
);

export const contactListMembers = pgTable(
  "contact_list_members",
  {
    listId: bigint("list_id", { mode: "number" })
      .notNull()
      .references(() => contactLists.id, { onDelete: "cascade" }),
    contactId: bigint("contact_id", { mode: "number" })
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.listId, t.contactId] }),
    index("clm_contact_idx").on(t.contactId),
  ],
);

/** Snapshot do formulário de criação de template WhatsApp (persistido no servidor). */
export type MessageTemplateDraftPayload = Record<string, unknown>;

/** Valores fixos da organização (tenant), usáveis em templates como {{chave}}. */
export const tenantFixedFields = pgTable(
  "tenant_fixed_fields",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: bigint("tenant_id", { mode: "number" })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    value: text("value").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("tenant_fixed_fields_tenant_key_idx").on(t.tenantId, t.key),
    index("tenant_fixed_fields_tenant_idx").on(t.tenantId),
  ],
);

export const messageTemplateDrafts = pgTable(
  "message_template_drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: bigint("tenant_id", { mode: "number" })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    payload: jsonb("payload").$type<MessageTemplateDraftPayload>().notNull(),
    createdBy: uuid("created_by").references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("message_template_drafts_tenant_idx").on(t.tenantId)],
);

/** Último estado notificado pela Meta (webhook message_template_status_update). */
export const wabaTemplateStatusSnapshots = pgTable(
  "waba_template_status_snapshots",
  {
    tenantId: bigint("tenant_id", { mode: "number" })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    metaTemplateId: text("meta_template_id").notNull(),
    templateName: text("template_name").notNull(),
    language: text("language").notNull().default(""),
    category: text("category"),
    status: text("status").notNull(),
    reason: text("reason"),
    rejectionInfo: jsonb("rejection_info").$type<{
      reason?: string;
      recommendation?: string;
    } | null>(),
    disableInfo: jsonb("disable_info").$type<unknown>(),
    otherInfo: jsonb("other_info").$type<unknown>(),
    webhookTime: timestamp("webhook_time", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.metaTemplateId] }),
    index("waba_template_status_snapshots_tenant_idx").on(t.tenantId),
  ],
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: bigint("tenant_id", { mode: "number" })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    templateName: text("template_name").notNull(),
    templateLanguage: text("template_language").notNull().default("pt_BR"),
    /** Body/header variable components for Graph API */
    templateComponents: jsonb("template_components").$type<unknown[]>(),
    listId: bigint("list_id", { mode: "number" }).references(
      () => contactLists.id,
      {
        onDelete: "set null",
      },
    ),
    status: campaignStatusEnum("status").notNull().default("draft"),
    /** Envio agendado (UTC); null = imediato após criar. */
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("campaigns_tenant_idx").on(t.tenantId)],
);

export const campaignRecipients = pgTable(
  "campaign_recipients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    tenantId: bigint("tenant_id", { mode: "number" })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    contactId: bigint("contact_id", { mode: "number" }).references(
      () => contacts.id,
      {
        onDelete: "set null",
      },
    ),
    phoneE164: text("phone_e164").notNull(),
    status: recipientStatusEnum("status").notNull().default("pending"),
    wamid: text("wamid"),
    lastError: text("last_error"),
    attempts: integer("attempts").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("cr_campaign_phone").on(t.campaignId, t.phoneE164),
    index("cr_campaign_idx").on(t.campaignId),
    index("cr_tenant_idx").on(t.tenantId),
    index("cr_wamid_idx").on(t.wamid),
  ],
);

/** Histórico append-only de webhooks WhatsApp (status de entrega, quick reply, etc.). */
export const whatsappDeliveryEvents = pgTable(
  "whatsapp_delivery_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: bigint("tenant_id", { mode: "number" })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    phoneNumberId: text("phone_number_id").notNull(),
    wamid: text("wamid"),
    recipientId: uuid("recipient_id").references(() => campaignRecipients.id, {
      onDelete: "set null",
    }),
    /** Ex.: `status` (callback de entrega), `user_button` (toque em quick reply). */
    source: text("source").notNull(),
    deliveryStatus: text("delivery_status"),
    errors: jsonb("errors").$type<unknown>(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    webhookTs: timestamp("webhook_ts", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("wde_tenant_wamid_idx").on(t.tenantId, t.wamid),
    index("wde_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("wde_recipient_idx").on(t.recipientId),
  ],
);

export const contactsRelations = relations(contacts, ({ many }) => ({
  tagLinks: many(contactTags),
  customValues: many(contactCustomValues),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  contactLinks: many(contactTags),
}));

export const contactTagsRelations = relations(contactTags, ({ one }) => ({
  contact: one(contacts, {
    fields: [contactTags.contactId],
    references: [contacts.id],
  }),
  tag: one(tags, {
    fields: [contactTags.tagId],
    references: [tags.id],
  }),
}));

export const contactCustomFieldDefinitionsRelations = relations(
  contactCustomFieldDefinitions,
  ({ many }) => ({
    values: many(contactCustomValues),
  }),
);

export const contactCustomValuesRelations = relations(
  contactCustomValues,
  ({ one }) => ({
    contact: one(contacts, {
      fields: [contactCustomValues.contactId],
      references: [contacts.id],
    }),
    definition: one(contactCustomFieldDefinitions, {
      fields: [contactCustomValues.fieldId],
      references: [contactCustomFieldDefinitions.id],
    }),
  }),
);

export const tenantsRelations = relations(tenants, ({ one, many }) => ({
  integration: one(tenantIntegrations),
  memberships: many(tenantMemberships),
  contacts: many(contacts),
  lists: many(contactLists),
  campaigns: many(campaigns),
}));

export const campaignsRelations = relations(campaigns, ({ many }) => ({
  recipients: many(campaignRecipients),
}));
