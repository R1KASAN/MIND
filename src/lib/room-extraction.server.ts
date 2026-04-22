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
  type RoomFileFailureStage,
  type RoomFileOcrMetrics,
  type RoomSourceFile,
  type RoomSubmission,
} from '@/lib/room';
import type { PDFDocumentProxy, TextContent } from 'pdfjs-dist/types/src/display/api';

const require = createRequire(import.meta.url);
const nodeModulesRequire = createRequire(path.join(process.cwd(), 'package.json'));
const TESSDATA_CACHE_DIR = path.join(os.tmpdir(), 'mind-tessdata');
const TESSDATA_VERSION = '4.0.0';
const PDF_OCR_MAX_PAGES = 3;
const PDF_OCR_TIMEOUT_MS = 20_000;
const PDF_RENDER_SCALE = 2.25;
const TESSERACT_WORKER_PATH = path.join(
  process.cwd(),
  'node_modules',
  'tesseract.js',
  'src',
  'worker-script',
  'node',
  'index.js',
);

let localTessdataPromise: Promise<string> | null = null;
let localOcrWorkerPromise: Promise<Awaited<ReturnType<typeof createWorker>>> | null = null;
let pdfWorkerSetupPromise: Promise<void> | null = null;

interface PdfOcrOptions {
  maxPages?: number;
  timeoutMs?: number;
  scale?: number;
}

interface ExtractedTextQuality {
  usable: boolean;
  normalizedText: string;
  reason?: 'empty' | 'embedded_nul' | 'fragmented_word_runs' | 'abnormal_spacing' | 'low_word_integrity';
  metrics: RoomFileOcrMetrics;
}

interface RoomExtractionDeps {
  extractPdfTextLayer?: (file: File) => Promise<string>;
  extractPdfTextViaOcr?: (file: File, options: PdfOcrOptions) => Promise<string | PdfOcrEngineResult>;
  ocrEngineAdapter?: OcrEngineAdapter;
  extractImageText?: (file: File) => Promise<string>;
}

export type OcrQualityMetrics = RoomFileOcrMetrics;

export interface PdfOcrEngineResult {
  text: string;
  engine: string;
  metrics: OcrQualityMetrics;
}

export interface OcrEngineAdapter {
  name: string;
  extractPdf(file: File, options: PdfOcrOptions): Promise<PdfOcrEngineResult>;
}

