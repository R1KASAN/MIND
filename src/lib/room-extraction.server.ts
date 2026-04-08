import { mkdir, copyFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  getDocument,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createWorker } from 'tesseract.js';
import {
  composeRoomSourceText,
  inferRoomFileKind,
  type RoomSourceFile,
  type RoomSubmission,
} from '@/lib/room';
import type { TextContent } from 'pdfjs-dist/types/src/display/api';

const require = createRequire(import.meta.url);
const TESSDATA_CACHE_DIR = path.join(os.tmpdir(), 'mind-tessdata');
const TESSDATA_VERSION = '4.0.0';

let localTessdataPromise: Promise<string> | null = null;
let localOcrWorkerPromise: Promise<Awaited<ReturnType<typeof createWorker>>> | null = null;
let pdfWorkerSetupPromise: Promise<void> | null = null;

function normalizeFileText(text: string): string {
  return text.replace(/\r/g, '').trim();
}

async function ensureTessdataFile(lang: 'eng' | 'tha') {
  const packageDir = path.dirname(require.resolve(`@tesseract.js-data/${lang}/package.json`));
  const sourceFile = path.join(packageDir, TESSDATA_VERSION, `${lang}.traineddata.gz`);
  const targetFile = path.join(TESSDATA_CACHE_DIR, `${lang}.traineddata.gz`);
  try {
    await copyFile(sourceFile, targetFile);
  } catch {
    // If the cache file already exists, copyFile may fail on some platforms. That is fine.
  }
}

async function ensureTessdataPath(): Promise<string> {
  if (!localTessdataPromise) {
    localTessdataPromise = (async () => {
      try {
        await mkdir(TESSDATA_CACHE_DIR, { recursive: true });
        await Promise.all([ensureTessdataFile('eng'), ensureTessdataFile('tha')]);
        return TESSDATA_CACHE_DIR;
      } catch (error) {
        localTessdataPromise = null;
        throw error;
      }
    })();
  }
  return localTessdataPromise;
}

async function getOcrWorker() {
  if (!localOcrWorkerPromise) {
    localOcrWorkerPromise = (async () => {
      try {
        const langPath = await ensureTessdataPath();
        return await createWorker(['eng', 'tha'], 1, {
          langPath,
          cacheMethod: 'none',
        });
      } catch (error) {
        localOcrWorkerPromise = null;
        throw error;
      }
    })();
  }
  return localOcrWorkerPromise;
}

type PdfJsWorkerGlobal = typeof globalThis & {
  pdfjsWorker?: {
    WorkerMessageHandler: unknown;
  };
};

async function ensurePdfWorkerGlobal() {
  const globalScope = globalThis as PdfJsWorkerGlobal;
  if (globalScope.pdfjsWorker?.WorkerMessageHandler) {
    return;
  }

  if (!pdfWorkerSetupPromise) {
    pdfWorkerSetupPromise = import('pdfjs-dist/legacy/build/pdf.worker.mjs')
      .then((workerModule) => {
        globalScope.pdfjsWorker = workerModule as PdfJsWorkerGlobal['pdfjsWorker'];
      })
      .catch((error) => {
        pdfWorkerSetupPromise = null;
        throw error;
      });
  }

  return pdfWorkerSetupPromise;
}

async function extractPdfText(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  await ensurePdfWorkerGlobal();
  const loadingTask = getDocument({
    data: buffer,
    isEvalSupported: false,
    isOffscreenCanvasSupported: false,
    disableFontFace: true,
    useWorkerFetch: false,
  });
  try {
    const documentProxy = await loadingTask.promise;
    try {
      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
        const page = await documentProxy.getPage(pageNumber);
        const textContent = (await page.getTextContent()) as TextContent;
        const pageText = textContent.items
          .map((item: TextContent['items'][number]) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (pageText) {
          pages.push(pageText);
        }
      }
      return normalizeFileText(pages.join('\n\n'));
    } finally {
      await documentProxy.destroy().catch(() => undefined);
    }
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}

async function extractImageText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const worker = await getOcrWorker();
  const result = await worker.recognize(buffer);
  return normalizeFileText(result.data.text || '');
}

function buildFailedSourceFile(file: File, failureReason: string): RoomSourceFile {
  return {
    id: `${Date.now()}-${file.name}`,
    name: file.name,
    kind: inferRoomFileKind(file.name, file.type),
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    status: 'failed',
    createdAt: Date.now(),
    failureReason,
  };
}

async function extractSingleFile(file: File): Promise<RoomSourceFile> {
  const name = file.name || 'untitled';
  const mimeType = file.type || 'application/octet-stream';
  const kind = inferRoomFileKind(name, mimeType);
  const createdAt = Date.now();
  const base: RoomSourceFile = {
    id: `${createdAt}-${name}`,
    name,
    kind,
    mimeType,
    size: file.size,
    status: 'ready',
    createdAt,
  };

  try {
    let extractedText = '';
    if (kind === 'pdf') {
      extractedText = await extractPdfText(file);
    } else if (kind === 'image') {
      extractedText = await extractImageText(file);
    } else if (kind === 'text' || kind === 'table') {
      extractedText = normalizeFileText(await file.text());
    } else {
      return {
        ...base,
        status: 'unsupported',
        failureReason: 'unsupported_file_type',
      };
    }

    return {
      ...base,
      extractedText,
      status: extractedText ? 'ready' : 'ready',
    };
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : 'extract_failed';
    return buildFailedSourceFile(file, failureReason);
  }
}

export async function extractRoomSubmission(text: string, files: File[]): Promise<RoomSubmission> {
  const sourceFiles: RoomSourceFile[] = [];
  for (const file of files) {
    sourceFiles.push(await extractSingleFile(file));
  }
  const extractedParts = sourceFiles
    .map((file) => file.extractedText?.trim())
    .filter((value): value is string => Boolean(value));
  const extractedText = extractedParts.join('\n\n');
  const sourceText = composeRoomSourceText(text, extractedText, sourceFiles);

  return {
    text,
    sourceText,
    extractedText,
    sourceFiles,
  };
}
