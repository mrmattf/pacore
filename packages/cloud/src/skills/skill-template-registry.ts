import type { SkillType, SkillTemplate } from '@pacore/core';
import {
  BackorderNotificationSkillType,
  BackorderNotificationTemplates,
} from './templates/backorder-notification';
import {
  LowStockImpactSkillType,
  LowStockImpactTemplates,
} from './templates/low-stock-impact';
import {
  HighRiskOrderSkillType,
  HighRiskOrderTemplates,
} from './templates/high-risk-order';
import {
  DeliveryExceptionSkillType,
  DeliveryExceptionTemplates,
} from './templates/delivery-exception';

/**
 * Registry of all code-defined SkillTypes and SkillTemplates.
 * For MVP, templates are TypeScript objects (no DB). Future marketplace
 * integration will add DB-backed templates on top of this registry.
 */
export class SkillTemplateRegistry {
  private skillTypes = new Map<string, SkillType>();
  private templates  = new Map<string, SkillTemplate>();
  // typeId → template ids
  private byType     = new Map<string, string[]>();

  constructor() {
    this.registerSkillType(BackorderNotificationSkillType, BackorderNotificationTemplates);
    this.registerSkillType(LowStockImpactSkillType, LowStockImpactTemplates);
    this.registerSkillType(HighRiskOrderSkillType, HighRiskOrderTemplates);
    this.registerSkillType(DeliveryExceptionSkillType, DeliveryExceptionTemplates);
  }

  registerSkillType(type: SkillType, templates: SkillTemplate[]): void {
    this.skillTypes.set(type.id, type);
    const ids: string[] = [];
    for (const tmpl of templates) {
      this.templates.set(tmpl.id, tmpl);
      ids.push(tmpl.id);
    }
    this.byType.set(type.id, ids);
  }

  getSkillTypes(): SkillType[] {
    return Array.from(this.skillTypes.values());
  }

  getSkillType(typeId: string): SkillType | null {
    return this.skillTypes.get(typeId) ?? null;
  }

  getTemplatesForType(typeId: string): SkillTemplate[] {
    const ids = this.byType.get(typeId) ?? [];
    return ids.map(id => this.templates.get(id)!).filter(Boolean);
  }

  getTemplate(templateId: string): SkillTemplate | null {
    return this.templates.get(templateId) ?? null;
  }

  getAllTemplates(): SkillTemplate[] {
    return Array.from(this.templates.values());
  }
}
