export const BUTTONS = ['left', 'right', 'up', 'down', 'light', 'heavy', 'block', 'special', 'dash'] as const;
export type Button = (typeof BUTTONS)[number];
export type Buttons = Record<Button, boolean>;

export interface PadInput {
  held: Buttons;
  pressed: Buttons;
}

export const emptyButtons = (): Buttons => ({
  left: false, right: false, up: false, down: false,
  light: false, heavy: false, block: false, special: false, dash: false,
});

export const emptyInput = (): PadInput => ({ held: emptyButtons(), pressed: emptyButtons() });

type Binding = Record<Button, string[]>;

const P1_KEYS: Binding = {
  left: ['KeyA'], right: ['KeyD'], up: ['KeyW', 'Space'], down: ['KeyS'],
  light: ['KeyJ'], heavy: ['KeyK'], block: ['KeyL'], special: ['KeyU'], dash: ['ShiftLeft'],
};

const P2_KEYS: Binding = {
  left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
  light: ['Numpad1', 'Comma'], heavy: ['Numpad2', 'Period'], block: ['Numpad3', 'Slash'],
  special: ['Numpad5', 'Semicolon'], dash: ['Numpad0', 'ShiftRight'],
};

/** Standard-mapping gamepad: X light, Y heavy, B special, A jump, RB block, LB dash. */
const PAD_BUTTONS: Partial<Record<Button, number[]>> = {
  light: [2], heavy: [3], special: [1], up: [0, 12], block: [5, 7], dash: [4, 6],
  down: [13], left: [14], right: [15],
};

export type MenuAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'pause' | 'random';

const MENU_KEYS: Record<MenuAction, string[]> = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  confirm: ['Enter', 'NumpadEnter', 'KeyJ', 'Space', 'Numpad1', 'Comma'],
  back: ['Backspace', 'KeyK', 'Numpad2', 'Period'],
  pause: ['Escape', 'KeyP'],
  random: ['KeyR'],
};

const P2_MENU_KEYS: Partial<Record<MenuAction, string[]>> = {
  up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
  confirm: ['Numpad1', 'Comma', 'NumpadEnter'], back: ['Numpad2', 'Period'],
};

const P1_MENU_KEYS: Partial<Record<MenuAction, string[]>> = {
  up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
  confirm: ['KeyJ', 'Space', 'Enter'], back: ['KeyK', 'Backspace'],
};

class InputManager {
  private down = new Set<string>();
  private tapped = new Set<string>();
  private prevPad: Buttons[] = [emptyButtons(), emptyButtons()];
  private prevPadMenu: Record<string, boolean>[] = [{}, {}];
  private padMenuTapped: Set<MenuAction>[] = [new Set(), new Set()];
  /** When true, player 1 may also use player 2's keys (single-player modes). */
  soloKeyboard = true;
  anyKeyListeners: (() => void)[] = [];
  /** True while an HTML form overlay has focus; the game ignores the keyboard. */
  private suspended = false;

  suspend(on: boolean) {
    this.suspended = on;
    this.down.clear();
    this.tapped.clear();
  }

  attach(target: Window) {
    target.addEventListener('keydown', (e) => {
      if (this.suspended) return;
      if (e.code === 'Tab' || e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'F1' || e.code === 'F2') e.preventDefault();
      if (!e.repeat) this.tapped.add(e.code);
      this.down.add(e.code);
      for (const fn of this.anyKeyListeners) fn();
    });
    target.addEventListener('keyup', (e) => {
      if (!this.suspended) this.down.delete(e.code);
    });
    target.addEventListener('blur', () => this.down.clear());
    target.addEventListener('pointerdown', () => { for (const fn of this.anyKeyListeners) fn(); });
  }

  /** Called once per simulation tick; returns both players' inputs. */
  poll(): [PadInput, PadInput] {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter((p): p is Gamepad => !!p) : [];
    const result: [PadInput, PadInput] = [emptyInput(), emptyInput()];
    for (let p = 0; p < 2; p++) {
      const bindings = p === 0 ? (this.soloKeyboard ? [P1_KEYS, P2_KEYS] : [P1_KEYS]) : (this.soloKeyboard ? [] : [P2_KEYS]);
      const pad = pads[p];
      const prev = this.prevPad[p];
      for (const b of Object.keys(result[p].held) as Button[]) {
        let held = false;
        let tapped = false;
        for (const binding of bindings) {
          for (const code of binding[b]) {
            if (this.down.has(code)) held = true;
            if (this.tapped.has(code)) tapped = true;
          }
        }
        if (pad) {
          const idx = PAD_BUTTONS[b] ?? [];
          let padHeld = idx.some((i) => pad.buttons[i]?.pressed);
          const ax = pad.axes[0] ?? 0;
          const ay = pad.axes[1] ?? 0;
          if (b === 'left' && ax < -0.45) padHeld = true;
          if (b === 'right' && ax > 0.45) padHeld = true;
          if (b === 'up' && ay < -0.6) padHeld = true;
          if (b === 'down' && ay > 0.6) padHeld = true;
          if (padHeld) held = true;
          if (padHeld && !prev[b]) tapped = true;
          prev[b] = padHeld;
        }
        result[p].held[b] = held || tapped;
        result[p].pressed[b] = tapped;
      }
    }
    this.tapped.clear();
    return result;
  }

  /** Menu actions since last call. player = undefined means any device. */
  menu(player?: 0 | 1): Set<MenuAction> {
    const out = new Set<MenuAction>();
    const table = player === undefined ? MENU_KEYS : player === 0 ? P1_MENU_KEYS : P2_MENU_KEYS;
    for (const [action, codes] of Object.entries(table) as [MenuAction, string[]][]) {
      if (codes.some((c) => this.tapped.has(c))) out.add(action);
    }
    if (player === 0 || player === undefined) {
      if (player === 0) for (const c of ['Escape', 'KeyP']) if (this.tapped.has(c)) out.add('pause');
    }
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter((p): p is Gamepad => !!p) : [];
    const padIdx = player === undefined ? [0, 1] : [player];
    for (const i of padIdx) {
      const pad = pads[i];
      if (!pad) continue;
      const now: Record<string, boolean> = {
        up: !!pad.buttons[12]?.pressed || (pad.axes[1] ?? 0) < -0.6,
        down: !!pad.buttons[13]?.pressed || (pad.axes[1] ?? 0) > 0.6,
        left: !!pad.buttons[14]?.pressed || (pad.axes[0] ?? 0) < -0.6,
        right: !!pad.buttons[15]?.pressed || (pad.axes[0] ?? 0) > 0.6,
        confirm: !!pad.buttons[0]?.pressed || !!pad.buttons[2]?.pressed,
        back: !!pad.buttons[1]?.pressed,
        pause: !!pad.buttons[9]?.pressed,
        random: !!pad.buttons[3]?.pressed,
      };
      const prev = this.prevPadMenu[i];
      for (const [k, v] of Object.entries(now)) {
        if (v && !prev[k]) this.padMenuTapped[i].add(k as MenuAction);
        prev[k] = v;
      }
      for (const a of this.padMenuTapped[i]) out.add(a);
      this.padMenuTapped[i].clear();
    }
    return out;
  }

  isDown(code: string) {
    return this.down.has(code);
  }

  tappedCode(code: string) {
    return this.tapped.has(code);
  }

  /** Menu scenes call this at the end of their update so taps don't leak into the next frame. */
  endFrame() {
    this.tapped.clear();
  }
}

export const input = new InputManager();
