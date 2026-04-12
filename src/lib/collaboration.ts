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

import { getSupabaseClient } from '@/lib/supabase';
import { randomBytes, createHash } from 'crypto';

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

const PROJECTS_TABLE = 'collaboration_projects';
const MEMBERS_TABLE = 'project_members';
const SHARE_LINKS_TABLE = 'project_share_links';
const APPROVALS_TABLE = 'project_approvals';

/**
 * Create a new project.
 */
export async function createProject(name: string, ownerId: string, description?: string): Promise<Project> {
  const client = getSupabaseClient();
  const now = new Date().toISOString();

  const projectData = {
    name,
    description: description ?? null,
    owner_id: ownerId,
    calculations: [],
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
  const client = getSupabaseClient();

  const { data: projectRow, error } = await client
    .from(PROJECTS_TABLE)
    .select('*')
    .eq('id', projectId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`[ESVA Collab] Failed to get project: ${error.message}`);
  }

  const members = await getProjectMembers(projectId);
  return { ...mapProjectRow(projectRow), members };
}

/**
 * List projects for a user (owned + shared).
 */
export async function listUserProjects(
  userId: string,
  filter: 'all' | 'owned' | 'shared' = 'all',
): Promise<Project[]> {
  const client = getSupabaseClient();

  if (filter === 'owned') {
    const { data, error } = await client
      .from(PROJECTS_TABLE)
      .select('*')
      .eq('owner_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throw new Error(`[ESVA Collab] Failed to list projects: ${error.message}`);
    return (data ?? []).map(mapProjectRow);
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
    return (data ?? []).map(mapProjectRow);
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

  const client = getSupabaseClient();

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

  const client = getSupabaseClient();

  // Clean up related data
  await client.from(MEMBERS_TABLE).delete().eq('project_id', projectId);
  await client.from(SHARE_LINKS_TABLE).delete().eq('project_id', projectId);
  await client.from(APPROVALS_TABLE).delete().eq('project_id', projectId);

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

  const now = new Date().toISOString();
  const member = await addMemberRow(projectId, /* userId placeholder */ '', role, email, now);
  await touchProject(projectId);
  return member;
}

/**
 * Remove a member from a project.
 */
export async function removeMember(
  projectId: string,
  removerUserId: string,
  targetUserId: string,
): Promise<void> {
  await assertRole(projectId, removerUserId, ['owner']);

  if (removerUserId === targetUserId) {
    throw new Error('[ESVA Collab] Owner cannot remove themselves');
  }

  const client = getSupabaseClient();
  const { error } = await client
    .from(MEMBERS_TABLE)
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', targetUserId);

  if (error) throw new Error(`[ESVA Collab] Failed to remove member: ${error.message}`);
  await touchProject(projectId);
}

/**
 * Get all members of a project.
 */
async function getProjectMembers(projectId: string): Promise<ProjectMember[]> {
  const client = getSupabaseClient();

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

  const client = getSupabaseClient();

  // Get current calculations
  const { data: project, error: fetchError } = await client
    .from(PROJECTS_TABLE)
    .select('calculations')
    .eq('id', projectId)
    .single();

  if (fetchError) throw new Error(`[ESVA Collab] Failed to fetch project: ${fetchError.message}`);

  const calculations: string[] = (project?.calculations as string[]) ?? [];
  if (calculations.includes(receiptId)) return; // already linked

  calculations.push(receiptId);

  const { error } = await client
    .from(PROJECTS_TABLE)
    .update({ calculations, updated_at: new Date().toISOString() })
    .eq('id', projectId);

  if (error) throw new Error(`[ESVA Collab] Failed to add calculation: ${error.message}`);
}

/**
 * Get all calculation receipt IDs for a project.
 */
export async function getProjectCalculations(projectId: string): Promise<string[]> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from(PROJECTS_TABLE)
    .select('calculations')
    .eq('id', projectId)
    .single();

  if (error) throw new Error(`[ESVA Collab] Failed to get calculations: ${error.message}`);
  return (data?.calculations as string[]) ?? [];
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

  const client = getSupabaseClient();
  const token = randomBytes(32).toString('hex');
  const now = new Date();

  const expiresAt = expireHours
    ? new Date(now.getTime() + expireHours * 60 * 60 * 1000).toISOString()
    : null;

  const passwordHash = password
    ? createHash('sha256').update(password).digest('hex')
    : null;

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
): Promise<{ valid: boolean; projectId?: string; error?: string }> {
  const client = getSupabaseClient();

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
    const hash = createHash('sha256').update(password).digest('hex');
    if (hash !== data.password_hash) return { valid: false, error: 'Invalid password' };
  }

  return { valid: true, projectId: data.project_id as string };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 6 — Approval Workflow (Stub)
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

  const client = getSupabaseClient();
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
  const client = getSupabaseClient();
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
  const client = getSupabaseClient();
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
  const client = getSupabaseClient();

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
  const client = getSupabaseClient();
  await client
    .from(PROJECTS_TABLE)
    .update({ updated_at: new Date().toISOString() })
    .eq('id', projectId);
}
