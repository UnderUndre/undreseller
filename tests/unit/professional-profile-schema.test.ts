import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Professional Profile and Portfolio Schema Integrity (T013, FR-336)', () => {
  const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
  const schema = fs.readFileSync(schemaPath, 'utf-8');

  it('declares stable slug unique constraint and lookup index on ProfessionalProfile', () => {
    expect(schema).toContain('model ProfessionalProfile {');
    expect(schema).toContain('slug           String                @unique');
    expect(schema).toContain('@@index([isPublished, slug])');
    expect(schema).toContain('staffMemberId  String                @unique');
  });

  it('declares composite index on PortfolioItem for public gallery ordering', () => {
    expect(schema).toContain('model PortfolioItem {');
    expect(schema).toContain('@@index([professionalProfileId, isPublished, sortOrder])');
  });

  it('defines ProfessionalService join model with composite primary key', () => {
    expect(schema).toContain('model ProfessionalService {');
    expect(schema).toContain('@@id([professionalProfileId, itemId])');
    expect(schema).toContain('@@index([itemId])');
  });

  it('enforces cascade deletes from StaffMember to ProfessionalProfile and PortfolioItem', () => {
    expect(schema).toContain('references: [id], onDelete: Cascade');
  });
});
