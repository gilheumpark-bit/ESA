import { createHmac } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase';

export interface ContactMessageInput {
  name: string;
  email: string;
  subject: string;
  message: string;
  ip: string;
}

/** Store an anonymous inquiry. A null result means there is no durable receipt. */
export async function saveContactMessage(input: ContactMessageInput): Promise<string | null> {
  try {
    const client = getSupabaseAdmin();
    const { data, error } = await client
      .from('contact_messages')
      .insert({
        name: input.name,
        email: input.email,
        subject: input.subject,
        message: input.message,
        ip_hash: hashIp(input.ip),
      })
      .select('id')
      .single();

    if (error || !data?.id) {
      console.warn('[ESVA contact] Failed to persist inquiry:', error?.message ?? 'missing id');
      return null;
    }
    return String(data.id);
  } catch (error) {
    console.warn('[ESVA contact] Storage unavailable:', error instanceof Error ? error.message : error);
    return null;
  }
}

function hashIp(ip: string): string | null {
  const secret = process.env.CONTACT_IP_HASH_SECRET ?? process.env.INTERNAL_API_SECRET;
  if (!secret) return null;
  return createHmac('sha256', secret).update(ip).digest('hex');
}
