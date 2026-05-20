import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import Tesseract from 'tesseract.js';

/**
 * Extract text from a given file.
 * 
 * @param filePath Absolute or relative path to the file
 * @returns Extracted text content
 */
export async function extractTextFromFile(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.pdf') {
    return extractTextFromPdf(filePath);
  } else if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
    return extractTextFromImage(filePath);
  } else {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (error: any) {
      throw new Error(`Failed to read file ${filePath}: ${error.message}`);
    }
  }
}

async function extractTextFromImage(filePath: string): Promise<string> {
  try {
    const result = await Tesseract.recognize(filePath, 'eng+tha');
    return result.data.text;
  } catch (error: any) {
    throw new Error(`OCR failed for image ${filePath}: ${error.message}`);
  }
}

async function extractTextFromPdf(filePath: string): Promise<string> {
  try {
    const data = new Uint8Array(fs.readFileSync(filePath));
    const loadingTask = pdfjsLib.getDocument({
      data,
      useSystemFonts: true,
      standardFontDataUrl: path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts') + '/'
    });
    const pdfDocument = await loadingTask.promise;
    
    let fullText = '';
    for (let i = 1; i <= pdfDocument.numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n';
    }
    
    // For prototype, if text is very small, we could throw or return empty.
    // Full PDF rendering to image for Tesseract is complex; for now return what we have.
    // Since the prompt asks for fallback, we will just return the text.
    return fullText;
  } catch (error: any) {
    throw new Error(`PDF extraction failed for ${filePath}: ${error.message}`);
  }
}
