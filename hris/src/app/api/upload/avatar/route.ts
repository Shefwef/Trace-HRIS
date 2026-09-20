import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { requireAuth } from '@/lib/api';

// Explicitly opt into the Node.js runtime so fs is available
export const runtime = 'nodejs';

const MAX_SIZE = 3 * 1024 * 1024; // 3 MB
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/** POST /api/upload/avatar — saves an image to /public/avatars/ and returns its URL. */
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
        { message: 'Only JPEG, PNG, WebP and GIF images are allowed.' },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ message: 'File must be under 3 MB.' }, { status: 400 });
    }

    const rawExt = (file.name ?? 'upload').split('.').pop() ?? 'jpg';
    const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const slug = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const avatarsDir = path.join(process.cwd(), 'public', 'avatars');
    await mkdir(avatarsDir, { recursive: true });
    await writeFile(path.join(avatarsDir, slug), Buffer.from(await file.arrayBuffer()));

    return NextResponse.json({ url: `/avatars/${slug}` }, { status: 201 });
  } catch (e) {
    console.error('[POST /api/upload/avatar]', e);
    return NextResponse.json({ message: 'Upload failed. Please try again.' }, { status: 500 });
  }
}
