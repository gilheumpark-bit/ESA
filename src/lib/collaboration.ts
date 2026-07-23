/**
 * ESVA Collaboration Module
 *
 * Project-based collaboration with member management, share links,
 * and approval workflows. All persistence via Supabase.
 *
 * PART 1: Types
 * PART 2: Project CRUD
 * PART 3: Member management
 * PART 4: Calculation linking
 * PART 5: Share links
 * PART 6: Approval workflow
 */

import { ensureUserProfile, getSupabaseAdmin } from '@/lib/supabase';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'node:util';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types
// ═══════════════════════════════════════════════════════════════════════════════

export type MemberRole = 'owner' | 'editor' | 'viewer';
export type ProjectStatus = 'draft' | 'active' | 'review' | 'approved' | 'archived';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ProjectMember {
  userId: string;
  email?: string;
  role: MemberRole;
  invitedAt: string;
  joinedAt?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  members: ProjectMember[];
  calculations: string[]; // receipt IDs
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ShareLink {
  token: string;
  url: string;
  projectId: string;
  expiresAt: string | null;
  hasPassword: boolean;
  createdBy: string;
  createdAt: string;
}

export interface ApprovalRequest {
  id: string;
  projectId: string;
  requesterId: string;
  approverId: string;
  status: ApprovalStatus;
  comment?: string;
  requestedAt: string;
  resolvedAt?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Project CRUD
// ═══════════════════════════════════════════════════════════════════════════════

const PROJECTS_TABLE = 'projects';
const MEMBERS_TABLE = 'project_members';
const CALCULATIONS_TABLE = 'project_calculations';
const SHARE_LINKS_TABLE = 'share_links';
const APPROVALS_TABLE = 'project_approvals';

/**
 * Create a new project.
 */
export async function createProject(name: string, ownerId: string, description?: string): Promise<Project> {
  await ensureUserProfile(ownerId);
  const client = getSupabaseAdmin();
  const now = new Date().toISOString();

  const projectData = {
    name,
    description: description ?? null,
    owner_id: ownerId,
    status: 'active' as ProjectStatus,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await client
    .from(PROJECTS_TABLE)
    .insert(projectData)
    .select()
    .single();

  if (error) throw new Error(`[ESVA Collab] Failed to create project: ${error.message}`);

  const project = mapProjectRow(data);

  // Auto-add owner as member
  await addMemberRow(project.id, ownerId, 'owner', undefined, now);

  return project;
}

/**
 * Get a project by ID with its members.
 */
export async function getProject(projectId: string): Promise<Project | null> {
  const client = getSupabaseAdmin();

  const { data: projectRow, error } = await client
    .from(PROJECTS_TABLE)
    .select('*')
    .eq('id', projectId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`[ESVA Collab] Failed to get project: ${error.message}`);
  }

  const [members, calculations] = await Promise.all([
    getProjectMembers(projectId),
    getProjectCalculations(projectId),
  ]);
  return { ...mapProjectRow(projectRow), members, calculations };
}

/**
 * List projects for a user (owned + shared).
 */
export async function listUserProjects(
  userId: string,
  filter: 'all' | 'owned' | 'shared' = 'all',
): Promise<Project[]> {
  const client = getSupabaseAdmin();

  if (filter === 'owned') {
    const { data, error } = await client
      .from(PROJECTS_TABLE)
      .select('*')
      .eq('owner_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throw new Error(`[ESVA Collab] Failed to list projects: ${error.message}`);
    return hydrateProjects(data ?? []);
  }

  if (filter === 'shared') {
    // Get project IDs where user is a member but not owner
    const { data: memberRows, error: memberError } = await client
      .from(MEMBERS_TABLE)
      .select('project_id')
      .eq('user_id', userId)
      .neq('role', 'owner');

    if (memberError) throw new Error(`[ESVA Collab] Failed to list shared projects: ${memberError.message}`);

    const projectIds = (memberRows ?? []).map((r: { project_id: string }) => r.project_id);
    if (projectIds.length === 0) return [];

    const { data, error } = await client
      .from(PROJECTS_TABLE)
      .select('*')
      .in('id', projectIds)
      .order('updated_at', { ascending: false });

    if (error) throw new Error(`[ESVA Collab] Failed to list shared projects: ${error.message}`);
    return hydrateProjects(data ?? []);
  }

  // 'all' — owned + shared
  const owned = await listUserProjects(userId, 'owned');
  const shared = await listUserProjects(userId, 'shared');

  // Deduplicate and sort by updatedAt
  const map = new Map<string, Project>();
  for (const p of [...owned, ...shared]) {
    map.set(p.id, p);
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

/**
 * Update project metadata.
 */
export async function updateProject(
  projectId: string,
  userId: string,
  updates: Partial<Pick<Project, 'name' | 'description' | 'status'>>,
): Promise<Project> {
  // Verify the user is owner or editor
  await assertRole(projectId, userId, ['owner', 'editor']);

  const client = getSupabaseAdmin();

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.status !== undefined) updateData.status = updates.status;

  const { data, error } = await client
    .from(PROJECTS_TABLE)
    .update(updateData)
    .eq('id', projectId)
    .select()
    .single();

  if (error) throw new Error(`[ESVA Collab] Failed to update project: ${error.message}`);
  return mapProjectRow(data);
}

/**
 * Delete a project (owner only).
 */
export async function deleteProject(projectId: string, userId: string): Promise<void> {
  await assertRole(projectId, userId, ['owner']);

  const client = getSupabaseAdmin();

  const { error } = await client.from(PROJECTS_TABLE).delete().eq('id', projectId);
  if (error) throw new Error(`[ESVA Collab] Failed to delete project: ${error.message}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Member Management
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Invite a member to a project by email.
 */
export async function inviteMember(
  projectId: string,
  inviterUserId: string,
  email: string,
  role: MemberRole = 'viewer',
): Promise<ProjectMember> {
  await assertRole(projectId, inviterUserId, ['owner', 'editor']);

  if (role === 'owner') {
    throw new Error('[ESVA Collab] Cannot invite a member as owner');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const now = new Date().toISOString();
  const member = await addMemberRow(projectId, /* pending identity */ '', role, normalizedEmail, now);
  await touchProject(projectId);
  return member;
}

/**
 * Remove a member from a project.
 */
export async function removeMember(
  projectId: string,
  removerUserId: string,
  target: { userId?: string; email?: string },
): Promise<void> {
  await assertRole(projectId, removerUserId, ['owner']);

  if (target.userId && removerUserId === target.userId) {
    throw new Error('[ESVA Collab] Owner cannot remove themselves');
  }

  const client = getSupabaseAdmin();
  let deletion = client
    .from(MEMBERS_TABLE)
    .delete()
    .eq('project_id', projectId);
  if (target.userId) {
    deletion = deletion.eq('user_id', target.userId);
  } else if (target.email) {
    deletion = deletion.eq('email', target.email.trim().toLowerCase()).is('user_id', null);
  } else {
    throw new Error('[ESVA Collab] Member identity is required');
  }

  const { error } = await deletion;

  if (error) throw new Error(`[ESVA Collab] Failed to remove member: ${error.message}`);
  await touchProject(projectId);
}

/**
 * Convert pending email invitations into memberships after Firebase has verified
 * that the signed-in user controls the invited address.
 */
export async function claimProjectInvitations(userId: string, verifiedEmail: string): Promise<number> {
  const email = verifiedEmail.trim().toLowerCase();
  if (!email) return 0;

  const client = getSupabaseAdmin();
  const { data: invitations, error } = await client
    .from(MEMBERS_TABLE)
    .select('id, project_id')
    .is('user_id', null)
    .eq('email', email);
  if (error) throw new Error(`[ESVA Collab] Failed to find invitations: ${error.message}`);

  let claimed = 0;
  for (const invitation of invitations ?? []) {
    const projectId = String(invitation.project_id);
    const { data: existing, error: existingError } = await client
      .from(MEMBERS_TABLE)
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();
    if (existingError) throw new Error(`[ESVA Collab] Failed to check membership: ${existingError.message}`);

    if (existing) {
      const { error: deleteError } = await client
        .from(MEMBERS_TABLE)
        .delete()
        .eq('id', invitation.id)
        .is('user_id', null);
      if (deleteError) throw new Error(`[ESVA Collab] Failed to merge invitation: ${deleteError.message}`);
      continue;
    }

    const { data: updated, error: updateError } = await client
      .from(MEMBERS_TABLE)
      .update({ user_id: userId, email, joined_at: new Date().toISOString() })
      .eq('id', invitation.id)
      .is('user_id', null)
      .select('id')
      .maybeSingle();
    if (updateError) throw new Error(`[ESVA Collab] Failed to claim invitation: ${updateError.message}`);
    if (updated) {
      claimed += 1;
      await touchProject(projectId);
    }
  }
  return claimed;
}

/**
 * Get all members of a project.
 */
async function getProjectMembers(projectId: string): Promise<ProjectMember[]> {
  const client = getSupabaseAdmin();

  const { data, error } = await client
    .from(MEMBERS_TABLE)
    .select('*')
    .eq('project_id', projectId)
    .order('invited_at', { ascending: true });

  if (error) throw new Error(`[ESVA Collab] Failed to get members: ${error.message}`);

  return (data ?? []).map((r: Record<string, unknown>) => ({
    userId: r.user_id as string,
    email: (r.email as string) ?? undefined,
    role: r.role as MemberRole,
    invitedAt: r.invited_at as string,
    joinedAt: (r.joined_at as string) ?? undefined,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Calculation Linking
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Add a calculation receipt to a project.
 */
export async function addCalculationToProject(
  projectId: string,
  userId: string,
  receiptId: string,
): Promise<void> {
  await assertRole(projectId, userId, ['owner', 'editor']);

  const client = getSupabaseAdmin();
  const { data: ownedReceipt, error: receiptError } = await client
    .from('calculation_receipts')
    .select('id')
    .eq('id', receiptId)
    .eq('user_id', userId)
    .maybeSingle();
  if (receiptError || !ownedReceipt) {
    throw new Error('[ESVA Collab] Receipt not found or not owned by this member');
  }

  const { error } = await client
    .from(CALCULATIONS_TABLE)
    .upsert(
      { project_id: projectId, receipt_id: receiptId },
      { onConflict: 'project_id,receipt_id', ignoreDuplicates: true },
    );

  if (error) throw new Error(`[ESVA Collab] Failed to add calculation: ${error.message}`);
  await touchProject(projectId);
}

/**
 * Get all calculation receipt IDs for a project.
 */
export async function getProjectCalculations(projectId: string): Promise<string[]> {
  const client = getSupabaseAdmin();

  const { data, error } = await client
    .from(CALCULATIONS_TABLE)
    .select('receipt_id')
    .eq('project_id', projectId);

  if (error) throw new Error(`[ESVA Collab] Failed to get calculations: ${error.message}`);
  return (data ?? []).map((row: { receipt_id: string }) => row.receipt_id);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5 — Share Links
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a shareable link for a project.
 */
export async function generateShareLink(
  projectId: string,
  userId: string,
  expireHours?: number,
  password?: string,
): Promise<ShareLink> {
  await assertRole(projectId, userId, ['owner', 'editor']);

  const client = getSupabaseAdmin();
  const token = randomBytes(32).toString('hex');
  const now = new Date();

  const expiresAt = expireHours
    ? new Date(now.getTime() + expireHours * 60 * 60 * 1000).toISOString()
    : null;

  const passwordHash = password ? await hashSharePassword(password) : null;

  const linkData = {
    token,
    project_id: projectId,
    expires_at: expiresAt,
    password_hash: passwordHash,
    created_by: userId,
    created_at: now.toISOString(),
  };

  const { error } = await client.from(SHARE_LINKS_TABLE).insert(linkData);
  if (error) throw new Error(`[ESVA Collab] Failed to create share link: ${error.message}`);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://esva.engineer';

  return {
    token,
    url: `${baseUrl}/projects/shared/${token}`,
    projectId,
    expiresAt,
    hasPassword: !!password,
    createdBy: userId,
    createdAt: now.toISOString(),
  };
}

/**
 * Validate a share link token.
 */
export async function validateShareLink(
  token: string,
  password?: string,
): Promise<{ valid: boolean; projectId?: string; error?: string; retryAfter?: number }> {
  const client = getSupabaseAdmin();

  const { data, error } = await client
    .from(SHARE_LINKS_TABLE)
    .select('*')
    .eq('token', token)
    .single();

  if (error || !data) return { valid: false, error: 'Link not found' };

  // Check expiration
  if (data.expires_at && new Date(data.expires_at as string) < new Date()) {
    return { valid: false, error: 'Link expired' };
  }

  // Check password
  if (data.password_hash) {
    if (!password) return { valid: false, error: 'Password required' };
    const linkHash = createHash('sha256').update(token).digest('hex');
    const { data: attemptRows, error: attemptError } = await client.rpc(
      'consume_share_password_attempt',
      { p_link_hash: linkHash },
    );
    const attempt = Array.isArray(attemptRows) ? attemptRows[0] as Record<string, unknown> | undefined : undefined;
    if (attemptError || !attempt || typeof attempt.allowed !== 'boolean') {
      return { valid: false, error: 'Too many password attempts', retryAfter: 900 };
    }
    if (!attempt.allowed) {
      const retryAfter = typeof attempt.retry_after === 'number'
        ? Math.max(1, Math.ceil(attempt.retry_after))
        : 900;
      return { valid: false, error: 'Too many password attempts', retryAfter };
    }
    if (!await verifySharePassword(password, data.password_hash as string)) {
      return { valid: false, error: 'Invalid password' };
    }
  }

  return { valid: true, projectId: data.project_id as string };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 6 — Approval Workflow
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Request approval for a project.
 */
export async function requestApproval(
  projectId: string,
  requesterId: string,
  approverId: string,
): Promise<ApprovalRequest> {
  await assertRole(projectId, requesterId, ['owner', 'editor']);

  const client = getSupabaseAdmin();
  const now = new Date().toISOString();

  const approvalData = {
    project_id: projectId,
    requester_id: requesterId,
    approver_id: approverId,
    status: 'pending' as ApprovalStatus,
    requested_at: now,
  };

  const { data, error } = await client
    .from(APPROVALS_TABLE)
    .insert(approvalData)
    .select()
    .single();

  if (error) throw new Error(`[ESVA Collab] Failed to request approval: ${error.message}`);

  // Update project status
  await client
    .from(PROJECTS_TABLE)
    .update({ status: 'review', updated_at: now })
    .eq('id', projectId);

  return mapApprovalRow(data);
}

/**
 * Approve or reject a project.
 */
export async function approveProject(
  projectId: string,
  approverId: string,
  approved: boolean,
  comment?: string,
): Promise<ApprovalRequest> {
  const client = getSupabaseAdmin();
  const now = new Date().toISOString();

  const status: ApprovalStatus = approved ? 'approved' : 'rejected';

  const { data, error } = await client
    .from(APPROVALS_TABLE)
    .update({
      status,
      comment: comment ?? null,
      resolved_at: now,
    })
    .eq('project_id', projectId)
    .eq('approver_id', approverId)
    .eq('status', 'pending')
    .select()
    .single();

  if (error) throw new Error(`[ESVA Collab] Failed to approve project: ${error.message}`);

  // Update project status
  const newProjectStatus: ProjectStatus = approved ? 'approved' : 'active';
  await client
    .from(PROJECTS_TABLE)
    .update({ status: newProjectStatus, updated_at: now })
    .eq('id', projectId);

  return mapApprovalRow(data);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function mapProjectRow(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? undefined,
    ownerId: row.owner_id as string,
    members: [],
    calculations: (row.calculations as string[]) ?? [],
    status: (row.status as ProjectStatus) ?? 'active',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapApprovalRow(row: Record<string, unknown>): ApprovalRequest {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    requesterId: row.requester_id as string,
    approverId: row.approver_id as string,
    status: row.status as ApprovalStatus,
    comment: (row.comment as string) ?? undefined,
    requestedAt: row.requested_at as string,
    resolvedAt: (row.resolved_at as string) ?? undefined,
  };
}

async function addMemberRow(
  projectId: string,
  userId: string,
  role: MemberRole,
  email?: string,
  invitedAt?: string,
): Promise<ProjectMember> {
  const client = getSupabaseAdmin();
  const now = invitedAt ?? new Date().toISOString();

  const memberData = {
    project_id: projectId,
    user_id: userId || null,
    email: email ?? null,
    role,
    invited_at: now,
    joined_at: userId ? now : null,
  };

  const { error } = await client.from(MEMBERS_TABLE).insert(memberData);
  if (error) throw new Error(`[ESVA Collab] Failed to add member: ${error.message}`);

  return {
    userId,
    email,
    role,
    invitedAt: now,
    joinedAt: userId ? now : undefined,
  };
}

async function assertRole(
  projectId: string,
  userId: string,
  allowedRoles: MemberRole[],
): Promise<void> {
  const client = getSupabaseAdmin();

  const { data, error } = await client
    .from(MEMBERS_TABLE)
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    throw new Error('[ESVA Collab] User is not a member of this project');
  }

  if (!allowedRoles.includes(data.role as MemberRole)) {
    throw new Error(`[ESVA Collab] Insufficient permissions. Required: ${allowedRoles.join('|')}, got: ${data.role}`);
  }
}

async function touchProject(projectId: string): Promise<void> {
  const client = getSupabaseAdmin();
  await client
    .from(PROJECTS_TABLE)
    .update({ updated_at: new Date().toISOString() })
    .eq('id', projectId);
}

async function hydrateProjects(rows: Record<string, unknown>[]): Promise<Project[]> {
  return Promise.all(rows.map(async (row) => {
    const projectId = row.id as string;
    const [members, calculations] = await Promise.all([
      getProjectMembers(projectId),
      getProjectCalculations(projectId),
    ]);
    return { ...mapProjectRow(row), members, calculations };
  }));
}

const scryptAsync = promisify(scrypt);

async function hashSharePassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const digest = await scryptAsync(password, salt, 32) as Buffer;
  return `scrypt$${salt.toString('base64url')}$${digest.toString('base64url')}`;
}

async function verifySharePassword(password: string, encoded: string): Promise<boolean> {
  const [scheme, saltValue, hashValue] = encoded.split('$');
  if (scheme !== 'scrypt' || !saltValue || !hashValue) return false;
  try {
    const expected = Buffer.from(hashValue, 'base64url');
    const actual = await scryptAsync(
      password,
      Buffer.from(saltValue, 'base64url'),
      expected.length,
    ) as Buffer;
    return expected.length > 0 && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