export function normalizeFileText(text: string): string {
  return text
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildTextQualityMetrics(
  text: string,
  normalizedText = normalizeFileText(text),
  overrides: Partial<Pick<RoomFileOcrMetrics, 'pageCountProcessed' | 'durationMs'>> = {},
): RoomFileOcrMetrics {
  const spacedLatinRuns = text.match(/\b(?:[A-Za-z]\s+){4,}[A-Za-z]\b/g) ?? [];
  const fragmentedLatinRuns = text
    .match(/\b(?:[A-Za-z]{1,3}\s+){5,}[A-Za-z]{1,3}\b/g)
    ?.filter((value) => value.replace(/\s+/g, '').length >= 8) ?? [];
  const spacedThaiRuns = text.match(/(?:[\u0E00-\u0E7F]\s+){4,}[\u0E00-\u0E7F]/g) ?? [];
  const compactWordTokens = normalizedText.match(/[A-Za-z\u0E00-\u0E7F]+/g) ?? [];
  const normalWordCount = compactWordTokens.filter((token) => {
    if (/[\u0E00-\u0E7F]/.test(token)) return token.length >= 4;
    return token.length >= 3;
  }).length;
  const significantCharacterCount = normalizedText.replace(/\s/g, '').length;
  const spaceDensity = significantCharacterCount > 0
    ? ((normalizedText.match(/\s/g) ?? []).length / significantCharacterCount)
    : 0;

  return {
    rawTextLength: text.length,
    normalizedTextLength: normalizedText.length,
    fragmentedRunCount: spacedLatinRuns.length + fragmentedLatinRuns.length + spacedThaiRuns.length,
    spaceDensity,
    normalWordRatio: compactWordTokens.length > 0 ? normalWordCount / compactWordTokens.length : 0,
    ...overrides,
  };
}

export function assessExtractedTextQuality(text: string): ExtractedTextQuality {
  const normalizedText = normalizeFileText(text);
  const metrics = buildTextQualityMetrics(text, normalizedText);
  if (!normalizedText) {
    return { usable: false, normalizedText, reason: 'empty', metrics };
  }

  const nulCount = (text.match(/\u0000/g) || []).length;
  if (nulCount > 0) {
    return { usable: false, normalizedText, reason: 'embedded_nul', metrics };
  }

  if (metrics.fragmentedRunCount > 0) {
    return { usable: false, normalizedText, reason: 'fragmented_word_runs', metrics };
  }

  const compactWordTokens = normalizedText.match(/[A-Za-z\u0E00-\u0E7F]+/g) ?? [];
  const normalWordCount = compactWordTokens.filter((token) => {
    if (/[\u0E00-\u0E7F]/.test(token)) return token.length >= 4;
    return token.length >= 3;
  }).length;
  const normalWordRatio = compactWordTokens.length > 0 ? normalWordCount / compactWordTokens.length : 0;

  const significantCharacterCount = normalizedText.replace(/\s/g, '').length;
  const spaceDensity = significantCharacterCount > 0
    ? ((normalizedText.match(/\s/g) ?? []).length / significantCharacterCount)
    : 0;

  if (significantCharacterCount >= 60 && spaceDensity > 0.34) {
    return { usable: false, normalizedText, reason: 'abnormal_spacing', metrics };
  }

  if (compactWordTokens.length >= 12 && normalWordRatio < 0.42) {
    return { usable: false, normalizedText, reason: 'low_word_integrity', metrics };
  }

  return { usable: true, normalizedText, metrics };
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
          workerPath: TESSERACT_WORKER_PATH,
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

async function createIsolatedOcrWorker() {
  const langPath = await ensureTessdataPath();
  return createWorker(['eng', 'tha'], 1, {
    langPath,
    workerPath: TESSERACT_WORKER_PATH,
    cacheMethod: 'none',
  });
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadPdfDocument(file: File): Promise<{ loadingTask: ReturnType<typeof getDocument>; documentProxy: PDFDocumentProxy }> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  await ensurePdfWorkerGlobal();
  const loadingTask = getDocument({
    data: buffer,
    isEvalSupported: false,
    isOffscreenCanvasSupported: false,
    disableFontFace: true,
    useWorkerFetch: false,
  });
  const documentProxy = await loadingTask.promise;
  return { loadingTask, documentProxy };
}

async function extractPdfTextLayer(file: File): Promise<string> {
  const { loadingTask, documentProxy } = await loadPdfDocument(file);
  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
      const page = await documentProxy.getPage(pageNumber);
      const textContent = (await page.getTextContent()) as TextContent;
      const pageText = normalizeFileText(
        textContent.items
          .map((item: TextContent['items'][number]) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
          .join(' '),
      );
      if (pageText) {
        pages.push(pageText);
      }
    }
    return normalizeFileText(pages.join('\n\n'));
  } finally {
    await documentProxy.destroy().catch(() => undefined);
    await loadingTask.destroy().catch(() => undefined);
  }
}

async function extractImageText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const worker = await getOcrWorker();
  const result = await worker.recognize(buffer);
  return normalizeFileText(result.data.text || '');
}

async function renderPdfPageToPng(documentProxy: PDFDocumentProxy, pageNumber: number, scale: number): Promise<Buffer> {
  const { createCanvas } = nodeModulesRequire('@napi-rs/canvas') as typeof import('@napi-rs/canvas');
  const page = await documentProxy.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');
  await page.render({ canvas: canvas as never, canvasContext: context as never, viewport }).promise;
  return Buffer.from(await canvas.encode('png'));
}

