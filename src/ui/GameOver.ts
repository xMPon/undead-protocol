// Death screen — shows the round reached and the stored best for the map that
// was played, with restart / menu actions. Bests are per map, so the screen names
// the map rather than implying one global record.

export class GameOver {
  readonly el: HTMLDivElement;
  onRestart?: () => void;
  onMenu?: () => void;
  private roundEl: HTMLElement;
  private bestEl: HTMLElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "overlay hidden";
    this.el.innerHTML = `
      <h1 style="color:var(--blood-bright)">YOU DIED</h1>
      <div class="gameover-stat">Reached Round <b data-round>1</b></div>
      <div class="gameover-best" data-best>Best: 1</div>
      <div class="menu-btns">
        <button class="btn danger" data-restart>Redeploy</button>
        <button class="btn secondary" data-menu>Return to Menu</button>
      </div>
    `;
    parent.appendChild(this.el);
    this.roundEl = this.el.querySelector("[data-round]")!;
    this.bestEl = this.el.querySelector("[data-best]")!;
    this.el.querySelector("[data-restart]")!.addEventListener("click", () => this.onRestart?.());
    this.el.querySelector("[data-menu]")!.addEventListener("click", () => this.onMenu?.());
  }

  show(round: number, best: number, mapName: string, isRecord = false): void {
    this.roundEl.textContent = String(round);
    this.bestEl.textContent = isRecord
      ? `New ${mapName} record — Round ${best}`
      : `${mapName} best: Round ${best}`;
    this.bestEl.classList.toggle("record", isRecord);
    this.el.classList.remove("hidden");
  }
  hide(): void {
    this.el.classList.add("hidden");
  }
}
