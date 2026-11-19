'use server';

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { neonSql } from '@/db';
import { withSessionUser } from '@/lib/actions/withSessionUser';
import {
  INCOME_SHARING_KEYS, PARTNER_PERMISSIONS, type PartnerCreation, type PartnerInboxItem, type PartnerPermissions,
  type PartnerSettingsData, type PartnerWorkspaceData, type SharedTransaction, type SharedTransactionChange, type SharingCategory,
} from '@/lib/partner';
import { isClientId } from '@/lib/offline/clientId';
import { isYmd } from '@/lib/recurring/occurrences';
import { MAX_TAG_NAME_LENGTH } from '@/lib/transactionTags';
import { composeDescription } from '@/lib/transactionDescription';

import { PARTNER_VIEW_COOKIE } from '@/lib/partnerPaths';
import { partnerViewPair } from '@/lib/partnerView.server';
const INVITE_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const digest = (code: string) => createHash('sha256').update(code).digest('hex');
const lifecycleLock = () => neonSql`SELECT pg_advisory_xact_lock(hashtext('pebble.partner-mode.v1'))`;

type FailureReason = 'unavailable' | 'databasePermission' | 'unexpected' | 'invalid' | 'invite' | 'paired' | 'noPair' | 'denied' | 'settingsOwnOnly' | 'budgetUnavailable' | 'pendingPermissions';
const failure = (reason: FailureReason) => ({ ok: false as const, reason, error: 'Partner Mode action failed.' });
const success = { ok: true as const };

async function run<T>(handler: () => Promise<T>) {
  try { return await handler(); }
  catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    console.error('[pebble partner] request failed', code);
    if (code === '42P01' || code === '42703') return failure('unavailable');
    if (code === '42501') return failure('databasePermission');
    return failure('unexpected');
  }
}

async function readSettings(userId: string) {
  const [viewing, rows] = await Promise.all([
    partnerViewPair(userId),
    neonSql`SELECT profile.name AS "partnerName", pair.id AS "pairId", own.permissions, own.shared_categories AS "sharedCategories",
      own.configured_at IS NOT NULL AS configured, partner.configured_at IS NOT NULL AS "partnerConfigured",
      (SELECT expires_at FROM public.pebble_partner_invite
       WHERE owner_id = ${userId}::uuid AND expires_at > now()) AS "inviteExpires"
      FROM (SELECT ${userId}::uuid AS user_id) actor
      LEFT JOIN public.pebble_partner_member own ON own.user_id = actor.user_id
      LEFT JOIN public.pebble_partner_pair pair ON pair.id = own.pair_id AND pair.ended_at IS NULL
      LEFT JOIN public.pebble_partner_member partner ON partner.pair_id = pair.id AND partner.user_id <> own.user_id
      LEFT JOIN neon_auth."user" profile ON profile.id = partner.user_id`,
  ]);
  const row = rows[0];
  const categories = row.pairId === null ? [] : await neonSql`
    SELECT id, name FROM public.category WHERE user_id = ${userId}::uuid ORDER BY name, id`;
  const data: PartnerSettingsData = {
    pairId: row.pairId,
    configured: row.configured,
    partnerConfigured: row.partnerConfigured,
    partnerName: row.partnerName,
    inviteExpires: row.inviteExpires ? new Date(row.inviteExpires).toISOString() : null,
    permissions: row.permissions ?? {},
    sharedCategories: row.sharedCategories ?? [],
    categories: categories as SharingCategory[],
    viewingPartner: viewing !== null,
  };
  return { ...success, data };
}

async function createInvite(userId: string) {
  return run(async () => {
    const code = randomBytes(16).toString('base64url');
    const [, rows] = await neonSql.transaction([
      lifecycleLock(),
      neonSql`INSERT INTO public.pebble_partner_invite (owner_id, digest, expires_at)
        SELECT ${userId}::uuid, ${digest(code)}, now() + interval '15 minutes'
        WHERE NOT EXISTS (SELECT 1 FROM public.pebble_partner_member WHERE user_id = ${userId}::uuid)
        ON CONFLICT (owner_id) DO UPDATE SET digest = excluded.digest, expires_at = excluded.expires_at
        RETURNING expires_at`,
    ]);
    if (!rows.length) return failure('paired');
    return { ...success, code, expires: new Date(rows[0].expires_at).toISOString() };
  });
}

async function revokeInvite(userId: string) {
  return run(async () => {
    await neonSql.transaction([lifecycleLock(),
      neonSql`DELETE FROM public.pebble_partner_invite WHERE owner_id = ${userId}::uuid`]);
    return success;
  });
}

async function acceptInvite(userId: string, input: string) {
  const code = typeof input === 'string' ? input.trim() : '';
  if (!INVITE_PATTERN.test(code)) return failure('invite');
  return run(async () => {
    const [, rows] = await neonSql.transaction([
      lifecycleLock(),
      neonSql`WITH claimed AS (
        DELETE FROM public.pebble_partner_invite invite
        WHERE digest = ${digest(code)} AND expires_at > now() AND owner_id <> ${userId}::uuid
          AND NOT EXISTS (SELECT 1 FROM public.pebble_partner_member
            WHERE user_id IN (invite.owner_id, ${userId}::uuid))
        RETURNING owner_id
      ), made AS (
        INSERT INTO public.pebble_partner_pair (id, first_user, second_user)
        SELECT ${randomUUID()}::uuid, owner_id, ${userId}::uuid FROM claimed
        RETURNING id, first_user, second_user
      ), revoked AS (
        DELETE FROM public.pebble_partner_invite WHERE owner_id = ${userId}::uuid
          AND EXISTS (SELECT 1 FROM claimed)
      )
      INSERT INTO public.pebble_partner_member (user_id, pair_id)
      SELECT first_user, id FROM made UNION ALL SELECT second_user, id FROM made
      RETURNING user_id`,
    ]);
    return rows.length === 2 ? success : failure('invite');
  });
}

