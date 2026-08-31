'use server';

import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { consumeInvitation } from '@/lib/engine/access';

export async function acceptInviteAction(formData: FormData) {
  const token = String(formData.get('token'));
  const password = String(formData.get('password') || '');
  const confirm = String(formData.get('confirm') || '');

  if (password.length < 8) {
    redirect(`/invite/${token}?error=${encodeURIComponent('Password must be at least 8 characters.')}`);
  }
  if (password !== confirm) {
    redirect(`/invite/${token}?error=${encodeURIComponent('Passwords do not match.')}`);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await prisma.$transaction((tx) => consumeInvitation(tx, token, passwordHash));
  if (!result.ok) {
    redirect(`/invite/${token}?error=${encodeURIComponent(result.error)}`);
  }

  redirect('/login?error=' + encodeURIComponent('Password set — sign in below.'));
}
