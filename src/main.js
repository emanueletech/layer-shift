import Phaser from 'phaser';
import { resumeAudio, SFX } from './sfx.js';

export const W = 960;
export const H = 540;

// Placeholder scenes — the real game is designed once the jam theme is announced.
class MenuScene extends Phaser.Scene {
  constructor() { super('menu'); }
  create() {
    this.add.text(W / 2, H / 2 - 40, 'GAME OFF 2026', { fontFamily: 'monospace', fontSize: '48px', color: '#ffffff' }).setOrigin(0.5);
    this.add.text(W / 2, H / 2 + 30, 'click / tap / space to start', { fontFamily: 'monospace', fontSize: '18px', color: '#9aa4b2' }).setOrigin(0.5);
    const go = () => { resumeAudio(); SFX.click(); this.scene.start('game'); };
    this.input.once('pointerdown', go);
    this.input.keyboard.once('keydown-SPACE', go);
  }
}

class GameScene extends Phaser.Scene {
  constructor() { super('game'); }
  create() {
    this.add.text(W / 2, H / 2, 'game goes here', { fontFamily: 'monospace', fontSize: '24px', color: '#ffffff' }).setOrigin(0.5);
    window.__gameState = { scene: 'game' };
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#14161c',
  pixelArt: true,
  physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [MenuScene, GameScene],
});
window.__game = game;
