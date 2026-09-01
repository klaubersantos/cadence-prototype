import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { portalFetch } from '@/lib/engine/access';
import { InvoiceDocument } from '@/lib/pdf/InvoiceDocument';

type SnapshotLine = { lessonPublicId?: string | null; periodLabel?: string | null; date?: string | null; total: number };

export async function GET(req: NextRequest, { params }: { params: Promise<{ publicId: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== 'STUDENT') {
    return new NextResponse('Not found', { status: 404 });
  }

  const { publicId } = await params;
  const result = await prisma.$transaction((tx) => portalFetch(tx, 'invoice', publicId, session.user.id));
  // I10-R04: identical response whether the record doesn't exist or isn't theirs
  if (!result.ok) return new NextResponse('Not found', { status: 404 });

  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: result.value.id },
    include: { student: true, snapshots: { orderBy: { seq: 'desc' } } },
  });

  const seqParam = req.nextUrl.searchParams.get('seq');
  const snapshot = seqParam ? invoice.snapshots.find((s) => s.seq === Number(seqParam)) : invoice.snapshots[0];
  if (!snapshot) return new NextResponse('No snapshot available for this invoice', { status: 404 });

  const studio = await prisma.studio.findFirstOrThrow();
  const lines = snapshot.lines as unknown as SnapshotLine[];

  const buffer = await renderToBuffer(
    InvoiceDocument({
      studioName: studio.name,
      studioLocation: studio.defaultLocation,
      publicId: invoice.publicId,
      isPaid: invoice.status === 'PAID',
      studentName: invoice.student.name,
      studentEmail: invoice.student.email,
      issuedAt: invoice.issuedAt,
      dueAt: invoice.dueAt,
      lines,
      total: snapshot.total,
      policyNote: studio.policyNote,
    }),
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${invoice.publicId}-v${snapshot.seq}.pdf"`,
    },
  });
}
