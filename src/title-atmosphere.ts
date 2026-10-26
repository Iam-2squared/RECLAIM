import './title-atmosphere.css';
import backgroundArt from './ui-title/tokyo-ai-ruins.webp?inline';
import droneArt from './ui-title/enemy-drone.webp?inline';
import sentinelArt from './ui-title/enemy-sentinel.webp?inline';

/** Decorative 2D layers only: no renderer, animation loop, timers, or game state. */
export class TitleAtmosphere {
  readonly element: HTMLDivElement;
  readonly images: HTMLImageElement[] = [];
  readonly motionMedia = matchMedia('(prefers-reduced-motion: reduce)');
  private active = true;
  private reducedMotion = false;
  private disposed = false;
  private readonly updatePlayback = () => {
    if (this.disposed) return;
    const reduced = this.reducedMotion || this.motionMedia.matches;
    this.element.dataset.active = String(this.active);
    this.element.dataset.reducedMotion = String(reduced);
    this.element.dataset.running = String(this.active && !document.hidden && !reduced);
  };

  constructor(host: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'title-atmosphere';
    this.element.setAttribute('aria-hidden', 'true');

    const layer = (name: string) => {
      const node = document.createElement('div');
      node.className = name.split(' ').map(part => `title-atmosphere__${part}`).join(' ');
      this.element.append(node);
      return node;
    };
    const art = (parent: HTMLElement, source: string, name: string) => {
      const image = new Image();
      image.className = `title-atmosphere__${name}`;
      image.alt = '';
      image.draggable = false;
      image.decoding = 'async';
      image.src = source;
      parent.append(image);
      this.images.push(image);
      return image;
    };

    const background = art(this.element, backgroundArt, 'background');
    background.fetchPriority = 'high';
    background.addEventListener('error', () => { this.element.dataset.artError = 'true'; }, { once: true });
    layer('distance-haze');
    const farDrone = layer('drone drone--far');
    art(farDrone, droneArt, 'enemy-art');
    layer('fog fog--high');
    const sentinel = layer('sentinel');
    art(sentinel, sentinelArt, 'enemy-art');
    const nearDrone = layer('drone drone--near');
    art(nearDrone, droneArt, 'enemy-art');
    layer('fog fog--street');
    layer('fog fog--foreground');
    layer('shade');

    host.prepend(this.element);
    document.addEventListener('visibilitychange', this.updatePlayback);
    this.motionMedia.addEventListener('change', this.updatePlayback);
    this.updatePlayback();
  }

  setActive(active: boolean) {
    this.active = active;
    this.updatePlayback();
  }

  setReducedMotion(reduced: boolean) {
    this.reducedMotion = reduced;
    this.updatePlayback();
  }

  snapshot() {
    return {
      active: this.active,
      running: this.element.dataset.running === 'true',
      reducedMotion: this.element.dataset.reducedMotion === 'true',
      technique: 'layered-css-2d',
      layers: this.element.children.length,
      images: this.images.map(image => ({
        loaded: image.complete && image.naturalWidth > 0,
        width: image.naturalWidth,
        height: image.naturalHeight,
      })),
    };
  }

  dispose() {
    this.disposed = true;
    document.removeEventListener('visibilitychange', this.updatePlayback);
    this.motionMedia.removeEventListener('change', this.updatePlayback);
    this.element.remove();
  }
}