async function savePermissions(userId: string, pairId: string, permitted: PartnerPermissions, categoryIds: string[]) {
  if (await partnerViewPair(userId)) return failure('settingsOwnOnly');
  if (!validId(pairId) || !permitted || typeof permitted !== 'object' || !Array.isArray(categoryIds)
    || categoryIds.some(id => typeof id !== 'string' || id.includes('\0'))) return failure('invalid');
  const permissions: PartnerPermissions = {};
  for (const permission of PARTNER_PERMISSIONS) permissions[permission] = permitted[permission] === true;
  return run(async () => {
    const [, rows] = await neonSql.transaction([
      lifecycleLock(),
      neonSql`UPDATE public.pebble_partner_member SET permissions = ${JSON.stringify(permissions)}::jsonb,
          configured_at = coalesce(configured_at, now()),
          shared_categories = ARRAY(
            SELECT id FROM public.category WHERE user_id = ${userId}::uuid AND id = ANY(${categoryIds}::text[])
            UNION
            SELECT id FROM unnest(${INCOME_SHARING_KEYS}::text[]) AS allowed(id) WHERE id = ANY(${categoryIds}::text[])
          )
        WHERE user_id = ${userId}::uuid AND pair_id = ${pairId}::uuid RETURNING user_id`,
    ]);
    return rows.length ? success : failure('noPair');
  });
}

async function unpair(userId: string, pairId: string) {
  if (await partnerViewPair(userId)) return failure('settingsOwnOnly');
  if (!validId(pairId)) return failure('invalid');
  return run(async () => {
    const [, rows] = await neonSql.transaction([
      lifecycleLock(),
      neonSql`WITH ended AS (
        UPDATE public.pebble_partner_pair SET ended_at = now()
        WHERE ended_at IS NULL AND id = ${pairId}::uuid
          AND EXISTS (SELECT 1 FROM public.pebble_partner_member WHERE user_id = ${userId}::uuid AND pair_id = ${pairId}::uuid)
        RETURNING id
      )
      DELETE FROM public.pebble_partner_member WHERE pair_id IN (SELECT id FROM ended) RETURNING user_id`,
    ]);
    if (!rows.length) return failure('noPair');
    (await cookies()).delete(PARTNER_VIEW_COOKIE);
    return success;
  });
}

async function enterPartner(userId: string, pairId: string) {
  if (!validId(pairId)) return failure('invalid');
  return run(async () => {
    const rows = await neonSql`SELECT 1 FROM public.pebble_partner_scope WHERE viewer_id = ${userId}::uuid AND pair_id = ${pairId}::uuid`;
    if (!rows.length) return failure('pendingPermissions');
    (await cookies()).set(PARTNER_VIEW_COOKIE, userId + ':' + pairId, {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 8 * 60 * 60,
    });
    return success;
  });
}

async function leavePartner() {
  (await cookies()).delete(PARTNER_VIEW_COOKIE);
  return success;
}

