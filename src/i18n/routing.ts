import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["pt-BR"],
  defaultLocale: "pt-BR",
  /** App só em pt-BR: não prefixar URLs com o locale. */
  localePrefix: "never",
});
