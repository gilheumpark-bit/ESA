/**
 * ESVA Expert Verification — Certification System
 * ─────────────────────────────────────────────────
 * Verify professional certifications for community badge display.
 *
 * PART 1: Types (cert types, verification request, badge)
 * PART 2: Verification request submission
 * PART 3: Badge retrieval
 * PART 4: Admin verification actions
 */

import { getSupabaseClient, getSupabaseAdmin } from '@/lib/supabase';

// ─── PART 1: Types ────────────────────────────────────────────

/** Supported professional certification types */
export type CertType =
  | '기술사'           // Korean Professional Engineer
  | '기사'             // Korean Engineer
  | 'PE'               // US Professional Engineer
  | 'CEng'             // UK Chartered Engineer
  | '電気主任技術者';   // Japan Chief Electrical Engineer

export type VerificationStatus = 'pending' | 'verified' | 'rejected';

export interface VerificationRequest {
  id: string;
  userId: string;
  certType: CertType;
  certNumber: string;
  /** URL to uploaded certification image in storage */
  evidenceUrl: string;
  status: VerificationStatus;
  reviewNote?: string;
  reviewedBy?: string;
  createdAt: string;
  reviewedAt?: string;
}

export interface ExpertBadge {
  userId: string;
  certType: CertType;
  certDisplayName: string;
  verifiedAt: string;
  specialties: string[];
}

// ─── Constants ────────────────────────────────────────────────

const VERIFICATION_TABLE = 'expert_verifications';
const EXPERTS_TABLE = 'expert_profiles';

/** Display names for each cert type */
const CERT_DISPLAY: Record<CertType, string> = {
  '기술사': '기술사 (Professional Engineer, KR)',
  '기사': '기사 (Engineer, KR)',
  'PE': 'PE (Professional Engineer)',
  'CEng': 'CEng (Chartered Engineer)',
  '電気主任技術者': '電気主任技術者 (Chief Electrical Engineer, JP)',
};

// ─── PART 2: Verification Request ─────────────────────────────

/**
 * Submit a verification request for expert certification.
 * User uploads certification image + cert number.
 * Admin reviews and approves/rejects.
 */
export async function requestVerification(
  userId: string,
  certType: CertType,
  evidence: { certNumber: string; imageUrl: string },
): Promise<VerificationRequest> {
  if (!userId) throw new Error('[ESA-7010] userId is required');
  if (!evidence.certNumber) throw new Error('[ESA-7011] Certification number is required');
  if (!evidence.imageUrl) throw new Error('[ESA-7012] Evidence image URL is required');

  const client = getSupabaseClient();

  // Check for existing pending request
  const { data: existing } = await client
    .from(VERIFICATION_TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('cert_type', certType)
    .eq('status', 'pending')
    .maybeSingle();

  if (existing) {
    return rowToRequest(existing);
  }

  const { data, error } = await client
    .from(VERIFICATION_TABLE)
    .insert({
      user_id: userId,
      cert_type: certType,
      cert_number: evidence.certNumber,
      evidence_url: evidence.imageUrl,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`[ESA-7013] Failed to submit verification request: ${error.message}`);
  }

  return rowToRequest(data);
}

/**
 * Get all verification requests for a user.
 */
export async function getUserVerifications(
  userId: string,
): Promise<VerificationRequest[]> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from(VERIFICATION_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`[ESA-7014] Failed to get verifications: ${error.message}`);
  }

  return (data ?? []).map(rowToRequest);
}

// ─── PART 3: Badge Retrieval ──────────────────────────────────

/**
 * Get the expert badge for a user.
 * Returns null if user has no verified certification.
 */
export async function getExpertBadge(userId: string): Promise<ExpertBadge | null> {
  const client = getSupabaseClient();

  // Check for any verified certification
  const { data } = await client
    .from(VERIFICATION_TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'verified')
    .order('reviewed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  // Get specialties from expert profile
  const { data: profile } = await client
    .from(EXPERTS_TABLE)
    .select('specialties')
    .eq('user_id', userId)
    .maybeSingle();

  const certType = data.cert_type as CertType;

  return {
    userId,
    certType,
    certDisplayName: CERT_DISPLAY[certType] ?? certType,
    verifiedAt: data.reviewed_at as string,
    specialties: (profile?.specialties ?? []) as string[],
  };
}

// ─── PART 4: Admin Actions ───────────────────────────────────

/**
 * Approve a verification request (admin only).
 * Creates/updates the expert profile.
 */
export async function approveVerification(
  requestId: string,
  reviewerId: string,
  specialties: string[] = [],
): Promise<void> {
  const admin = getSupabaseAdmin();

  // Update verification status
  const { data: req, error: updateError } = await admin
    .from(VERIFICATION_TABLE)
    .update({
      status: 'verified',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .select('*')
    .single();

  if (updateError || !req) {
    throw new Error(`[ESA-7015] Failed to approve verification: ${updateError?.message}`);
  }

  const userId = req.user_id as string;
  const certType = req.cert_type as string;

  // Upsert expert profile
  const { data: existingProfile } = await admin
    .from(EXPERTS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (existingProfile) {
    const existingCerts = (existingProfile.certifications ?? []) as string[];
    const mergedCerts = [...new Set([...existingCerts, certType])];
    const existingSpecialties = (existingProfile.specialties ?? []) as string[];
    const mergedSpecialties = [...new Set([...existingSpecialties, ...specialties])];

    await admin
      .from(EXPERTS_TABLE)
      .update({
        certifications: mergedCerts,
        specialties: mergedSpecialties,
        verified_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
  } else {
    await admin
      .from(EXPERTS_TABLE)
      .insert({
        user_id: userId,
        certifications: [certType],
        specialties,
        verified_at: new Date().toISOString(),
        reputation: 0,
      });
  }
}

/**
 * Reject a verification request (admin only).
 */
export async function rejectVerification(
  requestId: string,
  reviewerId: string,
  reason: string,
): Promise<void> {
  const admin = getSupabaseAdmin();

  const { error } = await admin
    .from(VERIFICATION_TABLE)
    .update({
      status: 'rejected',
      reviewed_by: reviewerId,
      review_note: reason,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (error) {
    throw new Error(`[ESA-7016] Failed to reject verification: ${error.message}`);
  }
}

// ─── Row Mapper ───────────────────────────────────────────────

interface VerificationRow {
  id: string;
  user_id: string;
  cert_type: string;
  cert_number: string;
  evidence_url: string;
  status: string;
  review_note?: string;
  reviewed_by?: string;
  created_at: string;
  reviewed_at?: string;
}

function rowToRequest(row: VerificationRow): VerificationRequest {
  return {
    id: row.id,
    userId: row.user_id,
    certType: row.cert_type as CertType,
    certNumber: row.cert_number,
    evidenceUrl: row.evidence_url,
    status: row.status as VerificationStatus,
    reviewNote: row.review_note,
    reviewedBy: row.reviewed_by,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  };
}
