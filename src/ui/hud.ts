// Binds the HUD toolbar (markup in index.html) to the app: buttons emit actions through
// the handlers, and the `show*` methods reflect the current state on the buttons.
import type { Expression } from '../animations';
import type { Mode } from '../behaviors/locomotion';
import type { ViewName } from '../core/camera';

export interface HudHandlers {
  mode(mode: Mode): void;
  face(face: Expression): void;
  /** gesture name, or 'neutral' to return to the rest pose */
  arm(name: string): void;
  view(view: ViewName): void;
  zoom(factor: number): void;
  reset(): void;
}

export const ZOOM_STEP = 1.25;
const STORAGE_KEY = 'hudCollapsed';

const byId = <T extends HTMLElement = HTMLElement>(root: ParentNode, id: string) => root.querySelector(`#${id}`) as T;

export class Hud {
  private buttons: Record<'mode' | 'face' | 'arm' | 'view', NodeListOf<HTMLButtonElement>>;
  private toggle: HTMLButtonElement;
  private menu: HTMLElement;
  private menuBtn: HTMLButtonElement;

  constructor(private root: HTMLElement, h: HudHandlers) {
    const all = (attr: string) => root.querySelectorAll<HTMLButtonElement>(`[data-${attr}]`);
    this.buttons = { mode: all('mode'), face: all('face'), arm: all('arm'), view: all('view') };
    this.toggle = byId(root, 'hudToggle');
    this.menu = byId(root, 'viewMenu');
    this.menuBtn = byId(root, 'viewMenuBtn');

    this.buttons.mode.forEach((b) => b.onclick = () => h.mode(b.dataset.mode as Mode));
    this.buttons.face.forEach((b) => b.onclick = () => h.face(b.dataset.face as Expression));
    this.buttons.arm.forEach((b) => b.onclick = () => h.arm(b.dataset.arm!));
    this.buttons.view.forEach((b) => b.onclick = () => { h.view(b.dataset.view as ViewName); this.menu.classList.remove('open'); });
    byId(root, 'zoomIn').onclick = () => h.zoom(1 / ZOOM_STEP);
    byId(root, 'zoomOut').onclick = () => h.zoom(ZOOM_STEP);
    byId(root, 'resetBtn').onclick = () => h.reset();

    this.toggle.onclick = () => this.toggleCollapsed();
    this.menuBtn.onclick = (e) => { e.stopPropagation(); this.menu.classList.toggle('open'); };
    addEventListener('pointerdown', (e) => {
      if (!this.menu.contains(e.target as Node) && e.target !== this.menuBtn) this.menu.classList.remove('open');
    });
    // collapsed state is remembered across reloads when the browser allows it
    try { this.setCollapsed(localStorage.getItem(STORAGE_KEY) === '1'); } catch { /* storage unavailable */ }
  }

  private mark(group: keyof Hud['buttons'], value: string | null): void {
    this.buttons[group].forEach((b) => b.classList.toggle('on', b.dataset[group] === value));
  }
  showMode(mode: Mode): void { this.mark('mode', mode); }
  showFace(face: Expression): void { this.mark('face', face); }
  showArm(name: string): void { this.mark('arm', name); }
  /** null clears the selection (free orbit). */
  showView(view: ViewName | null): void { this.mark('view', view); }

  setCollapsed(collapsed: boolean): void {
    this.root.classList.toggle('collapsed', collapsed);
    this.toggle.innerHTML = `<i class="ph ph-caret-${collapsed ? 'right' : 'left'}"></i>`;
    this.toggle.setAttribute('aria-label', `${collapsed ? 'Show' : 'Hide'} panel (H)`);
    try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); } catch { /* storage unavailable */ }
  }
  toggleCollapsed(): void { this.setCollapsed(!this.root.classList.contains('collapsed')); }
}