async function extractPdfTextWithTesseract(file: File, options: PdfOcrOptions = {}): Promise<PdfOcrEngineResult> {
  const {
    maxPages = PDF_OCR_MAX_PAGES,
    timeoutMs = PDF_OCR_TIMEOUT_MS,
    scale = PDF_RENDER_SCALE,
  } = options;
  const startedAt = Date.now();
  const { loadingTask, documentProxy } = await loadPdfDocument(file);
  const worker = await createIsolatedOcrWorker();

  try {
    const pages: string[] = [];
    const pageLimit = Math.min(documentProxy.numPages, maxPages);
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      const pngBuffer = await renderPdfPageToPng(documentProxy, pageNumber, scale);
      const result = await withTimeout(worker.recognize(pngBuffer), timeoutMs, 'pdf_ocr_timeout');
      const pageText = normalizeFileText(result.data.text || '');
      if (pageText) {
        pages.push(pageText);
      }
    }
    const text = normalizeFileText(pages.join('\n\n'));
    return {
      text,
      engine: 'tesseract',
      metrics: buildTextQualityMetrics(text, text, {
        pageCountProcessed: pageLimit,
        durationMs: Date.now() - startedAt,
      }),
    };
  } finally {
    await worker.terminate().catch(() => undefined);
    await documentProxy.destroy().catch(() => undefined);
    await loadingTask.destroy().catch(() => undefined);
  }
}

async function extractPdfTextViaOcr(file: File, options: PdfOcrOptions = {}): Promise<string> {
  const result = await extractPdfTextWithTesseract(file, options);
  return result.text;
}

export const tesseractOcrEngine: OcrEngineAdapter = {
  name: 'tesseract',
  extractPdf: extractPdfTextWithTesseract,
};

function normalizePdfOcrEngineResult(
  result: string | PdfOcrEngineResult,
  fallbackEngine: string,
  startedAt: number,
): PdfOcrEngineResult {
  if (typeof result !== 'string') {
    return {
      ...result,
      text: normalizeFileText(result.text),
      metrics: {
        ...buildTextQualityMetrics(result.text, normalizeFileText(result.text)),
        ...result.metrics,
      },
    };
  }

  const text = normalizeFileText(result);
  return {
    text,
    engine: fallbackEngine,
    metrics: buildTextQualityMetrics(result, text, {
      durationMs: Date.now() - startedAt,
    }),
  };
}

function errorDetail(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'extract_failed';
}

function buildFailedSourceFile(
  file: File,
  failureReason: string,
  options: {
    failureDetail?: string;
    failureStage?: RoomFileFailureStage;
    createdAt?: number;
    ocrEngine?: string;
    ocrMetrics?: RoomFileOcrMetrics;
  } = {},
): RoomSourceFile {
  const createdAt = options.createdAt ?? Date.now();
  return {
    id: `${createdAt}-${file.name}`,
    name: file.name,
    kind: inferRoomFileKind(file.name, file.type),
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    status: 'failed',
    createdAt,
    failureReason,
    failureDetail: options.failureDetail,
    failureStage: options.failureStage ?? 'unknown',
    lastExtractAttemptAt: createdAt,
    extractAttemptCount: 1,
    ocrEngine: options.ocrEngine,
    ocrMetrics: options.ocrMetrics,
  };
}

function buildReadySourceFile(
  base: RoomSourceFile,
  extractedText: string,
  options: {
    ocrEngine?: string;
    ocrMetrics?: RoomFileOcrMetrics;
  } = {},
): RoomSourceFile {
  return {
    ...base,
    extractedText,
    status: 'ready',
    ocrEngine: options.ocrEngine,
    ocrMetrics: options.ocrMetrics,
  };
}

