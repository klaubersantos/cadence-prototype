import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

// Next.js 16 renamed Middleware to Proxy (same runtime, new file/convention
// name) — this is the route-protection layer, guarding /dashboard, /students,
// /unbilled, /invoices for the teacher and /portal for the authenticated student.
export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;
  const isPortal = nextUrl.pathname.startsWith('/portal');
  const isTeacherArea = ['/dashboard', '/students', '/unbilled', '/invoices'].some((p) => nextUrl.pathname.startsWith(p));

  if (!session) {
    return NextResponse.redirect(new URL('/login', nextUrl));
  }
  if (isPortal && session.user.role !== 'STUDENT') {
    return NextResponse.redirect(new URL('/dashboard', nextUrl));
  }
  if (isTeacherArea && session.user.role !== 'TEACHER') {
    return NextResponse.redirect(new URL('/portal/overview', nextUrl));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ['/dashboard/:path*', '/students/:path*', '/unbilled/:path*', '/invoices/:path*', '/portal/:path*'],
};
