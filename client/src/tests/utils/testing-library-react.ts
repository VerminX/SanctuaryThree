import { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type WaitForOptions = {
  timeout?: number;
  interval?: number;
};

interface RenderResult {
  container: { markup: string };
  rerender: (ui: ReactElement) => void;
  unmount: () => void;
}

let currentMarkup = "";

export function render(ui: ReactElement): RenderResult {
  currentMarkup = renderToStaticMarkup(ui);

  return {
    container: { markup: currentMarkup },
    rerender(nextUi: ReactElement) {
      currentMarkup = renderToStaticMarkup(nextUi);
    },
    unmount() {
      currentMarkup = "";
    },
  };
}

export function cleanup() {
  currentMarkup = "";
}

export const screen = {
  getByText(text: string) {
    if (!currentMarkup.includes(text)) {
      throw new Error(`Unable to find text: ${text}`);
    }
    return text;
  },
  getByTestId(testId: string) {
    const pattern = new RegExp(`data-testid="${testId}"`);
    if (!pattern.test(currentMarkup)) {
      throw new Error(`Unable to find data-testid: ${testId}`);
    }
    return testId;
  },
};

export async function waitFor<T>(callback: () => T, options: WaitForOptions = {}): Promise<T> {
  const { timeout = 1000, interval = 50 } = options;
  const start = Date.now();
  let lastError: unknown;

  while (Date.now() - start < timeout) {
    try {
      return callback();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("waitFor callback timed out");
}