async function readWorkspace(userId: string) {
  const pairId = await partnerViewPair(userId);
  if (!pairId) return failure('denied');
  // One permission snapshot per response. Only authorized fields leave the database.
  const [people, transactions, accounts, goals, entryAccounts, entryCategories, budgetCategories, budgets, scheduled, categories] = await neonSql.transaction([
    neonSql`SELECT profile.name, scope.permissions, scope.pair_id AS "pairId", scope.shared_categories AS "categories" FROM public.pebble_partner_scope scope
      JOIN neon_auth."user" profile ON profile.id = scope.owner_id WHERE scope.viewer_id = ${userId}::uuid AND scope.pair_id = ${pairId}::uuid`,
    neonSql`WITH ledger AS (
      SELECT e.id,e.user_id,e.account_id,'expense'::text AS kind,e.transaction_date,e.description,e.category,e.tag,
        e.amount,NULL::numeric AS gross_amount,e.recurring_rule_id IS NULL AND e.credit_card_payoff IS NULL AS editable
      FROM public.expense e JOIN public.pebble_partner_scope s ON s.owner_id=e.user_id
      WHERE s.viewer_id=${userId}::uuid AND s.pair_id=${pairId}::uuid AND s.permissions @> '{"expenses":true}'::jsonb
      UNION ALL
      SELECT i.id,i.user_id,i.account_id,'income',i.transaction_date,i.description,i.category,'',
        i.net_amount,i.gross_amount,i.recurring_rule_id IS NULL
      FROM public.income i JOIN public.pebble_partner_scope s ON s.owner_id=i.user_id
      WHERE s.viewer_id=${userId}::uuid AND s.pair_id=${pairId}::uuid AND s.permissions @> '{"income":true}'::jsonb
    )
    SELECT l.id,l.kind,l.transaction_date::text AS date,
      CASE WHEN v.visible THEN split_part(l.description,chr(10),1) ELSE '' END AS title,
      CASE WHEN v.visible THEN l.category ELSE '' END AS category,
      CASE WHEN s.permissions @> '{"amounts":true}'::jsonb THEN l.amount::float8 END AS amount,
      CASE WHEN s.permissions @> '{"notes":true}'::jsonb AND strpos(l.description,chr(10))>0
        THEN substr(l.description,strpos(l.description,chr(10))+1) END AS notes,
      CASE WHEN v.visible THEN l.tag ELSE '' END AS tag,
      (v.visible AND l.kind='expense' AND s.permissions @> '{"editTags":true}'::jsonb) AS "canEditTag",
      (v.visible AND a.status='active' AND l.editable AND s.permissions @> '{"editTransactions":true}'::jsonb) AS "canEdit",
      (s.permissions @> '{"notes":true}'::jsonb) AS "notesVisible",
      NOT v.visible AS hidden,
      CASE WHEN s.permissions @> '{"accounts":true}'::jsonb THEN a.name END AS "accountName",
      CASE WHEN s.permissions @> '{"accounts":true}'::jsonb THEN a.id END AS "accountId",
      CASE WHEN v.visible AND s.permissions @> '{"amounts":true}'::jsonb THEN l.gross_amount::float8 END AS "grossAmount"
    FROM ledger l
    JOIN public.pebble_partner_scope s ON s.owner_id=l.user_id AND s.viewer_id=${userId}::uuid AND s.pair_id=${pairId}::uuid
    JOIN public.account a ON a.id=l.account_id AND a.user_id=l.user_id AND NOT a.is_ghost
    CROSS JOIN LATERAL (
      SELECT CASE WHEN l.kind='income' THEN ('income:' || l.category)=ANY(s.shared_categories) ELSE
        EXISTS (SELECT 1 FROM public.category c WHERE c.user_id=s.owner_id AND c.name=l.category AND c.id=ANY(s.shared_categories)) END AS visible
    ) v ORDER BY date DESC,l.id DESC`,
    neonSql`SELECT a.id,a.name,a.kind,a.status,(a.kind IN ('bank','cash') AND a.status='active' AND NOT a.is_default) AS editable
      FROM public.pebble_partner_scope s
      JOIN public.account a ON a.user_id = s.owner_id AND NOT a.is_ghost
      WHERE s.viewer_id = ${userId}::uuid AND s.pair_id = ${pairId}::uuid AND s.permissions->'accounts' = 'true'::jsonb ORDER BY a.name`,
    neonSql`SELECT g.id, g.name, g.target_date AS date, g.icon_key AS "iconKey", g.color,
        CASE WHEN s.permissions->'amounts' = 'true'::jsonb THEN g.target_amount::float8 END AS target,
        CASE WHEN s.permissions->'amounts' = 'true'::jsonb THEN g.current_amount::float8 END AS current
      FROM public.pebble_partner_scope s JOIN public.goal g ON g.user_id = s.owner_id
      WHERE s.viewer_id = ${userId}::uuid AND s.pair_id = ${pairId}::uuid AND s.permissions->'personalGoals' = 'true'::jsonb ORDER BY g.created_at DESC`,
    neonSql`SELECT a.id, a.name FROM public.pebble_partner_scope s
      JOIN public.account a ON a.user_id = s.owner_id AND NOT a.is_ghost AND a.status = 'active' AND a.kind IN ('cash','bank')
      WHERE s.viewer_id = ${userId}::uuid AND s.pair_id = ${pairId}::uuid
        AND (s.permissions->'addTransactions' = 'true'::jsonb OR s.permissions->'addScheduled' = 'true'::jsonb) AND s.permissions->'accounts' = 'true'::jsonb ORDER BY a.name`,
    neonSql`SELECT c.id, c.name FROM public.pebble_partner_scope s
      JOIN public.category c ON c.user_id = s.owner_id AND c.id = ANY(s.shared_categories)
      WHERE s.viewer_id = ${userId}::uuid AND s.pair_id = ${pairId}::uuid
        AND (s.permissions->'addTransactions' = 'true'::jsonb OR s.permissions->'addScheduled' = 'true'::jsonb)
        AND s.permissions->'accounts' = 'true'::jsonb ORDER BY c.name`,
    neonSql`SELECT c.id, c.name FROM public.pebble_partner_scope s
      JOIN public.category c ON c.user_id = s.owner_id AND c.id = ANY(s.shared_categories)
      LEFT JOIN LATERAL (
        SELECT year FROM public.annual_budget_plan p WHERE p.user_id=s.owner_id AND state='scheduled' AND effective_at<=now()
        ORDER BY year DESC LIMIT 1
      ) plan ON true
      LEFT JOIN public.annual_budget_plan_item i ON i.user_id=s.owner_id AND i.year=plan.year AND i.category_id=c.id
      LEFT JOIN public.budget b ON b.user_id=s.owner_id AND b.category=c.name AND plan.year IS NULL
      WHERE s.viewer_id = ${userId}::uuid AND s.pair_id = ${pairId}::uuid
        AND s.permissions->'addBudgets' = 'true'::jsonb AND i.category_id IS NULL AND b.category IS NULL ORDER BY c.name`,
    neonSql`SELECT c.id,c.name,coalesce(i.annual_amount,b.annual_amount)::float8 AS amount
      FROM public.pebble_partner_scope s JOIN public.category c ON c.user_id=s.owner_id AND c.id=ANY(s.shared_categories)
      LEFT JOIN LATERAL (
        SELECT year FROM public.annual_budget_plan p WHERE p.user_id=s.owner_id AND state='scheduled' AND effective_at<=now()
        ORDER BY year DESC LIMIT 1
      ) plan ON true
      LEFT JOIN public.annual_budget_plan_item i ON i.user_id=s.owner_id AND i.year=plan.year AND i.category_id=c.id
      LEFT JOIN public.budget b ON b.user_id=s.owner_id AND b.category=c.name AND plan.year IS NULL
      WHERE s.viewer_id=${userId}::uuid AND s.pair_id=${pairId}::uuid AND s.permissions @> '{"budgets":true}'::jsonb
        AND (i.category_id IS NOT NULL OR b.category IS NOT NULL) ORDER BY c.name`,
    neonSql`SELECT r.id, r.kind, split_part(r.description, chr(10), 1) AS title, r.start_date::text AS date,
        CASE WHEN s.permissions->'amounts' = 'true'::jsonb THEN r.amount::float8 END AS amount,
        r.frequency, r.status='paused' AS paused, r.category,
        CASE WHEN s.permissions->'accounts' = 'true'::jsonb THEN a.id END AS "accountId",
        CASE WHEN s.permissions->'accounts' = 'true'::jsonb THEN a.name END AS "accountName",
        r.end_mode AS "endMode", r.end_count AS "endCount", r.end_date::text AS "endDate",
        r.materialized_through::text AS "materializedThrough"
      FROM public.pebble_partner_scope s JOIN public.recurring_rule r ON r.user_id=s.owner_id AND r.status <> 'deleted'
      JOIN public.account a ON a.id=r.account_id AND a.user_id=r.user_id AND NOT a.is_ghost
      WHERE s.viewer_id=${userId}::uuid AND s.pair_id=${pairId}::uuid AND s.permissions @> '{"scheduled":true}'::jsonb
        AND ((r.kind='expense' AND EXISTS (SELECT 1 FROM public.category c WHERE c.user_id=s.owner_id AND c.name=r.category
          AND c.id=ANY(s.shared_categories))) OR (r.kind='income' AND ('income:' || r.category)=ANY(s.shared_categories)))
      ORDER BY r.start_date, r.id`,
    neonSql`SELECT c.id,c.name,c.icon_key AS "iconKey",c.color,c.is_system AS "isSystem",c.sort_order AS "sortOrder"
      FROM public.pebble_partner_scope s JOIN public.category c ON c.user_id=s.owner_id AND c.id=ANY(s.shared_categories)
      WHERE s.viewer_id=${userId}::uuid AND s.pair_id=${pairId}::uuid
        AND (s.permissions @> '{"expenses":true}'::jsonb OR s.permissions @> '{"budgets":true}'::jsonb)
      ORDER BY c.sort_order,c.name`,
  ], { isolationLevel: 'RepeatableRead', readOnly: true });
  if (!people.length) return failure('noPair');
  const accessVersion = digest(JSON.stringify([people[0].pairId, people[0].permissions, people[0].categories]));
  const data: PartnerWorkspaceData = { accessVersion, name: people[0].name, pairId: people[0].pairId, permissions: people[0].permissions,
    transactions: transactions as SharedTransaction[], accounts: accounts as PartnerWorkspaceData['accounts'],
    goals: goals as PartnerWorkspaceData['goals'], entryAccounts: entryAccounts as PartnerWorkspaceData['entryAccounts'],
    entryCategories: entryCategories as SharingCategory[], budgetCategories: budgetCategories as SharingCategory[],
    categories: categories as PartnerWorkspaceData['categories'],
    budgets: budgets as PartnerWorkspaceData['budgets'], scheduled: scheduled as PartnerWorkspaceData['scheduled'],
    entryIncome: (people[0].permissions.addTransactions === true || people[0].permissions.addScheduled === true) && people[0].permissions.accounts === true
      ? INCOME_SHARING_KEYS.filter(key => people[0].categories.includes(key)).map(key => key.slice(7)) : [],
  };
  return { ...success, data };
}

