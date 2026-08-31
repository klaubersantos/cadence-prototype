import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== 'string' || typeof password !== 'string') return null;

        const teacher = await prisma.teacher.findUnique({ where: { email } });
        if (teacher && (await bcrypt.compare(password, teacher.passwordHash))) {
          return { id: teacher.id, name: teacher.name, email: teacher.email, role: 'TEACHER' as const };
        }

        const student = await prisma.student.findUnique({ where: { email } });
        if (student?.passwordHash && (await bcrypt.compare(password, student.passwordHash))) {
          return { id: student.id, name: student.name, email: student.email, role: 'STUDENT' as const };
        }

        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as 'TEACHER' | 'STUDENT';
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
