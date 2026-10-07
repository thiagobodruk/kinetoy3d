// Drives the active actor with WASD / arrow keys, relative to the camera, and makes the
// camera travel along with it.
import * as THREE from 'three';
import type { Actor } from '../actor/actor';
import type { CameraRig } from '../core/camera';
import type { Keyboard } from '../core/keyboard';

const UP = new THREE.Vector3(0, 1, 0);

export class KeyboardControl {
  private move = new THREE.Vector3();
  private fwd = new THREE.Vector3();
  private right = new THREE.Vector3();
  private dir = new THREE.Vector3();

  constructor(private keys: Keyboard, private camera: CameraRig) {}

  /** Before the actors update: steer the actor from the held keys. */
  steer(actor: Actor | null): void {
    if (!actor) return;
    const { move, fwd, right, dir } = this;
    move.set(
      this.keys.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']), 0,
      this.keys.axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']));
    if (move.lengthSq() === 0) { actor.motion.steer(null); return; }
    this.camera.forward(fwd);
    right.crossVectors(fwd, UP);
    dir.set(0, 0, 0).addScaledVector(right, move.x).addScaledVector(fwd, -move.z).normalize();
    actor.motion.steer(dir);
  }

  /** After the actors update: the camera follows the steered actor. */
  follow(actor: Actor | null): void {
    if (actor?.mode === 'free') this.camera.translate(actor.motion.step);
  }
}
