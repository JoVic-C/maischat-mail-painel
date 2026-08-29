import { Component, Input } from '@angular/core';
import {
  ACTIVE_LABELS,
  BadgeInfo,
  CAMPAIGN_STATUS_LABELS,
  CONTACT_STATUS_LABELS,
  CSV_ROW_LABELS,
  LIST_TYPE_LABELS,
  MATCH_LABELS,
  SEND_STATUS_LABELS,
  USER_ROLE_LABELS,
} from '../../models';

export type BadgeKind = 'campaign' | 'contact' | 'send' | 'listType' | 'role' | 'active' | 'match' | 'csvRow';

/**
 * Badge de status. Rótulo, cor e tooltip vêm de `models/labels.ts` — nenhuma tela
 * repete mapa de status.
 *
 * `<app-status-badge kind="campaign" [value]="c.status"></app-status-badge>`
 */
@Component({
    selector: 'app-status-badge',
    templateUrl: './status-badge.component.html',
    styles: [':host{display:inline-block}'],
    standalone: false
})
export class StatusBadgeComponent {
  @Input() kind: BadgeKind = 'campaign';
  @Input() value = '';
  /** Sobrescreve o texto do tooltip vindo do mapa. */
  @Input() hint?: string;

  private readonly maps: Record<BadgeKind, Record<string, BadgeInfo>> = {
    campaign: CAMPAIGN_STATUS_LABELS,
    contact: CONTACT_STATUS_LABELS,
    send: SEND_STATUS_LABELS,
    listType: LIST_TYPE_LABELS,
    role: USER_ROLE_LABELS,
    active: ACTIVE_LABELS,
    match: MATCH_LABELS,
    csvRow: CSV_ROW_LABELS,
  };

  get info(): BadgeInfo | null {
    return this.maps[this.kind]?.[this.value] ?? null;
  }

  get tooltip(): string {
    return this.hint ?? this.info?.hint ?? '';
  }
}
