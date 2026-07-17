import { emitKeypressEvents, createInterface } from "node:readline";
import { C } from "./commands.js";

export interface SelectItem<T> {
  label: string;
  value: T;
  /** dimmed text after the label, e.g. the current value */
  hint?: string;
}

const HIDE = "\x1b[?25l";
const SHOW = "\x1b[?25h";

function cleanupTty(): void {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  if (process.stdout.isTTY) process.stdout.write(SHOW);
}

/**
 * Arrow-key list picker in the style of Claude Code's /model dialog.
 * Returns the chosen value, or undefined on Esc/q. Requires a TTY.
 */
export function select<T>(title: string, items: SelectItem<T>[]): Promise<T | undefined> {
  return new Promise((resolvePick) => {
    let index = 0;
    let rendered = 0;

    const line = (item: SelectItem<T>, active: boolean): string => {
      const cursor = active ? `${C.cyan}❯${C.reset} ` : "  ";
      const label = active ? `${C.bold}${item.label}${C.reset}` : item.label;
      const hint = item.hint ? `  ${C.dim}${item.hint}${C.reset}` : "";
      return `${cursor}${label}${hint}`;
    };

    const render = (): void => {
      if (rendered > 0) process.stdout.write(`\x1b[${rendered}A\x1b[J`);
      const rows = [
        `${C.bold}${title}${C.reset} ${C.dim}(↑/↓ move · enter select · esc back)${C.reset}`,
        ...items.map((it, i) => line(it, i === index)),
      ];
      process.stdout.write(rows.join("\n") + "\n");
      rendered = rows.length;
    };

    emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdout.write(HIDE);
    render();

    const onKey = (_str: string, key: { name?: string; ctrl?: boolean }): void => {
      if (key.ctrl && key.name === "c") {
        finish(undefined);
        process.exit(130);
      }
      if (key.name === "up" || key.name === "k") {
        index = (index - 1 + items.length) % items.length;
        render();
      } else if (key.name === "down" || key.name === "j") {
        index = (index + 1) % items.length;
        render();
      } else if (key.name === "return") {
        finish(items[index].value);
      } else if (key.name === "escape" || key.name === "q") {
        finish(undefined);
      }
    };

    const finish = (value: T | undefined): void => {
      process.stdin.off("keypress", onKey);
      process.stdin.pause();
      cleanupTty();
      resolvePick(value);
    };

    process.stdin.on("keypress", onKey);
  });
}

/** One-line free-text prompt (used for custom model names). */
export function ask(question: string): Promise<string> {
  cleanupTty();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolveAns) => {
    rl.question(`${question} `, (answer) => {
      rl.close();
      resolveAns(answer.trim());
    });
  });
}

process.on("exit", cleanupTty);
