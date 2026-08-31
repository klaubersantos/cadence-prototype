'use server';

import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import { signIn } from '@/lib/auth';

export async function loginAction(formData: FormData) {
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: '/',
    });
  } catch (err) {
    if (err instanceof AuthError) {
      redirect(`/login?error=${encodeURIComponent('Invalid email or password.')}`);
    }
    throw err; // rethrow the framework's own redirect control-flow signal
  }
}