async function changeSharedTransaction(userId: string, id: string, type: SharedTransaction['kind'], change: SharedTransactionChange) {
  const pairId = await partnerViewPair(userId);
  if (!pairId) return failure('denied');
  if (typeof id !== 'string' || !id || id.includes('\0') || (type !== 'expense' && type !== 'income')
    || !change || !['tag', 'edit'].includes(change.kind)) return failure('invalid');
  const tag = change.kind === 'tag' && typeof change.tag === 'string' ? change.tag.trim() : '';
  const title = change.kind === 'edit' && typeof change.title === 'string' ? change.title.trim() : '';
  const date = change.kind === 'edit' ? change.date : null;
  const notes = change.kind === 'edit' ? change.notes : undefined;
  if (change.kind === 'tag' && (type !== 'expense' || typeof change.tag !== 'string' || tag.length > MAX_TAG_NAME_LENGTH || tag.includes('\0'))) {
    return failure('invalid');
  }
  if (change.kind === 'edit' && (!title || title.length > 300 || /[\0\r\n]/.test(title)
    || typeof date !== 'string' || !isYmd(date)
    || (notes !== undefined && (typeof notes !== 'string' || notes.length > 4000 || notes.includes('\0'))))) {
    return failure('invalid');
  }
  const permission = change.kind === 'tag' ? 'editTags' : 'editTransactions';
  return run(async () => {
    // All SQL fragments come from fixed choices. Request data travels as parameters.
    const table = type === 'expense' ? 'public.expense' : 'public.income';
    const categoryScope = type === 'expense'
      ? 'EXISTS (SELECT 1 FROM public.category c WHERE c.user_id = s.owner_id AND c.name = tx.category AND c.id = ANY(s.shared_categories))'
      : "('income:' || tx.category) = ANY(s.shared_categories)";
    const mutable = change.kind === 'tag' ? '' : `AND a.status = 'active' AND tx.recurring_rule_id IS NULL
      ${type === 'expense' ? 'AND tx.credit_card_payoff IS NULL' : ''}`;
    const source = 'public.pebble_partner_scope s, public.account a';
    const values: (string | null)[] = [userId, pairId, id, type === 'expense' ? 'expenses' : 'income', permission];
    let command: string;
    if (change.kind === 'tag') {
      command = `UPDATE ${table} tx SET tag = $6 FROM ${source}`;
      values.push(tag);
    } else {
      command = `UPDATE ${table} tx SET transaction_date = $6::date,
        description = $7::text || CASE
          WHEN $8::text IS NOT NULL THEN CASE WHEN $8 = '' THEN '' ELSE chr(10) || $8 END
          WHEN strpos(tx.description, chr(10)) > 0 THEN substr(tx.description, strpos(tx.description, chr(10)))
          ELSE '' END
        FROM ${source}`;
      values.push(date, title, notes ?? null);
    }
    const statement = neonSql.query(`${command}
      WHERE s.viewer_id = $1::uuid AND s.pair_id = $2::uuid AND tx.user_id = s.owner_id AND tx.id = $3
        AND s.permissions->($4::text) = 'true'::jsonb AND s.permissions->($5::text) = 'true'::jsonb
        AND a.user_id = tx.user_id AND a.id = tx.account_id AND NOT a.is_ghost AND ${categoryScope}
        ${mutable}
      RETURNING tx.id`, values);
    const [, , , rows] = await neonSql.transaction([
      lifecycleLock(),
      neonSql`SELECT pg_advisory_xact_lock(hashtext('pebble.user-write'), hashtext(owner_id::text))
        FROM public.pebble_partner_scope WHERE viewer_id = ${userId}::uuid AND pair_id = ${pairId}::uuid`,
      neonSql`SELECT set_config('pebble.guest_actor', ${userId}, true),
        (SELECT count(*) FROM public.pebble_partner_inbox WHERE false)`,
      statement,
    ]);
    if (!rows.length) return failure('denied');
    revalidatePath('/', 'layout');
    return success;
  });
}

