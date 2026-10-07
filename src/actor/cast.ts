// The cast: every actor on the stage and which one is active (the one the HUD, the keyboard
// and the camera views act on). A ring on the ground marks the active actor when there's
// more than one.
import * as THREE from 'three';
import { characters } from '../characters/registry';
import { loadCharacter, type CharacterRef } from '../model/loader';
import { Actor } from './actor';

export type CastEvent = 'add' | 'select';

// home positions along X: 0, +1.5, −1.5, +3, −3, …
const SLOT_SPACING = 1.5;
const slotX = (i: number) => Math.ceil(i / 2) * SLOT_SPACING * (i % 2 ? 1 : -1);

export class Cast {
  readonly actors: Actor[] = [];
  active: Actor | null = null;
  private listeners: ((event: CastEvent, actor: Actor) => void)[] = [];
  private ring: THREE.Mesh;
  private slots = 0; // home positions handed out (adds may finish out of order)

  constructor(private scene: THREE.Scene) {
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.47, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x1d2230, transparent: true, opacity: 0.18, depthWrite: false }));
    this.ring.position.y = 0.003;
    this.ring.visible = false;
    scene.add(this.ring);
  }

  onChange(fn: (event: CastEvent, actor: Actor) => void): void { this.listeners.push(fn); }
  private emit(event: CastEvent, actor: Actor): void { this.listeners.forEach((fn) => fn(event, actor)); }

  /**
   * Adds an actor at the next free home position. The model is loaded without blocking the
   * page (baked file or Web Worker); several adds can run at once.
   */
  async add(ref: CharacterRef & { name?: string }): Promise<Actor> {
    const def = characters.get(ref.type);
    const slot = this.slots++;
    const instance = await loadCharacter(ref);
    let name = ref.name ?? def.ui?.label ?? ref.type;
    for (let n = 2; this.actors.some((a) => a.name === name); n++) name = `${ref.name ?? def.ui?.label ?? ref.type} ${n}`;
    const actor = new Actor(name, ref.type, instance, new THREE.Vector3(slotX(slot), 0, 0));
    actor.preset = ref.id;
    this.actors.push(actor);
    this.scene.add(actor.object);
    this.emit('add', actor);
    if (!this.active) this.select(actor);
    return actor;
  }

  get(name: string): Actor {
    const actor = this.actors.find((a) => a.name === name);
    if (!actor) throw new Error(`No actor named "${name}"`);
    return actor;
  }

  select(actor: Actor): void {
    this.active = actor;
    this.emit('select', actor);
  }

  /** The actor that owns a scene object (e.g. a raycast hit), if any. */
  actorOf(object: THREE.Object3D | null): Actor | null {
    for (let o = object; o; o = o.parent) {
      const actor = this.actors.find((a) => a.object === o);
      if (actor) return actor;
    }
    return null;
  }

  /** Center and radius of the circle that holds every actor (ground plane). */
  bounds(center = new THREE.Vector3()): { center: THREE.Vector3; radius: number } {
    if (!this.actors.length) return { center: center.set(0, 0, 0), radius: 0 };
    const box = new THREE.Box2();
    for (const a of this.actors) box.expandByPoint(new THREE.Vector2(a.position.x, a.position.z));
    const c = box.getCenter(new THREE.Vector2());
    center.set(c.x, 0, c.y);
    return { center, radius: box.getSize(new THREE.Vector2()).length() / 2 };
  }

  update(dt: number): void {
    for (const actor of this.actors) actor.update(dt);
    this.ring.visible = this.actors.length > 1 && !!this.active;
    if (this.active) this.ring.position.set(this.active.position.x, this.ring.position.y, this.active.position.z);
  }
}
