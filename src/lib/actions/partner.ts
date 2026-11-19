'use server';

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { neonSql } from '@/db';
import { withSessionUser } from '@/lib/actions/withSessionUser';
import {
  INCOME_SHARING_KEYS, PARTNER_PERMISSIONS, type JointGoalSummary, type PartnerPermissions,
  type PartnerSettingsData, type PartnerWorkspaceData, type SharedTransaction, type SharingCategory,
} from '@/lib/partner';
import { MAX_TAG_NAME_LENGTH } from '@/lib/transactionTags';

const WORKSPACE_COOKIE = 'pebble-partner-view';
const INVITE_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const digest = (code: string) => createHash('sha256').update(code).digest('hex');
const lifecycleLock = () => neonSql`SELECT pg_advisory_xact_lock(hashtext('pebble.partner-mode.v1'))`;

type FailureReason = 'unavailable' | 'databasePermission' | 'unexpected' | 'invalid' | 'invite' | 'paired' | 'noPair' | 'denied' | 'ownOnly' | 'contribution' | 'pendingPermissions';
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

async function partnerViewPair(userId: string) {
  const value = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const prefix = userId + ':';
  const pairId = value?.startsWith(prefix) ? value.slice(prefix.length) : '';
  return validId(pairId) ? pairId : null;
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
  const categories = row.partnerName === null ? [] : await neonSql`
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
    (await cookies()).delete(WORKSPACE_COOKIE);
    return success;
  });
}

async function enterPartner(userId: string, pairId: string) {
  if (!validId(pairId)) return failure('invalid');
  return run(async () => {
    const rows = await neonSql`SELECT 1 FROM public.pebble_partner_scope WHERE viewer_id = ${userId}::uuid AND pair_id = ${pairId}::uuid`;
    if (!rows.length) return failure('pendingPermissions');
    (await cookies()).set(WORKSPACE_COOKIE, userId + ':' + pairId, {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 8 * 60 * 60,
    });
    return success;
  });
}

async function leavePartner() {
  (await cookies()).delete(WORKSPACE_COOKIE);
  return success;
}

async function readWorkspace(userId: string) {
  const pairId = await partnerViewPair(userId);
  if (!pairId) return failure('denied');
  // One permission snapshot per response. Only authorized fields leave the database.
  const [people, transactions, accounts, goals] = await neonSql.transaction([
    neonSql`SELECT profile.name, scope.permissions, scope.pair_id AS "pairId" FROM public.pebble_partner_scope scope
      JOIN neon_auth."user" profile ON profile.id = scope.owner_id WHERE scope.viewer_id = ${userId}::uuid AND scope.pair_id = ${pairId}::uuid`,
    neonSql`SELECT e.id, 'expense'::text AS kind, e.transaction_date::text AS date,
        split_part(e.description, chr(10), 1) AS title, e.category,
        CASE WHEN s.permissions->'amounts' = 'true'::jsonb THEN e.amount::float8 END AS amount,
        CASE WHEN s.permissions->'notes' = 'true'::jsonb AND strpos(e.description, chr(10)) > 0
          THEN substr(e.description, strpos(e.description, chr(10)) + 1) END AS notes,
        e.tag, (s.permissions->'editTags' = 'true'::jsonb) IS TRUE AS "canEditTag",
        (s.permissions->'deleteExpenses' = 'true'::jsonb AND a.status = 'active'
          AND e.recurring_rule_id IS NULL AND e.credit_card_payoff IS NULL) IS TRUE AS "canDelete"
      FROM public.pebble_partner_scope s
      JOIN public.expense e ON e.user_id = s.owner_id
      JOIN public.account a ON a.user_id = e.user_id AND a.id = e.account_id AND NOT a.is_ghost
      WHERE s.viewer_id = ${userId}::uuid AND s.pair_id = ${pairId}::uuid AND s.permissions->'expenses' = 'true'::jsonb
        AND EXISTS (SELECT 1 FROM public.category c WHERE c.user_id = s.owner_id
          AND c.name = e.category AND c.id = ANY(s.shared_categories))
      UNION ALL
      SELECT i.id, 'income'::text, i.transaction_date::text, split_part(i.description, chr(10), 1), i.category,
        CASE WHEN s.permissions->'amounts' = 'true'::jsonb THEN i.net_amount::float8 END,
        CASE WHEN s.permissions->'notes' = 'true'::jsonb AND strpos(i.description, chr(10)) > 0
          THEN substr(i.description, strpos(i.description, chr(10)) + 1) END,
        '', false, false
      FROM public.pebble_partner_scope s
      JOIN public.income i ON i.user_id = s.owner_id
      JOIN public.account a ON a.user_id = i.user_id AND a.id = i.account_id AND NOT a.is_ghost
      WHERE s.viewer_id = ${userId}::uuid AND s.pair_id = ${pairId}::uuid AND s.permissions->'income' = 'true'::jsonb
        AND ('income:' || i.category) = ANY(s.shared_categories)
      ORDER BY date DESC, id DESC`,
    neonSql`SELECT a.name, a.kind FROM public.pebble_partner_scope s
      JOIN public.account a ON a.user_id = s.owner_id AND NOT a.is_ghost
      WHERE s.viewer_id = ${userId}::uuid AND s.pair_id = ${pairId}::uuid AND s.permissions->'accounts' = 'true'::jsonb ORDER BY a.name`,
    neonSql`SELECT g.name,
        CASE WHEN s.permissions->'amounts' = 'true'::jsonb THEN g.target_amount::float8 END AS target,
        CASE WHEN s.permissions->'amounts' = 'true'::jsonb THEN g.current_amount::float8 END AS current
      FROM public.pebble_partner_scope s JOIN public.goal g ON g.user_id = s.owner_id
      WHERE s.viewer_id = ${userId}::uuid AND s.pair_id = ${pairId}::uuid AND s.permissions->'personalGoals' = 'true'::jsonb ORDER BY g.created_at DESC`,
  ], { isolationLevel: 'RepeatableRead', readOnly: true });
  if (!people.length) return failure('noPair');
  const data: PartnerWorkspaceData = { name: people[0].name, pairId: people[0].pairId, permissions: people[0].permissions,
    transactions: transactions as SharedTransaction[], accounts: accounts as PartnerWorkspaceData['accounts'],
    goals: goals as PartnerWorkspaceData['goals'] };
  return { ...success, data };
}

async function changeSharedExpense(userId: string, id: string, change: { kind: 'tag'; tag: string } | { kind: 'delete' }) {
  const pairId = await partnerViewPair(userId);
  if (!pairId) return failure('denied');
  if (typeof id !== 'string' || !id || id.includes('\0') || !change || (change.kind !== 'tag' && change.kind !== 'delete')) return failure('invalid');
  const tag = change.kind === 'tag' && typeof change.tag === 'string' ? change.tag.trim() : '';
  if (change.kind === 'tag' && (typeof change.tag !== 'string' || tag.length > MAX_TAG_NAME_LENGTH || tag.includes('\0'))) return failure('invalid');
  return run(async () => {
    const statement = change.kind === 'tag'
      ? neonSql`UPDATE public.expense e SET tag = ${tag}
        FROM public.pebble_partner_scope s
        WHERE s.viewer_id = ${userId}::uuid AND s.pair_id = ${pairId}::uuid AND e.user_id = s.owner_id AND e.id = ${id}
          AND s.permissions->'expenses' = 'true'::jsonb AND s.permissions->'editTags' = 'true'::jsonb
          AND EXISTS (SELECT 1 FROM public.account a WHERE a.user_id = e.user_id AND a.id = e.account_id AND NOT a.is_ghost)
          AND EXISTS (SELECT 1 FROM public.category c WHERE c.user_id = s.owner_id
            AND c.name = e.category AND c.id = ANY(s.shared_categories)) RETURNING e.id`
      : neonSql`DELETE FROM public.expense e USING public.pebble_partner_scope s
        WHERE s.viewer_id = ${userId}::uuid AND s.pair_id = ${pairId}::uuid AND e.user_id = s.owner_id AND e.id = ${id}
          AND s.permissions->'expenses' = 'true'::jsonb AND s.permissions->'deleteExpenses' = 'true'::jsonb
          AND e.recurring_rule_id IS NULL AND e.credit_card_payoff IS NULL
          AND EXISTS (SELECT 1 FROM public.account a WHERE a.user_id = e.user_id AND a.id = e.account_id AND NOT a.is_ghost AND a.status = 'active')
          AND EXISTS (SELECT 1 FROM public.category c WHERE c.user_id = s.owner_id
            AND c.name = e.category AND c.id = ANY(s.shared_categories)) RETURNING e.id`;
    const [, , rows] = await neonSql.transaction([
      lifecycleLock(),
      neonSql`SELECT pg_advisory_xact_lock(hashtext('pebble.user-write'), hashtext(owner_id::text))
        FROM public.pebble_partner_scope WHERE viewer_id = ${userId}::uuid AND pair_id = ${pairId}::uuid`,
      statement,
    ]);
    if (!rows.length) return failure('denied');
    revalidatePath('/', 'layout');
    return success;
  });
}

async function readJointGoals(userId: string) {
  if (await partnerViewPair(userId)) return failure('ownOnly');
  const [member, goals] = await neonSql.transaction([
    neonSql`SELECT pair_id FROM public.pebble_partner_member WHERE user_id = ${userId}::uuid`,
    neonSql`SELECT g.id, g.name, p.ended_at IS NULL AS active, g.target_cents::float8 AS "targetCents",
        coalesce(sum(c.cents) FILTER (WHERE c.contributor_id = ${userId}::uuid), 0)::float8 AS "myCents",
        coalesce(sum(c.cents) FILTER (WHERE c.contributor_id <> ${userId}::uuid), 0)::float8 AS "partnerCents"
      FROM public.pebble_partner_pair p JOIN public.pebble_joint_goal g ON g.pair_id = p.id
      LEFT JOIN public.pebble_joint_contribution c ON c.goal_id = g.id
      WHERE ${userId}::uuid IN (p.first_user, p.second_user)
      GROUP BY g.id, p.ended_at ORDER BY p.ended_at NULLS FIRST, g.created_at DESC`,
  ], { isolationLevel: 'RepeatableRead', readOnly: true });
  return { ...success, pairId: (member[0]?.pair_id ?? null) as string | null, goals: goals as JointGoalSummary[] };
}

function validCents(value: number) {
  return Number.isSafeInteger(value) && value > 0 && value <= 99_999_999_999;
}
function validId(id: string) {
  return typeof id === 'string' && UUID.test(id);
}

async function createJointGoal(userId: string, pairId: string, id: string, rawName: string, target: number) {
  if (await partnerViewPair(userId)) return failure('ownOnly');
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (!validId(pairId) || !validId(id) || !name || name.length > 80 || name.includes('\0') || !validCents(target)) return failure('invalid');
  return run(async () => {
    const [, rows, retry] = await neonSql.transaction([
      lifecycleLock(),
      neonSql`INSERT INTO public.pebble_joint_goal (id, pair_id, name, target_cents)
        SELECT ${id}::uuid, pair_id, ${name}, ${target}::bigint FROM public.pebble_partner_member
        WHERE user_id = ${userId}::uuid AND pair_id = ${pairId}::uuid
        ON CONFLICT (id) DO NOTHING RETURNING id`,
      neonSql`SELECT g.id FROM public.pebble_joint_goal g JOIN public.pebble_partner_member m ON m.pair_id = g.pair_id
        WHERE m.user_id = ${userId}::uuid AND m.pair_id = ${pairId}::uuid
          AND g.id = ${id}::uuid AND g.name = ${name} AND g.target_cents = ${target}::bigint`,
    ]);
    return rows.length || retry.length ? success : failure('noPair');
  });
}

async function contributeJointGoal(userId: string, id: string, goalId: string, cents: number) {
  if (await partnerViewPair(userId)) return failure('ownOnly');
  if (!validId(id) || !validId(goalId) || !validCents(cents)) return failure('invalid');
  return run(async () => {
    const [, rows, retry] = await neonSql.transaction([
      lifecycleLock(),
      neonSql`INSERT INTO public.pebble_joint_contribution (id, goal_id, contributor_id, cents)
        SELECT ${id}::uuid, g.id, ${userId}::uuid, ${cents}::bigint FROM public.pebble_joint_goal g
        JOIN public.pebble_partner_member m ON m.pair_id = g.pair_id AND m.user_id = ${userId}::uuid
        WHERE g.id = ${goalId}::uuid AND ${cents}::bigint <= g.target_cents - coalesce(
          (SELECT sum(cents) FROM public.pebble_joint_contribution WHERE goal_id = g.id), 0)
        ON CONFLICT (id) DO NOTHING RETURNING id`,
      neonSql`SELECT c.id FROM public.pebble_joint_contribution c
        JOIN public.pebble_joint_goal g ON g.id = c.goal_id JOIN public.pebble_partner_member m ON m.pair_id = g.pair_id
        WHERE m.user_id = ${userId}::uuid AND c.contributor_id = ${userId}::uuid AND c.id = ${id}::uuid
          AND c.goal_id = ${goalId}::uuid AND c.cents = ${cents}::bigint`,
    ]);
    return rows.length || retry.length ? success : failure('contribution');
  });
}

export const readPartnerSettingsAction = withSessionUser(userId => run(() => readSettings(userId)));
export const createPartnerInviteAction = withSessionUser(createInvite);
export const revokePartnerInviteAction = withSessionUser(revokeInvite);
export const acceptPartnerInviteAction = withSessionUser(acceptInvite);
export const savePartnerPermissionsAction = withSessionUser(savePermissions);
export const unpairPartnerAction = withSessionUser(unpair);
export const enterPartnerViewAction = withSessionUser(enterPartner);
export const leavePartnerViewAction = withSessionUser(leavePartner);
export const readPartnerWorkspaceAction = withSessionUser(userId => run(() => readWorkspace(userId)));
export const changeSharedExpenseAction = withSessionUser(changeSharedExpense);
export const readJointGoalsAction = withSessionUser(userId => run(() => readJointGoals(userId)));
export const createJointGoalAction = withSessionUser(createJointGoal);
export const contributeJointGoalAction = withSessionUser(contributeJointGoal);
