import { Component, ElementRef, forwardRef, HostListener, Input, ViewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface MultiSelectOption {
  value: string;
  label: string;
  meta?: string;
}

let sequencia = 0;

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

@Component({
  selector: 'app-multi-select',
  templateUrl: './multi-select.component.html',
  styleUrls: ['./multi-select.component.scss'],
  standalone: false,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MultiSelectComponent), multi: true }],
})
export class MultiSelectComponent implements ControlValueAccessor {
  @Input() options: MultiSelectOption[] = [];
  @Input() placeholder = 'Selecione';
  @Input() selectedText = 'selecionadas';
  @Input() searchPlaceholder = 'Buscar';
  @Input() emptyText = 'Nada encontrado.';
  @Input() ariaLabel = '';
  @Input() inputId = `ms-${++sequencia}`;
  @Input() invalid = false;

  @ViewChild('trigger') private trigger?: ElementRef<HTMLButtonElement>;

  open = false;
  query = '';
  active = -1;
  disabled = false;
  selected = new Set<string>();

  private onChange: (value: string[]) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor(private host: ElementRef<HTMLElement>) {}

  get listId(): string {
    return `${this.inputId}-lista`;
  }

  get filtered(): MultiSelectOption[] {
    const q = normalizar(this.query);
    return q ? this.options.filter((o) => normalizar(o.label).includes(q)) : this.options;
  }

  get chosen(): MultiSelectOption[] {
    return this.options.filter((o) => this.selected.has(o.value));
  }

  get showSearch(): boolean {
    return this.options.length > 6;
  }

  get summary(): string {
    const chosen = this.chosen;
    if (!chosen.length) return this.placeholder;
    if (chosen.length === 1) return chosen[0].label;
    return `${chosen.length} ${this.selectedText}`;
  }

  trackByValue(_: number, option: MultiSelectOption): string {
    return option.value;
  }

  optionId(index: number): string {
    return `${this.inputId}-opcao-${index}`;
  }

  writeValue(value: string[] | null): void {
    this.selected = new Set(value ?? []);
  }

  registerOnChange(fn: (value: string[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled = disabled;
    if (disabled) this.close();
  }

  toggleOpen(): void {
    if (this.open) this.close(true);
    else this.openPanel();
  }

  openPanel(): void {
    if (this.disabled) return;
    this.open = true;
    this.query = '';
    this.active = this.options.length ? 0 : -1;
    setTimeout(() => {
      const alvo = this.host.nativeElement.querySelector<HTMLElement>('.ms-search, .ms-list');
      alvo?.focus();
    }, 0);
  }

  close(returnFocus = false): void {
    if (!this.open) return;
    this.open = false;
    this.onTouched();
    if (returnFocus) this.trigger?.nativeElement.focus();
  }

  onQuery(value: string): void {
    this.query = value;
    this.active = this.filtered.length ? 0 : -1;
  }

  toggle(option: MultiSelectOption): void {
    if (this.selected.has(option.value)) this.selected.delete(option.value);
    else this.selected.add(option.value);
    this.emit();
  }

  remove(option: MultiSelectOption): void {
    this.selected.delete(option.value);
    this.emit();
    this.onTouched();
  }

  selectAll(): void {
    for (const option of this.filtered) this.selected.add(option.value);
    this.emit();
  }

  clear(): void {
    this.selected.clear();
    this.emit();
  }

  onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' && !this.open) {
      event.preventDefault();
      this.openPanel();
    }
  }

  onPanelKeydown(event: KeyboardEvent): void {
    const total = this.filtered.length;
    const naBusca = (event.target as HTMLElement).classList.contains('ms-search');

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (total) this.moveTo((this.active + 1) % total);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (total) this.moveTo((this.active - 1 + total) % total);
        break;
      case 'Enter':
        event.preventDefault();
        if (this.filtered[this.active]) this.toggle(this.filtered[this.active]);
        break;
      case ' ':
        if (naBusca) break;
        event.preventDefault();
        if (this.filtered[this.active]) this.toggle(this.filtered[this.active]);
        break;
      case 'Escape':
        // Sem isto o Esc também fecharia o modal onde o campo está.
        event.preventDefault();
        event.stopPropagation();
        this.close(true);
        break;
      case 'Tab':
        this.close();
        break;
    }
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMousedown(event: MouseEvent): void {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  private moveTo(index: number): void {
    this.active = index;
    setTimeout(() => document.getElementById(this.optionId(index))?.scrollIntoView({ block: 'nearest' }), 0);
  }

  private emit(): void {
    this.onChange([...this.selected]);
  }
}
