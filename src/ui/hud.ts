// The HUD toolbar, built from the registered modes, expressions and gestures: adding a
// definition with `ui` metadata adds its button (and keyboard shortcut label).
// Buttons emit actions through the handlers; the `show*` methods reflect the current state.
//
// Each group is a head button + its items. On wide screens the heads are hidden and every
// item sits in one toolbar; on narrow screens (hud.css) only the heads show, each displaying
// the active option, and tapping one opens its items in a tray above the bar.
import { keyLabel, type UiMeta } from '../animation/registry';
import { VIEWS, type ViewName } from '../core/camera';

export interface HudItem { name: string; ui?: UiMeta }
/** An actor button: its name and a color for its icon. */
export interface HudActor { name: string; color: string }

export interface HudConfig {
  modes: HudItem[];
  faces: HudItem[];
  gestures: HudItem[];
}

export interface HudHandlers {
  selectActor(name: string): void;
  addActor(): void;
  mode(mode: string): void;
  face(face: string): void;
  /** gesture name, or REST_ARMS to return to the rest pose */
  arm(name: string): void;
  view(view: ViewName): void;
  zoom(factor: number): void;
  reset(): void;
}

export const ZOOM_STEP = 1.25;
export const REST_ARMS = 'neutral';
const STORAGE_KEY = 'hudCollapsed';
const VIEW_LABELS: Record<ViewName, string> = { front: 'Front', side: 'Side', back: 'Back', '3q': '3/4' };

type Group = 'actor' | 'mode' | 'face' | 'arm' | 'view';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: Node[]) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
};
const icon = (name: string) => el('i', { className: `ph ph-${name}` });
const iconButton = (ui: UiMeta, onclick: () => void) => {
  const b = el('button', { onclick }, icon(ui.icon));
  b.setAttribute('aria-label', ui.key ? `${ui.label} (${keyLabel(ui.key)})` : ui.label);
  return b;
};

export class Hud {
  private buttons: Record<Group, Map<string, HTMLButtonElement>> = { actor: new Map(), mode: new Map(), face: new Map(), arm: new Map(), view: new Map() };
  private actorItems: HTMLElement;
  private addActorBtn: HTMLButtonElement;
  private handlers: HudHandlers;
  private heads: Partial<Record<Group, HTMLButtonElement>> = {};
  private groups: HTMLElement[] = [];
  private toggle: HTMLButtonElement;
  private menu: HTMLElement;

