import { Component } from '@angular/core';

@Component({
    selector: 'app-empty-state',
    template: '<p class="empty"><ng-content></ng-content></p>',
    styles: [':host{display:block}'],
    standalone: false
})
export class EmptyStateComponent {}