const validName = (value: unknown, limit: number) =>
  typeof value === 'string' && !!value.trim() && value.trim().length <= limit && !/[\0\r\n]/.test(value);
const validTextId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 200 && !value.includes('\0');

async function createSharedRecord(userId: string, input: PartnerCreation) {
  const pairId = await partnerViewPair(userId);
  if (!pairId) return failure('denied');
  if (!input) return failure('invalid');
  return run(async () => {
    let statement;
    if (input.kind === 'transaction') {
      if (!isClientId(input.id) || !validTextId(input.accountId) || !validTextId(input.categoryId)
        || !validName(input.title, 300) || typeof input.date !== 'string' || !isYmd(input.date)
        || !validCents(input.amount) || (input.type !== 'expense' && input.type !== 'income')
        || (input.notes !== undefined && (typeof input.notes !== 'string' || input.notes.length > 4000 || input.notes.includes('\0')))) {
        return failure('invalid');
      }
      const description = composeDescription(input.title, input.notes ?? '');
      if (input.type === 'expense') {
        statement = neonSql`WITH allowed AS (
          SELECT s.owner_id, a.id AS account_id, a.name AS account_name, c.name AS category
          FROM public.pebble_partner_scope s
          JOIN public.account a ON a.user_id=s.owner_id AND a.id=${input.accountId} AND a.status='active'
            AND NOT a.is_ghost AND a.kind IN ('cash','bank')
          JOIN public.category c ON c.user_id=s.owner_id AND c.id=${input.categoryId} AND c.id=ANY(s.shared_categories)
          WHERE s.viewer_id=${userId}::uuid AND s.pair_id=${pairId}::uuid
            AND s.permissions @> '{"addTransactions":true,"accounts":true}'::jsonb
        ), inserted AS (
          INSERT INTO public.expense (id,user_id,account_id,payment_method,description,category,transaction_date,amount)
          SELECT ${input.id},owner_id,account_id,account_name,${description},category,${input.date}::date,${-input.amount / 100}
          FROM allowed ON CONFLICT (id) DO NOTHING RETURNING id
        )
        SELECT id FROM inserted UNION ALL SELECT e.id FROM public.expense e JOIN allowed a ON a.owner_id=e.user_id
          WHERE e.id=${input.id} AND e.account_id=a.account_id AND e.category=a.category AND e.description=${description}
            AND e.transaction_date=${input.date}::date AND e.amount=${-input.amount / 100}`;
      } else {
        const category = input.categoryId;
        const gross = category === 'Side Cash' ? input.amount : input.gross;
        if (!INCOME_SHARING_KEYS.some(key => key === 'income:' + category) || !validCents(gross) || gross < input.amount) {
          return failure('invalid');
        }
        statement = neonSql`WITH allowed AS (
          SELECT s.owner_id, a.id AS account_id, a.name AS account_name
          FROM public.pebble_partner_scope s
          JOIN public.account a ON a.user_id=s.owner_id AND a.id=${input.accountId} AND a.status='active'
            AND NOT a.is_ghost AND a.kind IN ('cash','bank')
          WHERE s.viewer_id=${userId}::uuid AND s.pair_id=${pairId}::uuid
            AND s.permissions @> '{"addTransactions":true,"accounts":true}'::jsonb
            AND ${'income:' + category}=ANY(s.shared_categories)
        ), inserted AS (
          INSERT INTO public.income (id,user_id,account_id,payment_method,description,category,transaction_date,gross_amount,net_amount)
          SELECT ${input.id},owner_id,account_id,account_name,${description},${category},${input.date}::date,${gross / 100},${input.amount / 100}
          FROM allowed ON CONFLICT (id) DO NOTHING RETURNING id
        )
        SELECT id FROM inserted UNION ALL SELECT i.id FROM public.income i JOIN allowed a ON a.owner_id=i.user_id
          WHERE i.id=${input.id} AND i.account_id=a.account_id AND i.category=${category} AND i.description=${description}
            AND i.transaction_date=${input.date}::date AND i.gross_amount=${gross / 100} AND i.net_amount=${input.amount / 100}`;
      }
    } else if (input.kind === 'goal') {
      if (!(input.edit ? validTextId(input.id) : validId(input.id)) || !validName(input.name, 80)
        || (!input.edit || input.target !== undefined) && !validCents(input.target ?? 0)
        || typeof input.date !== 'string' || !isYmd(input.date)) return failure('invalid');
      const name = input.name.trim();
      const target = input.target === undefined ? null : input.target / 100;
      statement = input.edit ? neonSql`UPDATE public.goal g
        SET name=${name},target_amount=coalesce(${target}::numeric,g.target_amount),target_date=${input.date}
        FROM public.pebble_partner_scope s
        WHERE s.viewer_id=${userId}::uuid AND s.pair_id=${pairId}::uuid AND g.user_id=s.owner_id
          AND g.id=${input.id} AND s.permissions @> '{"personalGoals":true,"editPersonalGoals":true}'::jsonb RETURNING g.id`
        : neonSql`WITH allowed AS (
          SELECT owner_id FROM public.pebble_partner_scope WHERE viewer_id=${userId}::uuid AND pair_id=${pairId}::uuid
            AND permissions @> '{"addPersonalGoals":true}'::jsonb
        ), inserted AS (
          INSERT INTO public.goal (id,user_id,name,current_amount,target_amount,target_date)
          SELECT ${input.id},owner_id,${name},0,${target},${input.date}
          FROM allowed ON CONFLICT (id) DO NOTHING RETURNING id
        )
        SELECT id FROM inserted UNION ALL SELECT g.id FROM public.goal g JOIN allowed a ON a.owner_id=g.user_id
          WHERE g.id=${input.id} AND g.name=${name} AND g.target_amount=${target} AND g.target_date=${input.date}`;
    } else if (input.kind === 'account') {
      if (!(input.edit ? validTextId(input.id) : validId(input.id)) || !validName(input.name, 40) || (input.accountKind !== 'bank' && input.accountKind !== 'cash')
        || (!input.edit && input.accountKind === 'bank' && (typeof input.last4 !== 'string' || !/^\d{4}$/.test(input.last4)))) {
        return failure('invalid');
      }
      const name = input.name.trim();
      const last4 = input.accountKind === 'bank' ? input.last4 ?? null : null;
      statement = input.edit ? neonSql`UPDATE public.account a SET name=${name},updated_at=now()
        FROM public.pebble_partner_scope s
        WHERE s.viewer_id=${userId}::uuid AND s.pair_id=${pairId}::uuid AND a.user_id=s.owner_id AND a.id=${input.id}
          AND a.kind IN ('bank','cash') AND a.status='active' AND NOT a.is_ghost AND NOT a.is_default
          AND s.permissions @> '{"accounts":true,"editAccounts":true}'::jsonb RETURNING a.id`
        : neonSql`WITH allowed AS (
          SELECT owner_id FROM public.pebble_partner_scope WHERE viewer_id=${userId}::uuid AND pair_id=${pairId}::uuid
            AND permissions @> '{"addAccounts":true}'::jsonb
        ), inserted AS (
          INSERT INTO public.account (id,user_id,name,kind,last4,sort_order)
          SELECT ${input.id},owner_id,${name},${input.accountKind},${last4},
            coalesce((SELECT max(sort_order)+1 FROM public.account WHERE user_id=owner_id),0)
          FROM allowed ON CONFLICT DO NOTHING RETURNING id
        )
        SELECT id FROM inserted UNION ALL SELECT a.id FROM public.account a JOIN allowed s ON s.owner_id=a.user_id
          WHERE a.id=${input.id} AND a.name=${name} AND a.kind=${input.accountKind} AND a.last4 IS NOT DISTINCT FROM ${last4}::text`;
    } else if (input.kind === 'budget') {
      if (!validTextId(input.categoryId) || !validCents(input.target)) return failure('invalid');
      const required = input.edit ? '{"budgets":true,"editBudgets":true}' : '{"addBudgets":true}';
      const operation = input.edit ? 'edit' : 'add';
      const target = input.target / 100;
      // The legacy and effective annual budget are checked under the owner's write lock.
      statement = neonSql`WITH allowed AS MATERIALIZED (
        SELECT s.owner_id,c.name,coalesce(i.annual_amount,b.annual_amount) AS current_amount
        FROM public.pebble_partner_scope s
        JOIN public.category c ON c.id=${input.categoryId} AND c.user_id=s.owner_id AND c.id=ANY(s.shared_categories)
        LEFT JOIN LATERAL (
          SELECT year FROM public.annual_budget_plan p WHERE p.user_id=s.owner_id AND state='scheduled' AND effective_at<=now()
          ORDER BY year DESC LIMIT 1
        ) plan ON true
        LEFT JOIN public.annual_budget_plan_item i ON i.user_id=s.owner_id AND i.year=plan.year AND i.category_id=c.id
        LEFT JOIN public.budget b ON b.user_id=s.owner_id AND b.category=c.name AND plan.year IS NULL
        WHERE s.viewer_id=${userId}::uuid AND s.pair_id=${pairId}::uuid AND s.permissions @> ${required}::jsonb
          AND (i.category_id IS NOT NULL OR b.category IS NOT NULL)=${input.edit === true}
      ), saved AS MATERIALIZED (
        SELECT owner_id,name,public.pebble_patch_current_annual_budgets(
          owner_id,jsonb_build_object(name,${target}::numeric)) AS updated FROM allowed
        WHERE current_amount IS DISTINCT FROM ${target}::numeric
      ), notified AS (
        INSERT INTO public.pebble_partner_inbox(owner_id,guest_id,pair_id,operation,resource,label)
        SELECT owner_id,${userId}::uuid,${pairId}::uuid,${operation},'budget',name FROM saved WHERE updated RETURNING true AS updated
      )
      SELECT updated FROM notified UNION ALL SELECT true FROM allowed WHERE current_amount=${target}::numeric`;
    } else if (input.kind === 'schedule') {
      if (!validId(input.id) || !validTextId(input.accountId) || !validTextId(input.categoryId)
        || !validName(input.title, 300) || typeof input.date !== 'string' || !isYmd(input.date)
        || !validCents(input.amount) || (input.type !== 'expense' && input.type !== 'income')
        || !['once','weekly','biweekly','monthly','yearly'].includes(input.frequency)
        || (input.notes !== undefined && (typeof input.notes !== 'string' || input.notes.length > 4000 || input.notes.includes('\0')))) {
        return failure('invalid');
      }
      const gross = input.type === 'expense' ? null : input.categoryId === 'Side Cash' ? input.amount : input.gross;
      if (gross !== null && (!validCents(gross) || gross < input.amount || !INCOME_SHARING_KEYS.some(key => key === 'income:' + input.categoryId))) {
        return failure('invalid');
      }
      const description = composeDescription(input.title, input.notes ?? '');
      const amount = (input.type === 'expense' ? -input.amount : input.amount) / 100;
      const grossAmount = gross === null ? null : gross / 100;
      const once = input.frequency === 'once';
      statement = neonSql`WITH allowed AS (
        SELECT s.owner_id,a.id AS account_id,a.name AS account_name,
          CASE WHEN ${input.type}='expense' THEN c.name ELSE ${input.categoryId} END AS category
        FROM public.pebble_partner_scope s JOIN public.account a ON a.id=${input.accountId} AND a.user_id=s.owner_id
          AND a.status='active' AND NOT a.is_ghost AND a.kind IN ('bank','cash')
        LEFT JOIN public.category c ON c.id=${input.categoryId} AND c.user_id=s.owner_id AND c.id=ANY(s.shared_categories)
        WHERE s.viewer_id=${userId}::uuid AND s.pair_id=${pairId}::uuid
          AND s.permissions @> '{"addScheduled":true,"accounts":true}'::jsonb
          AND ${input.date}::date > current_date
          AND ((${input.type}='expense' AND c.id IS NOT NULL)
            OR (${input.type}='income' AND ${'income:' + input.categoryId}=ANY(s.shared_categories)))
      ), inserted AS (
        INSERT INTO public.recurring_rule(id,user_id,account_id,payment_method,kind,description,category,amount,gross_amount,
          frequency,start_date,end_mode,end_count,status)
        SELECT ${input.id},owner_id,account_id,account_name,${input.type},${description},category,${amount},${grossAmount},
          ${input.frequency},${input.date}::date,${once ? 'after' : 'never'},${once ? 1 : null},'paused'
          FROM allowed ON CONFLICT(id) DO NOTHING RETURNING id
      )
      SELECT id FROM inserted UNION ALL SELECT r.id FROM public.recurring_rule r JOIN allowed a ON a.owner_id=r.user_id
        WHERE r.id=${input.id} AND r.account_id=a.account_id AND r.category=a.category AND r.kind=${input.type}
          AND r.description=${description} AND r.amount=${amount} AND r.gross_amount IS NOT DISTINCT FROM ${grossAmount}::numeric
          AND r.frequency=${input.frequency} AND r.start_date=${input.date}::date`;
    } else if (input.kind === 'scheduleEdit') {
      if (!validTextId(input.id) || !validName(input.title, 300)) return failure('invalid');
      statement = neonSql`UPDATE public.recurring_rule r SET description=${input.title.trim()}::text || CASE
        WHEN strpos(r.description,chr(10))>0 THEN substr(r.description,strpos(r.description,chr(10))) ELSE '' END,updated_at=now()
        FROM public.pebble_partner_scope s,public.account a
        WHERE s.viewer_id=${userId}::uuid AND s.pair_id=${pairId}::uuid AND r.user_id=s.owner_id AND r.id=${input.id}
          AND r.status <> 'deleted' AND a.id=r.account_id AND a.user_id=r.user_id AND NOT a.is_ghost
          AND s.permissions @> '{"scheduled":true,"editScheduled":true}'::jsonb
          AND ((r.kind='expense' AND EXISTS (SELECT 1 FROM public.category c WHERE c.user_id=s.owner_id AND c.name=r.category
            AND c.id=ANY(s.shared_categories))) OR (r.kind='income' AND ('income:' || r.category)=ANY(s.shared_categories)))
        RETURNING r.id`;
    } else {
      return failure('invalid');
    }
    const [, , , rows] = await neonSql.transaction([
      lifecycleLock(),
      neonSql`SELECT pg_advisory_xact_lock(hashtext('pebble.user-write'), hashtext(owner_id::text))
        FROM public.pebble_partner_scope WHERE viewer_id=${userId}::uuid AND pair_id=${pairId}::uuid`,
      neonSql`SELECT set_config('pebble.guest_actor', ${userId}, true),
        (SELECT count(*) FROM public.pebble_partner_inbox WHERE false)`,
      statement,
    ]);
    if (!rows.length || (input.kind === 'budget' && rows[0].updated !== true)) {
      return failure(input.kind === 'budget' ? 'budgetUnavailable' : 'denied');
    }
    revalidatePath('/', 'layout');
    return success;
  });
}