async function extractSingleFile(file: File, deps: RoomExtractionDeps = {}): Promise<RoomSourceFile> {
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
  const extractPdfTextLayerFn = deps.extractPdfTextLayer ?? extractPdfTextLayer;
  const extractPdfTextViaOcrFn = deps.ocrEngineAdapter
    ? (pdfFile: File, options: PdfOcrOptions) => deps.ocrEngineAdapter?.extractPdf(pdfFile, options) ?? extractPdfTextViaOcr(pdfFile, options)
    : deps.extractPdfTextViaOcr ?? extractPdfTextViaOcr;
  const ocrEngineName = deps.ocrEngineAdapter?.name ?? 'tesseract';
  const extractImageTextFn = deps.extractImageText ?? extractImageText;

  try {
    let extractedText = '';
    if (kind === 'pdf') {
      let textLayerAssessment: ExtractedTextQuality | null = null;
      let textLayerFailureDetail: string | undefined;
      try {
        extractedText = await extractPdfTextLayerFn(file);
        textLayerAssessment = assessExtractedTextQuality(extractedText);
        if (textLayerAssessment.usable) {
          return buildReadySourceFile(base, textLayerAssessment.normalizedText);
        }
        textLayerFailureDetail = textLayerAssessment.reason;
      } catch (error) {
        textLayerFailureDetail = errorDetail(error);
        textLayerAssessment = null;
      }

      try {
        const ocrStartedAt = Date.now();
        const ocrResult = normalizePdfOcrEngineResult(
          await extractPdfTextViaOcrFn(file, { maxPages: PDF_OCR_MAX_PAGES, timeoutMs: PDF_OCR_TIMEOUT_MS }),
          ocrEngineName,
          ocrStartedAt,
        );
        const ocrAssessment = assessExtractedTextQuality(ocrResult.text);
        const ocrMetrics = {
          ...ocrAssessment.metrics,
          ...ocrResult.metrics,
        };
        if (ocrAssessment.usable) {
          return buildReadySourceFile(base, ocrAssessment.normalizedText, {
            ocrEngine: ocrResult.engine,
            ocrMetrics,
          });
        }
        return buildFailedSourceFile(file, 'pdf_text_garbled_after_ocr', {
          failureDetail: ocrAssessment.reason ?? 'ocr_text_quality_failed',
          failureStage: 'pdf_ocr',
          createdAt,
          ocrEngine: ocrResult.engine,
          ocrMetrics,
        });
      } catch (error) {
        return buildFailedSourceFile(
          file,
          textLayerAssessment?.reason ? 'pdf_ocr_failed' : 'pdf_ocr_failed',
          {
            failureDetail: errorDetail(error) || textLayerFailureDetail,
            failureStage: 'pdf_ocr',
            createdAt,
            ocrEngine: ocrEngineName,
          },
        );
      }
    } else if (kind === 'image') {
      try {
        extractedText = await extractImageTextFn(file);
      } catch (error) {
        return buildFailedSourceFile(file, 'image_ocr_failed', {
          failureDetail: errorDetail(error),
          failureStage: 'image_ocr',
          createdAt,
        });
      }
    } else if (kind === 'text' || kind === 'table') {
      try {
        extractedText = normalizeFileText(await file.text());
      } catch (error) {
        return buildFailedSourceFile(file, 'text_read_failed', {
          failureDetail: errorDetail(error),
          failureStage: 'text_read',
          createdAt,
        });
      }
    } else {
      return {
        ...base,
        status: 'unsupported',
        failureReason: 'unsupported_file_type',
        failureStage: 'unknown',
      };
    }

    return buildReadySourceFile(base, extractedText);
  } catch (error) {
    return buildFailedSourceFile(file, 'extract_failed', {
      failureDetail: errorDetail(error),
      failureStage: 'unknown',
      createdAt,
    });
  }
}

export async function extractRoomSubmission(
  text: string,
  files: File[],
  deps: RoomExtractionDeps = {},
): Promise<RoomSubmission> {
  const sourceFiles: RoomSourceFile[] = [];
  for (const file of files) {
    sourceFiles.push(await extractSingleFile(file, deps));
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
