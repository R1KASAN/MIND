import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { buildStepEvidenceDisplay, buildStepEvidenceClickPayload } from './step-evidence-display';
import {
  formatEvidenceChipLabel,
  formatEvidenceSourceLabel,
  getRenderableEvidenceChips,
} from '@/components/ActionScaffold/StepEvidencePanel';
import type { CurrentPlanStep } from '@/lib/store/idb';

describe('step-evidence-display', () => {
  describe('buildStepEvidenceDisplay', () => {
    it('handles empty step without throwing', () => {
      const result = buildStepEvidenceDisplay(undefined);
      assert.deepStrictEqual(result.evidence, []);
      assert.strictEqual(result.selectedEvidence, undefined);
      assert.strictEqual(result.hasRetrievedEvidence, false);
      assert.strictEqual(result.evidenceCount, 0);
      assert.strictEqual(result.confidenceLabel, undefined);
    });

    it('defaults to first chip for retrieved evidence and marks retrieval_enabled true', () => {
      const step: CurrentPlanStep = {
        id: '1',
        text: 'test',
        evidence: [
          { sourceId: 'doc1', label: 'Doc 1', sourceKindLabel: 'retrieved' },
          { sourceId: 'doc2', label: 'Doc 2', sourceKindLabel: 'extracted' },
        ],
      };

      const result = buildStepEvidenceDisplay(step);
      assert.strictEqual(result.selectedEvidence?.sourceId, 'doc1');
      assert.strictEqual(result.hasRetrievedEvidence, true);
      assert.strictEqual(result.evidenceCount, 2);
      assert.strictEqual(result.sourceKindLabel, 'ใช้บริบทในห้องนี้');

      const selectedFileEvidence = buildStepEvidenceDisplay(step, 'doc2');
      assert.strictEqual(selectedFileEvidence.sourceKindLabel, 'ใช้ไฟล์ที่แนบไว้');
    });

    it('returns false for retrieval_enabled on manual evidence', () => {
      const step: CurrentPlanStep = {
        id: '1',
        text: 'test',
        evidence: [
          { sourceId: 'doc1', label: 'Doc 1', sourceKindLabel: 'manual_summary' },
        ],
      };

      const result = buildStepEvidenceDisplay(step);
      assert.strictEqual(result.hasRetrievedEvidence, false);
      assert.strictEqual(result.sourceKindLabel, 'ใช้ข้อความที่คุณวางไว้');
    });

    it('returns empty evidence but keeps confidence metadata', () => {
      const step: CurrentPlanStep = {
        id: '1',
        text: 'test',
        confidence: { level: 'high', score: 95, rationale: 'test', supportingSourceCount: 1 },
      };

      const result = buildStepEvidenceDisplay(step);
      assert.deepStrictEqual(result.evidence, []);
      assert.strictEqual(result.evidenceCount, 0);
      // We expect formatConfidenceLabel to return something, typically the percentage, but let's just assert it's truthy
      assert.ok(result.confidenceLabel);
    });

    it('keeps raw evidence count when all excerpts are empty while render guard hides chips', () => {
      const step: CurrentPlanStep = {
        id: '1',
        text: 'test',
        evidence: [
          { sourceId: 'doc1', label: 'Doc 1', excerpt: '', sourceKindLabel: 'retrieved' },
          { sourceId: 'doc2', label: 'Doc 2', excerpt: '   ', sourceKindLabel: 'retrieved' },
        ],
      };

      const result = buildStepEvidenceDisplay(step);
      assert.strictEqual(result.evidenceCount, 2);
      assert.deepStrictEqual(getRenderableEvidenceChips(result.evidence), []);
    });

    it('renders only the first 3 non-empty evidence chips and truncates long labels', () => {
      const step: CurrentPlanStep = {
        id: '1',
        text: 'test',
        evidence: [
          { sourceId: 'doc1', label: 'First supporting source label that is very long', excerpt: 'one', sourceKindLabel: 'retrieved' },
          { sourceId: 'doc2', label: 'Doc 2', excerpt: 'two', sourceKindLabel: 'retrieved' },
          { sourceId: 'doc3', label: 'Doc 3', excerpt: 'three', sourceKindLabel: 'retrieved' },
          { sourceId: 'doc4', label: 'Doc 4', excerpt: 'four', sourceKindLabel: 'retrieved' },
          { sourceId: 'doc5', label: 'Doc 5', excerpt: 'five', sourceKindLabel: 'retrieved' },
        ],
      };

      const result = buildStepEvidenceDisplay(step);
      const renderable = getRenderableEvidenceChips(result.evidence);

      assert.strictEqual(result.evidenceCount, 5);
      assert.deepStrictEqual(renderable.map((item) => item.sourceId), ['doc1', 'doc2', 'doc3']);
      assert.strictEqual(formatEvidenceChipLabel(renderable[0].label), 'First supporting source label th…');
    });

    it('normalizes old persisted manual summary labels for user-facing evidence copy', () => {
      assert.strictEqual(
        formatEvidenceSourceLabel('Manual summary · 13 พ.ค.'),
        'ใช้ข้อความที่คุณวางไว้ · 13 พ.ค.',
      );
      assert.strictEqual(
        formatEvidenceChipLabel('Manual summary · 13 พ.ค.'),
        'ใช้ข้อความที่คุณวางไว้ · 13 พ.ค.',
      );
    });
  });

  describe('buildStepEvidenceClickPayload', () => {
    it('returns exact analytics payload shape', () => {
      const step: CurrentPlanStep = {
        id: 'step-123',
        text: 'test',
        confidence: { level: 'medium', score: 85, rationale: 'test', supportingSourceCount: 1 },
        safety: { destructive: true, risk: 'high', manualOnly: false },
        evidence: [
          { sourceId: 'doc1', label: 'Doc 1', sourceKindLabel: 'retrieved' },
        ],
      };

      const payload = buildStepEvidenceClickPayload(step, 'doc1');

      assert.deepStrictEqual(payload, {
        step_id: 'step-123',
        source_ids: ['doc1'],
        confidence_level: 'medium',
        confidence_score: 85,
        destructive_risk: 'high',
        retrieval_enabled: true,
      });
    });
  });
});