function validCents(value: number) {
  return Number.isSafeInteger(value) && value > 0 && value <= 99_999_999_999;
}
function validId(id: string) {
  return typeof id === 'string' && UUID.test(id);
}

async function readPartnerInbox(userId: string) {
  if (await partnerViewPair(userId)) return failure('settingsOwnOnly');
  return run(async () => {
    const [, rows] = await neonSql.transaction([
      neonSql`DELETE FROM public.pebble_partner_inbox WHERE owner_id=${userId}::uuid AND expires_at<=now()`,
      neonSql`SELECT item.id,item.operation,item.resource,item.label,item.created_at::text AS "createdAt",
      item.expires_at::text AS "expiresAt",
      CASE WHEN scope.owner_id IS NOT NULL THEN profile.name END AS "guestName"
      FROM public.pebble_partner_inbox item
      LEFT JOIN public.pebble_partner_scope scope ON scope.viewer_id=item.owner_id AND scope.owner_id=item.guest_id AND scope.pair_id=item.pair_id
      LEFT JOIN neon_auth."user" profile ON profile.id=scope.owner_id
      WHERE item.owner_id=${userId}::uuid AND item.expires_at>now() ORDER BY item.created_at DESC,item.id DESC`,
    ]);
    const items = (rows as PartnerInboxItem[]).map(item => ({
      ...item,
      createdAt: new Date(item.createdAt).toISOString(),
      expiresAt: new Date(item.expiresAt).toISOString(),
    }));
    return { ...success, items };
  });
}

