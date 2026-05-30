import { checkLlmsTxt } from "../actions/analyze/content";
import type { Check } from "./types";

export const llmsTxtCheck: Check = {
  key: "llms_txt",
  label: "LLMs.txt",
  default: { found: false, content: null, full_found: false, full_content: null },
  run: (ctx) => checkLlmsTxt(ctx.domain, ctx.instanceHost),
};
