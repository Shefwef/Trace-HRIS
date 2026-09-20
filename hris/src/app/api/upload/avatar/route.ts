import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { requireAuth, err } from '@/lib/api';

const MAX_SIZE = 3 * 1024 * 1024; // 3 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** POST /api/upload/avatar — saves an image to /public/avatars/ and returns its URL. */
export async function POST(req: Request) {
  const [, authError] = await requireAuth(req);
  if (authError) return authError;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return err(400, 'INVALID_BODY', 'Expected multipart/form-data.');
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string')
    return err(400, 'NO_FILE', 'No file provided.');

  if (!ALLOWED_TYPES.includes(file.type))
    return err(400, 'INVALID_TYPE', 'Only JPEG, PNG, WebP and GIF images are allowed.');

  if (file.size > MAX_SIZE)
    return err(400, 'FILE_TOO_LARGE', 'File must be under 3 MB.');

  const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const slug = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const avatarsDir = path.join(process.cwd(), 'public', 'avatars');
  await mkdir(avatarsDir, { recursive: true });
  await writeFile(path.join(avatarsDir, slug), Buffer.from(await file.arrayBuffer()));

  return NextResponse.json({ url: `/avatars/${slug}` }, { status: 201 });
}
