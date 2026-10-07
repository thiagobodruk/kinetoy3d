// The scene player: play/pause, restart, a timeline to scrub, the time, and close.
// Shown above the HUD while a scene is loaded.
import type { Director } from '../director/director';

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export class SceneBar {
  readonly el: HTMLElement;
  private playBtn: HTMLButtonElement;
  private slider: HTMLInputElement;
  private label: HTMLElement;
  private title: HTMLElement;
  private scrubbing = false;
  private resume = false;

  constructor(private director: Director, onClose: () => void) {
    const button = (label: string, icon: string, onclick: () => void) => {
      const b = document.createElement('button');
      b.setAttribute('aria-label', label);
      b.innerHTML = `<i class="ph ph-${icon}"></i>`;
      b.onclick = onclick;
      return b;
    };
    this.el = document.createElement('div');
    this.el.id = 'scenebar';
    this.el.hidden = true;
    this.playBtn = button('Play (Space)', 'play', () => this.togglePlay());
    const restart = button('Restart', 'skip-back', () => { director.seek(0); director.play(); });
    this.title = document.createElement('span');
    this.title.className = 'title';
    this.slider = Object.assign(document.createElement('input'), { type: 'range', min: '0', step: '0.01', value: '0' });
    this.slider.setAttribute('aria-label', 'Timeline');
    this.label = document.createElement('span');
    this.label.className = 'time';
    // scrubbing pauses the scene and resumes it on release if it was playing
    this.slider.addEventListener('pointerdown', () => { this.scrubbing = true; this.resume = director.playing; director.pause(); });
    this.slider.addEventListener('input', () => director.seek(Number(this.slider.value)));
    const release = () => { if (!this.scrubbing) return; this.scrubbing = false; if (this.resume) director.play(); };
    this.slider.addEventListener('pointerup', release);
    this.slider.addEventListener('change', release);
    const close = button('Close scene', 'x', onClose);
    this.el.append(this.playBtn, restart, this.title, this.slider, this.label, close);
    director.onChange(() => this.sync());
    addEventListener('keydown', (e) => {
      if (e.code === 'Space' && director.scene && !(e.target instanceof HTMLInputElement && e.target.type !== 'range')) {
        e.preventDefault();
        this.togglePlay();
      }
    });
  }

  private togglePlay(): void {
    if (this.director.playing) this.director.pause(); else this.director.play();
  }

  /** Shows/hides the bar and refreshes the button and the scene title. */
  sync(): void {
    const d = this.director;
    this.el.hidden = !d.scene;
    if (!d.scene) return;
    this.title.textContent = d.scene.title;
    this.slider.max = String(d.duration);
    this.playBtn.innerHTML = `<i class="ph ph-${d.playing ? 'pause' : 'play'}"></i>`;
    this.playBtn.setAttribute('aria-label', `${d.playing ? 'Pause' : 'Play'} (Space)`);
    this.update();
  }

  /** Every frame: time and timeline position. */
  update(): void {
    const d = this.director;
    if (!d.scene) return;
    if (!this.scrubbing) this.slider.value = String(Math.min(d.time, d.duration));
    this.label.textContent = `${fmt(Math.min(d.time, d.duration))} / ${fmt(d.duration)}`;
    this.slider.style.setProperty('--progress', `${(100 * Math.min(d.time, d.duration)) / (d.duration || 1)}%`);
  }
}