  constructor(private root: HTMLElement, config: HudConfig, h: HudHandlers) {
    this.handlers = h;
    root.replaceChildren();
    this.toggle = el('button', { id: 'hudToggle', onclick: () => this.toggleCollapsed() });
    const sep = () => el('span', { className: 'sep' });
    // a group: head button (narrow screens) + its items; picking an item closes the tray
    const group = (label: string, headIcon: string, items: Node[], key?: Group) => {
      const head = iconButton({ label, icon: headIcon }, () => this.openGroup(g.classList.contains('open') ? null : g));
      head.classList.add('group-head');
      if (key) this.heads[key] = head;
      const g = el('div', { className: 'group' }, head, el('div', { className: 'items' }, ...items));
      this.groups.push(g);
      return g;
    };
    const options = (name: Group, list: HudItem[], action: (n: string) => void) => list.filter((item) => item.ui).map((item) => {
      const b = iconButton(item.ui!, () => { action(item.name); this.openGroup(null); });
      this.buttons[name].set(item.name, b);
      return b;
    });

    // camera: view menu, zoom and reset
    this.menu = el('div', { className: 'menu' });
    for (const view of Object.keys(VIEWS) as ViewName[]) {
      const b = el('button', { textContent: VIEW_LABELS[view], onclick: () => { h.view(view); this.menu.classList.remove('open'); } });
      this.buttons.view.set(view, b);
      this.menu.append(b);
    }
    const menuBtn = iconButton({ label: 'Camera view', icon: 'video-camera' }, () => this.menu.classList.toggle('open'));
    menuBtn.addEventListener('click', (e) => e.stopPropagation());
    // a tap/click outside closes the view menu and any open tray
    addEventListener('pointerdown', (e) => {
      const target = e.target as Node;
      if (!this.menu.contains(target) && !menuBtn.contains(target)) this.menu.classList.remove('open');
      if (!root.contains(target)) this.openGroup(null);
    });
    // reset: inside the camera group on wide screens, its own bar button on narrow ones
    const resetButton = (className: string) => {
      const b = iconButton({ label: 'Reset scene', icon: 'arrow-counter-clockwise' }, () => { h.reset(); this.openGroup(null); });
      b.classList.add(className);
      return b;
    };
    const camera = group('Camera', 'video-camera', [
      el('div', { className: 'menu-wrap' }, menuBtn, this.menu),
      iconButton({ label: 'Zoom out (−)', icon: 'magnifying-glass-minus' }, () => h.zoom(ZOOM_STEP)),
      iconButton({ label: 'Zoom in (+)', icon: 'magnifying-glass-plus' }, () => h.zoom(1 / ZOOM_STEP)),
      resetButton('reset-wide')]);

    const arms = [{ name: REST_ARMS, ui: { label: 'Arms at rest', icon: 'hand' } }, ...config.gestures];
    // actors: one button per actor (filled by setActors) + add
    this.addActorBtn = iconButton({ label: 'Add actor', icon: 'user-plus' }, () => { this.openGroup(null); h.addActor(); });
    const actors = group('Actors', 'users', [this.addActorBtn]);
    this.actorItems = actors.querySelector('.items')!;
    root.append(
      this.toggle, sep(),
      actors, sep(),
      group('Actions', 'person-simple', options('mode', config.modes, h.mode), 'mode'), sep(),
      group('Face', 'smiley-blank', options('face', config.faces, h.face), 'face'), sep(),
      group('Arms', 'hand', options('arm', arms, h.arm), 'arm'), sep(),
      camera,
      resetButton('reset-narrow'));

    // collapsed state is remembered across reloads when the browser allows it
    let collapsed = false;
    try { collapsed = localStorage.getItem(STORAGE_KEY) === '1'; } catch { /* storage unavailable */ }
    this.setCollapsed(collapsed);
  }

  /** Rebuilds the actor buttons (icons tinted with each actor's color). */
  setActors(actors: HudActor[]): void {
    this.buttons.actor.clear();
    const buttons = actors.map((a) => {
      const b = iconButton({ label: a.name, icon: 'user' }, () => { this.handlers.selectActor(a.name); this.openGroup(null); });
      b.style.color = a.color;
      this.buttons.actor.set(a.name, b);
      return b;
    });
    this.actorItems.replaceChildren(...buttons, this.addActorBtn);
  }
  showActor(name: string): void { this.mark('actor', name); }

  /** Opens one group's tray (narrow screens) and closes the others; null closes all. */
  private openGroup(g: HTMLElement | null): void {
    for (const other of this.groups) other.classList.toggle('open', other === g);
  }

  private mark(group: Group, value: string | null): void {
    for (const [name, b] of this.buttons[group]) b.classList.toggle('on', name === value);
    // the group head shows the active option's icon
    const head = this.heads[group], active = value !== null ? this.buttons[group].get(value) : undefined;
    if (head && active) head.replaceChildren(active.firstElementChild!.cloneNode());
  }
  showMode(mode: string): void { this.mark('mode', mode); }
  showFace(face: string): void { this.mark('face', face); }
  showArm(name: string): void { this.mark('arm', name); }
  /** null clears the selection (free orbit). */
  showView(view: ViewName | null): void { this.mark('view', view); }

  setCollapsed(collapsed: boolean): void {
    this.root.classList.toggle('collapsed', collapsed);
    this.toggle.replaceChildren(icon(`caret-${collapsed ? 'right' : 'left'}`));
    this.toggle.setAttribute('aria-label', `${collapsed ? 'Show' : 'Hide'} panel (H)`);
    try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); } catch { /* storage unavailable */ }
  }
  toggleCollapsed(): void { this.setCollapsed(!this.root.classList.contains('collapsed')); }
}
