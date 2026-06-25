import { Injectable, BadRequestException } from "@nestjs/common";
import { createRequire } from "node:module";
import path from "node:path";

import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

// Resolve CMap and standard-font paths from the installed pdfjs-dist package.
// These are required for correct CJK (Chinese, Japanese, Korean) text extraction.
const moduleRequire = createRequire(import.meta.url);
const pdfjsDistDir = path.dirname(
  moduleRequire.resolve("pdfjs-dist/package.json"),
);
const cMapsUrl = `${pdfjsDistDir}/cmaps/`;
const standardFontsUrl = `${pdfjsDistDir}/standard_fonts/`;

export type ExtractedDocument = {
  text: string;
  title: string;
  sourceType: string;
};

const MAX_FILE_SIZE = 20 * 1024 * 1024;

const SUPPORTED_MIME_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "text",
  "text/markdown": "text",
  "text/csv": "text",
  "application/json": "text",
};

const SUPPORTED_EXTENSIONS: Record<string, string> = {
  pdf: "pdf",
  docx: "docx",
  txt: "text",
  md: "text",
  markdown: "text",
  csv: "text",
  json: "text",
  log: "text",
};

@Injectable()
export class DocumentExtractorService {
  async extract(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<ExtractedDocument> {
    if (buffer.length > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit.`,
      );
    }

    const fileType = this.detectFileType(originalName, mimeType);
    const title = originalName.replace(/\.[^/.]+$/, "") || originalName;

    switch (fileType) {
      case "pdf":
        return {
          text: await this.extractPdf(buffer),
          title,
          sourceType: "pdf",
        };
      case "docx":
        return {
          text: await this.extractDocx(buffer),
          title,
          sourceType: "docx",
        };
      case "text":
        return {
          text: this.extractText(buffer),
          title,
          sourceType: "text",
        };
      default:
        throw new BadRequestException(
          `Unsupported file type: ${originalName} (${mimeType})`,
        );
    }
  }

  detectFileType(
    originalName: string,
    mimeType: string,
  ): string | undefined {
    if (SUPPORTED_MIME_TYPES[mimeType]) {
      return SUPPORTED_MIME_TYPES[mimeType];
    }
    const ext = originalName.split(".").pop()?.toLowerCase();
    if (ext && SUPPORTED_EXTENSIONS[ext]) {
      return SUPPORTED_EXTENSIONS[ext];
    }
    return undefined;
  }

  isSupported(originalName: string, mimeType: string): boolean {
    return this.detectFileType(originalName, mimeType) !== undefined;
  }

  private async extractPdf(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({
      data: new Uint8Array(buffer),
      // CMap files map CID (Character ID) fonts to Unicode — without them,
      // CJK characters are replaced with placeholder symbols (◆?).
      cMapUrl: cMapsUrl,
      cMapPacked: true,
      standardFontDataUrl: standardFontsUrl,
      useSystemFonts: false,
      disableFontFace: true,
    });
    try {
      const result = await parser.getText();
      return this.cleanPdfText(result.text);
    } catch (error: unknown) {
      throw new BadRequestException(
        `Failed to extract text from PDF: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      await parser.destroy();
    }
  }

  private async extractDocx(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error: unknown) {
      throw new BadRequestException(
        `Failed to extract text from DOCX: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Clean up text extracted from PDF.
   *
   * Some PDF generators (e.g. iTextSharp) use custom font subsets without
   * ToUnicode mappings for decorative characters like dot leaders in table
   * of contents.  pdfjs-dist replaces these with U+FFFD (REPLACEMENT
   * CHARACTER), which shows up as ◆? in the UI.  We replace them with
   * spaces and collapse redundant whitespace.
   */
  private cleanPdfText(text: string): string {
    return text
      // Replace U+FFFD (replacement character) with space
      .replace(/\uFFFD/g, " ")
      // Remove other non-printable control characters (except \t \n \r)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      // Collapse runs of spaces/tabs into a single space
      .replace(/[ \t]{2,}/g, " ")
      // Collapse 3+ newlines into 2
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  private extractText(buffer: Buffer): string {
    const text = buffer.toString("utf-8");
    if (!text.trim()) {
      throw new BadRequestException("File content is empty.");
    }
    return text;
  }
}
