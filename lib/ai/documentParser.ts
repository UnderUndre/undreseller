import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getEncoding } from 'js-tiktoken';
import pdfParse from 'pdf-parse';
import { prisma } from '@/lib/db/prisma';
import { shopConfig } from '@/config/shop.config';
import { logger } from '@/lib/telemetry/logger';

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_PDF_PAGES = 50;
export const MAX_CHUNKS_CEILING = 200; // Strict Sprint B ceiling

export interface ParsedChunk {
  source: string;
  position: number;
  content: string;
}

export function splitTextIntoChunks(text: string, source: string, chunkSize = 500, overlap = 50): ParsedChunk[] {
  const enc = getEncoding('cl100k_base');
  const tokens = enc.encode(text);

  const chunks: ParsedChunk[] = [];
  let position = 0;
  let start = 0;

  while (start < tokens.length) {
    const end = Math.min(start + chunkSize, tokens.length);
    const chunkTokens = tokens.slice(start, end);
    const chunkText = enc.decode(chunkTokens);

    chunks.push({
      source,
      position: position++,
      content: chunkText.trim(),
    });

    if (end >= tokens.length) break;
    start += chunkSize - overlap;
  }

  return chunks;
}

export async function parseKnowledgeDocuments(): Promise<ParsedChunk[]> {
  const allChunks: ParsedChunk[] = [];
  const contentDir = path.join(process.cwd(), 'content');

  // 1. Parse knowledge.md (required)
  const mdPath = path.join(contentDir, 'knowledge.md');
  if (fs.existsSync(mdPath)) {
    const mdStats = fs.statSync(mdPath);
    if (mdStats.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(`knowledge.md exceeds size ceiling of 10 MB (${mdStats.size} bytes)`);
    }

    const mdContent = fs.readFileSync(mdPath, 'utf-8');
    const mdChunks = splitTextIntoChunks(mdContent, 'knowledge.md');
    allChunks.push(...mdChunks);
  }

  // 2. Parse knowledge.pdf (optional)
  const pdfPath = path.join(contentDir, 'knowledge.pdf');
  if (fs.existsSync(pdfPath)) {
    const pdfStats = fs.statSync(pdfPath);
    if (pdfStats.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(`knowledge.pdf exceeds size ceiling of 10 MB (${pdfStats.size} bytes)`);
    }

    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfData = await pdfParse(pdfBuffer);

    if (pdfData.numpages > MAX_PDF_PAGES) {
      throw new Error(`knowledge.pdf page count (${pdfData.numpages}) exceeds limit of ${MAX_PDF_PAGES} pages`);
    }

    const pdfChunks = splitTextIntoChunks(pdfData.text, 'knowledge.pdf');
    allChunks.push(...pdfChunks);
  }

  // 3. Strict 200 chunks ceiling check
  if (allChunks.length > MAX_CHUNKS_CEILING) {
    throw new Error(
      `Knowledge chunks count (${allChunks.length}) exceeds the 200 chunks ceiling. Truncate document content to protect PostgreSQL container.`
    );
  }

  return allChunks;
}

export async function executeKnowledgeReindex(): Promise<{ chunksCount: number }> {
  const chunks = await parseKnowledgeDocuments();
  const ftsConfig = shopConfig.ftsConfig || 'simple';

  return await prisma.$transaction(async (tx) => {
    // 1. Acquire advisory transaction lock
    const lockResult = await tx.$queryRaw<{ locked: boolean }[]>`
      SELECT pg_try_advisory_xact_lock(hashtext('knowledge_reindex')) as locked
    `;

    if (!lockResult[0]?.locked) {
      throw new Error('Reindex already in progress (advisory lock busy)');
    }

    // 2. Clear existing chunks
    await tx.knowledgeChunk.deleteMany();

    // 3. Batch insert with to_tsvector(ftsConfig, content)
    for (const chunk of chunks) {
      const chunkId = randomUUID();
      await tx.$executeRaw`
        INSERT INTO "KnowledgeChunk" ("id", "source", "position", "content", "tsv")
        VALUES (
          ${chunkId},
          ${chunk.source},
          ${chunk.position},
          ${chunk.content},
          to_tsvector(${ftsConfig}, ${chunk.content})
        )
      `;
    }

    logger.info(`Knowledge reindex completed: ${chunks.length} chunks indexed with FTS config '${ftsConfig}'`);
    return { chunksCount: chunks.length };
  });
}
