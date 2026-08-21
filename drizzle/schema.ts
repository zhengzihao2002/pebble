import { pgTable, pgSchema, index, foreignKey, uuid, text, timestamp, unique, boolean, uniqueIndex, jsonb, check, integer, date, numeric, primaryKey } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const neonAuth = pgSchema("neon_auth");


export const invitationInNeonAuth = neonAuth.table("invitation", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid().notNull(),
	email: text().notNull(),
	role: text(),
	status: text().notNull(),
	expiresAt: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	inviterId: uuid().notNull(),
}, (table) => [
	index("invitation_email_idx").using("btree", table.email.asc().nullsLast().op("text_ops")),
	index("invitation_organizationId_idx").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizationInNeonAuth.id],
			name: "invitation_organizationId_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.inviterId],
			foreignColumns: [userInNeonAuth.id],
			name: "invitation_inviterId_fkey"
		}).onDelete("cascade"),
]);

export const userInNeonAuth = neonAuth.table("user", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	email: text().notNull(),
	emailVerified: boolean().notNull(),
	image: text(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	role: text(),
	banned: boolean(),
	banReason: text(),
	banExpires: timestamp({ withTimezone: true, mode: 'string' }),
}, (table) => [
	unique("user_email_key").on(table.email),
]);

export const sessionInNeonAuth = neonAuth.table("session", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	expiresAt: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	token: text().notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	ipAddress: text(),
	userAgent: text(),
	userId: uuid().notNull(),
	impersonatedBy: text(),
	activeOrganizationId: text(),
}, (table) => [
	index("session_userId_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [userInNeonAuth.id],
			name: "session_userId_fkey"
		}).onDelete("cascade"),
	unique("session_token_key").on(table.token),
]);

export const organizationInNeonAuth = neonAuth.table("organization", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	slug: text().notNull(),
	logo: text(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	metadata: text(),
}, (table) => [
	uniqueIndex("organization_slug_uidx").using("btree", table.slug.asc().nullsLast().op("text_ops")),
	unique("organization_slug_key").on(table.slug),
]);

export const accountInNeonAuth = neonAuth.table("account", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: text().notNull(),
	providerId: text().notNull(),
	userId: uuid().notNull(),
	accessToken: text(),
	refreshToken: text(),
	idToken: text(),
	accessTokenExpiresAt: timestamp({ withTimezone: true, mode: 'string' }),
	refreshTokenExpiresAt: timestamp({ withTimezone: true, mode: 'string' }),
	scope: text(),
	password: text(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("account_userId_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [userInNeonAuth.id],
			name: "account_userId_fkey"
		}).onDelete("cascade"),
]);

export const verificationInNeonAuth = neonAuth.table("verification", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	identifier: text().notNull(),
	value: text().notNull(),
	expiresAt: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("verification_identifier_idx").using("btree", table.identifier.asc().nullsLast().op("text_ops")),
]);

export const jwksInNeonAuth = neonAuth.table("jwks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	publicKey: text().notNull(),
	privateKey: text().notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	expiresAt: timestamp({ withTimezone: true, mode: 'string' }),
});

export const memberInNeonAuth = neonAuth.table("member", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid().notNull(),
	userId: uuid().notNull(),
	role: text().notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("member_organizationId_idx").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops")),
	index("member_userId_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizationInNeonAuth.id],
			name: "member_organizationId_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [userInNeonAuth.id],
			name: "member_userId_fkey"
		}).onDelete("cascade"),
]);

export const projectConfigInNeonAuth = neonAuth.table("project_config", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	endpointId: text("endpoint_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	trustedOrigins: jsonb("trusted_origins").notNull(),
	socialProviders: jsonb("social_providers").notNull(),
	emailProvider: jsonb("email_provider"),
	emailAndPassword: jsonb("email_and_password"),
	allowLocalhost: boolean("allow_localhost").notNull(),
	pluginConfigs: jsonb("plugin_configs"),
	webhookConfig: jsonb("webhook_config"),
}, (table) => [
	unique("project_config_endpoint_id_key").on(table.endpointId),
]);

