import { describe, expect, it } from "vitest";
import { homeRoles, ROLE_ITEMS_SHOWN, ROLE_PATHS } from "./roles";
import type { CatalogMeta } from "./types";

const meta = (id: string, title = `Title of ${id}`): CatalogMeta => {
   const [type, slug] = id.split(".") as [CatalogMeta["type"], string];
   return { id, type, slug, title, summary: "", tags: [], category: null, difficulty: null, level: null, access: "free" };
};
const page = (...items: CatalogMeta[]) => ({ status: "ok" as const, data: { items, next_cursor: null } });

describe("homeRoles", () => {
   it("offers only roles with a published item, in the proposed order, with catalog titles and routes", () => {
      const roles = homeRoles(page(meta("knowledge.kv-cache", "The KV cache"), meta("lesson.evaluating-generated-output"), meta("lesson.unrelated")));
      expect(roles).toEqual([
         {
            key: "ai-engineer",
            label: "AI / LLM Engineer",
            items: [
               { id: "lesson.evaluating-generated-output", title: "Title of lesson.evaluating-generated-output", href: "/lessons/evaluating-generated-output" },
               { id: "knowledge.kv-cache", title: "The KV cache", href: "/knowledge/kv-cache" },
            ],
         },
      ]);
   });

   it("never names an id the catalog did not return", () => {
      expect(homeRoles(page())).toEqual([]);
      expect(homeRoles(page(meta("lesson.not-mapped")))).toEqual([]);
   });

   it("offers nothing when the list read failed", () => {
      expect(homeRoles({ status: "unavailable" } as never)).toEqual([]);
   });

   it("drops untitled or mismatched entries and caps each role's list", () => {
      const all = ROLE_PATHS.flatMap(({ ids }) => ids).map((id) => meta(id));
      const roles = homeRoles(page(...all, { ...meta("lesson.ml-ai-interview-loops"), title: " " }, { ...meta("lesson.role-guide-ml-engineer"), slug: "other" }));
      expect(roles.map((r) => r.key)).toEqual(["ml-engineer", "ai-engineer", "mlops-engineer"]);
      for (const role of roles) expect(role.items).toHaveLength(ROLE_ITEMS_SHOWN);
      expect(new Set(roles[0].items.map((i) => i.id)).size).toBe(ROLE_ITEMS_SHOWN);
   });
});
