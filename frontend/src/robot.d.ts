export type RobotAction =
  | "nod" | "shake" | "poke" | "wave" | "celebrate"
  | "spin" | "dance" | "shrug" | "salute" | "bow" | "point"
  | "lookAround" | "flex" | "clap" | "yawn" | "sleep"
  | "backflip" | "jump" | "ponder";

export interface RobotController {
  /** AI is working: 0 = THINK, 1 = DECIDE, 2 = ACT */
  setStage(stage: 0 | 1 | 2): void;
  /** back-compat: true → thinking, false → idle */
  setPointing(on: boolean): void;
  success(): void;
  error(): void;
  reset(): void;
  wave(): void;
  nod(): void;
  celebrate(): void;
  poke(): void;

  /** play any named one-shot action; returns false if the name is unknown */
  play(name: RobotAction): boolean;
  spin(): void;
  dance(): void;
  shrug(): void;
  salute(): void;
  bow(): void;
  point(): void;
  lookAround(): void;
  flex(): void;
  clap(): void;
  yawn(): void;
  sleep(): void;
  backflip(): void;
  jump(): void;
  ponder(): void;
  /** names of every available one-shot action */
  actions: RobotAction[];

  dispose(): void;
}

export function createRobotScene(container: HTMLElement): RobotController;