async function readInboxItem(userId: string, id: string) {
  if (await partnerViewPair(userId)) return failure('settingsOwnOnly');
  if (!validId(id)) return failure('invalid');
  return run(async () => {
    await neonSql`DELETE FROM public.pebble_partner_inbox WHERE owner_id=${userId}::uuid AND id=${id}::uuid`;
    return success;
  });
}

export const readPartnerInboxAction = withSessionUser(readPartnerInbox);
export const readPartnerInboxItemAction = withSessionUser(readInboxItem);
export const readPartnerSettingsAction = withSessionUser(userId => run(() => readSettings(userId)));
export const createPartnerInviteAction = withSessionUser(createInvite);
export const revokePartnerInviteAction = withSessionUser(revokeInvite);
export const acceptPartnerInviteAction = withSessionUser(acceptInvite);
export const savePartnerPermissionsAction = withSessionUser(savePermissions);
export const unpairPartnerAction = withSessionUser(unpair);
export const enterPartnerViewAction = withSessionUser(enterPartner);
export const leavePartnerViewAction = withSessionUser(leavePartner, { partnerView: true });
export const readPartnerWorkspaceAction = withSessionUser(userId => run(() => readWorkspace(userId)), { partnerView: true });
export const createSharedRecordAction = withSessionUser(createSharedRecord, { partnerView: true });
export const changeSharedTransactionAction = withSessionUser(changeSharedTransaction, { partnerView: true });
