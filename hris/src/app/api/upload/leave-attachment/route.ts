import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { requireAuth } from '@/lib/api';

// Runs in Node so fs is available (same pattern as /api/upload/avatar).
export const runtime = 'nodejs';

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB — covers a scanned medical certificate
const ALLOWED = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

/**
 * POST /api/upload/leave-attachment — saves a supporting document to
 * /public/attachments/ and returns its public URL. The URL is then persisted
 * on the LeaveRequest as attachmentUrl.
 */
export async function POST(req: Request) {
  try {
    const [, authError] = await requireAuth(req);
    if (authError) return authError;

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ message: 'Expected multipart/form-data.' }, { status: 400 });
    }

    const entry = formData.get('file');
    if (!entry || typeof entry === 'string') {
      return NextResponse.json({ message: 'No file provided.' }, { status: 400 });
    }

    const file = entry as File;

    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        { message: 'Only PDF, DOC, DOCX, JPEG, PNG, and WebP files are allowed.' },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ message: 'File must be under 5 MB.' }, { status: 400 });
    }

    const rawExt = (file.name ?? 'upload').split('.').pop() ?? 'bin';
    const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const slug = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const originalName = (file.name ?? 'attachment').replace(/[\r\n\t"]/g, '').slice(0, 120);

    const dir = path.join(process.cwd(), 'public', 'attachments');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, slug), Buffer.from(await file.arrayBuffer()));

    return NextResponse.json(
      {
        url: `/attachments/${slug}`,
        name: originalName,
        size: file.size,
      },
      { status: 201 },
    );
  } catch (e) {
    console.error('[POST /api/upload/leave-attachment]', e);
    return NextResponse.json({ message: 'Upload failed. Please try again.' }, { status: 500 });
  }
}
