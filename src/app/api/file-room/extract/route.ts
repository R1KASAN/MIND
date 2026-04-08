import { extractRoomSubmission } from '@/lib/room-extraction.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return value !== null && typeof value === 'object' && 'arrayBuffer' in value && 'name' in value;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const textValue = formData.get('text');
  const text = typeof textValue === 'string' ? textValue : '';
  const files = formData.getAll('files').filter(isUploadFile);

  const submission = await extractRoomSubmission(text, files);

  return Response.json({
    ok: true,
    ...submission,
  });
}
