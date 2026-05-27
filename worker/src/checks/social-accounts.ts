import type { Check } from "./types";
import { getSocialAccounts } from "../actions/social";

export const socialAccountsCheck: Check = {
  key: "social_accounts",
  label: "Social Accounts",
  default: { accounts: [], cached: false },
  run: (ctx) => getSocialAccounts(ctx.env.DB, ctx.domain, ctx.env),
};
