import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { InvoiceDocument } from '@/lib/pdf/InvoiceDocument';

type SnapshotLine = { lessonPublicId?: string | null; periodLabel?: string | null; date?: string | null; total: number };

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== 'TEACHER') {
    return new NextResponse('Not found', { status: 404 });
  }

  const { id } = await params;
  const seqParam = req.nextUrl.searchParams.get('seq');

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { student: true, snapshots: { orderBy: { seq: 'desc' } } },
  });
  if (!invoice) return new NextResponse('Not found', { status: 404 });

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
