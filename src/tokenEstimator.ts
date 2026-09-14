/**
 * tokenEstimator.ts
 * ------------------------------------------------------------------
 * Estimates how many LLM tokens the generated markdown will cost.
 *
 * We deliberately do NOT bundle a real BPE tokenizer (e.g. tiktoken).
 * That would add a multi-MB vocab file and tie the estimate to one
 * specific vendor's tokenizer, which is exactly the kind of "heavy
 * and opinionated" dependency this CLI is trying to avoid. Instead
 * we use the widely-cited ~4-characters-per-token rule of thumb for
 * English/code text, which is what OpenAI and Anthropic both publish
 * as a fast approximation. It's clearly labeled as an estimate in
 * the output so nobody mistakes it for an exact count.
 * ------------------------------------------------------------------
 */
import { TokenStats } from "./types";

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): TokenStats {
  const totalChars = text.length;
  const approxTokens = Math.ceil(totalChars / CHARS_PER_TOKEN);
  return { totalChars, approxTokens };
}

/** Common context-window sizes, used to give the estimate a point of reference. */
const CONTEXT_WINDOWS: { label: string; size: number }[] = [
  { label: "8K", size: 8_000 },
  { label: "32K", size: 32_000 },
  { label: "128K", size: 128_000 },
  { label: "200K", size: 200_000 },
];

/**
 * Render a one-line human note like:
 *   "~3,241 tokens — fits comfortably within an 8K context window"
 * or, for a large output:
 *   "~145,900 tokens — fits within a 200K context window, but exceeds 128K"
 */
export function formatTokenBudgetNote(approxTokens: number): string {
  const smallestFit = CONTEXT_WINDOWS.find((w) => approxTokens <= w.size);

  if (smallestFit) {
    return `~${approxTokens.toLocaleString()} tokens — fits comfortably within a ${smallestFit.label} context window`;
  }

  const largest = CONTEXT_WINDOWS[CONTEXT_WINDOWS.length - 1];
  return `~${approxTokens.toLocaleString()} tokens — exceeds even a ${largest.label} context window; consider --max-depth, --no-content, or a tighter .ctxignore`;
}