export const category = pgTable("category", {
	id: text().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	name: text().notNull(),
	iconKey: text("icon_key").default('Home').notNull(),
	color: text().default('#1F5A45').notNull(),
	isSystem: boolean("is_system").default(false).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("category_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [userInNeonAuth.id],
			name: "category_user_id_fkey"
		}).onDelete("cascade"),
	unique("category_user_name_unique").on(table.userId, table.name),
	check("category_name_not_blank", sql`btrim(name) <> ''::text`),
]);

export const balanceAdjustment = pgTable("balance_adjustment", {
	id: text().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	description: text().default(').notNull(),
	transactionDate: date("transaction_date").notNull(),
	paymentMethod: text("payment_method").default('Checking').notNull(),
	amount: numeric({ precision: 12, scale:  2 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("balance_adjustment_user_date_idx").using("btree", table.userId.asc().nullsLast().op("date_ops"), table.transactionDate.desc().nullsFirst().op("date_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [userInNeonAuth.id],
			name: "balance_adjustment_user_id_fkey"
		}).onDelete("cascade"),
	check("balance_adjustment_payment_method_check", sql`payment_method = ANY (ARRAY['Checking'::text, 'Cash'::text])`),
]);

export const expense = pgTable("expense", {
	id: text().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	description: text().default(').notNull(),
	category: text().default(').notNull(),
	tag: text().default(').notNull(),
	transactionDate: date("transaction_date").notNull(),
	paymentMethod: text("payment_method").default('Checking').notNull(),
	amount: numeric({ precision: 12, scale:  2 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("expense_user_date_idx").using("btree", table.userId.asc().nullsLast().op("date_ops"), table.transactionDate.desc().nullsFirst().op("date_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [userInNeonAuth.id],
			name: "expense_user_id_fkey"
		}).onDelete("cascade"),
	check("expense_amount_check", sql`amount <= (0)::numeric`),
	check("expense_payment_method_check", sql`payment_method = ANY (ARRAY['Checking'::text, 'Cash'::text])`),
]);

export const income = pgTable("income", {
	id: text().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	description: text().default(').notNull(),
	category: text().default(').notNull(),
	transactionDate: date("transaction_date").notNull(),
	paymentMethod: text("payment_method").default('Checking').notNull(),
	grossAmount: numeric("gross_amount", { precision: 12, scale:  2 }).notNull(),
	netAmount: numeric("net_amount", { precision: 12, scale:  2 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("income_user_date_idx").using("btree", table.userId.asc().nullsLast().op("date_ops"), table.transactionDate.desc().nullsFirst().op("date_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [userInNeonAuth.id],
			name: "income_user_id_fkey"
		}).onDelete("cascade"),
	check("income_amounts_check", sql`(gross_amount >= (0)::numeric) AND (net_amount >= (0)::numeric)`),
	check("income_payment_method_check", sql`payment_method = ANY (ARRAY['Checking'::text, 'Cash'::text])`),
]);

export const goal = pgTable("goal", {
	id: text().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	name: text().notNull(),
	currentAmount: numeric("current_amount", { precision: 12, scale:  2 }).default('0').notNull(),
	targetAmount: numeric("target_amount", { precision: 12, scale:  2 }).notNull(),
	targetDate: text("target_date").default(').notNull(),
	iconKey: text("icon_key").default('Shield').notNull(),
	color: text().default('#1F5A45').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("goal_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [userInNeonAuth.id],
			name: "goal_user_id_fkey"
		}).onDelete("cascade"),
	check("goal_amounts_check", sql`(current_amount >= (0)::numeric) AND (target_amount > (0)::numeric)`),
]);

export const userAccount = pgTable("user_account", {
	userId: uuid("user_id").primaryKey().notNull(),
	checkingOpening: numeric("checking_opening", { precision: 12, scale:  2 }).default('0').notNull(),
	cashOpening: numeric("cash_opening", { precision: 12, scale:  2 }).default('0').notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [userInNeonAuth.id],
			name: "user_account_user_id_fkey"
		}).onDelete("cascade"),
]);

export const budget = pgTable("budget", {
	userId: uuid("user_id").notNull(),
	category: text().notNull(),
	annualAmount: numeric("annual_amount", { precision: 12, scale:  2 }).default('0').notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [userInNeonAuth.id],
			name: "budget_user_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.userId, table.category], name: "budget_pkey"}),
	check("budget_amount_check", sql`annual_amount >= (0)::numeric`),
]);
