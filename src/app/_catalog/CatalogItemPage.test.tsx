import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCatalogItem, getCatalogItemMeta } = vi.hoisted(() => ({
   getCatalogItem: vi.fn(),
   getCatalogItemMeta: vi.fn(),
}));
vi.mock("@/lib/catalog/client", () => ({ getCatalogItem, getCatalogItemMeta }));
vi.mock("next/navigation", () => ({
   notFound: () => {
      throw new Error("NEXT_NOT_FOUND");
   },
}));
vi.mock("@/components/mdx/Mermaid", () => ({ Mermaid: () => null }));

import { CatalogItemPage, catalogItemMetadata } from "./CatalogItemPage";

const META = {
   id: "lesson.dynamic-batching",
   type: "lesson",
   slug: "dynamic-batching",
   title: "Synthetic Lesson",
   summary: "Synthetic summary",
   tags: [],
   difficulty: null,
   level: null,
   access: "premium",
};
const LESSON = {
   ...META,
   kind: null,
   body: { format: "markdown@1", text: "Synthetic premium prose." },
   headings: [],
   sections: [],
   sections_withheld: false,
};
const KNOWLEDGE = {
   ...META,
   id: "knowledge.rag",
   type: "knowledge",
   slug: "rag",
   title: "Synthetic Knowledge",
   access: "free",
   kind: "concept",
   body: null,
   sections: [{ id: "definition", type: "definition", title: "Definition", body: { format: "markdown@1", text: "Synthetic free section." } }],
   sections_withheld: true,
};

async function show(type: "lesson" | "problem" | "knowledge", slug: string) {
   render(await CatalogItemPage({ type, slug }));
}

beforeEach(() => {
   vi.clearAllMocks();
   getCatalogItemMeta.mockResolvedValue({ status: "ok", data: META });
});

describe("CatalogItemPage lookup", () => {
   it.each(["lesson", "problem", "knowledge"] as const)("looks up a %s by its own type and slug", async (type) => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: LESSON });
      await show(type, "some-slug");
      expect(getCatalogItem).toHaveBeenCalledExactlyOnceWith(type, "some-slug");
   });
});

describe("CatalogItemPage states", () => {
   it("renders a lesson body through the shared renderer", async () => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: LESSON });
      await show("lesson", "dynamic-batching");
      expect(screen.getByRole("heading", { level: 1, name: "Synthetic Lesson" })).toBeInTheDocument();
      expect(screen.getByText("Synthetic premium prose.")).toBeInTheDocument();
   });

   it("renders authorized sections and flags withheld ones", async () => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: KNOWLEDGE });
      await show("knowledge", "rag");
      expect(screen.getByRole("heading", { level: 2, name: "Definition" })).toBeInTheDocument();
      expect(screen.getByText("Synthetic free section.")).toBeInTheDocument();
      expect(screen.getByRole("note")).toHaveTextContent(/premium/i);
   });

   it("asks an unauthenticated reader to sign in, returning to the same canonical URL", async () => {
      getCatalogItem.mockResolvedValue({ status: "unauthenticated" });
      await show("lesson", "dynamic-batching");
      expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
         "href",
         "/login?redirect=%2Flessons%2Fdynamic-batching"
      );
      expect(screen.getByRole("heading", { name: "Synthetic Lesson" })).toBeInTheDocument();
      expect(screen.queryByText("Synthetic premium prose.")).not.toBeInTheDocument();
   });

   it("tells an unentitled reader access is unavailable, with no sign-in prompt and no body", async () => {
      getCatalogItem.mockResolvedValue({ status: "unentitled" });
      await show("lesson", "dynamic-batching");
      expect(screen.getByRole("status")).toHaveTextContent("Paid access is not available yet.");
      expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
      expect(screen.queryByText("Synthetic premium prose.")).not.toBeInTheDocument();
   });

   it("keeps a locked page teaser to public metadata only", async () => {
      getCatalogItem.mockResolvedValue({ status: "unentitled" });
      await show("lesson", "dynamic-batching");
      expect(getCatalogItemMeta).toHaveBeenCalledWith("lesson", "dynamic-batching");
   });

   it("shows the not-found page for an unknown item", async () => {
      getCatalogItem.mockResolvedValue({ status: "notFound" });
      await expect(CatalogItemPage({ type: "lesson", slug: "nope" })).rejects.toThrow("NEXT_NOT_FOUND");
   });

   it("says a retired item was retired rather than not found", async () => {
      getCatalogItem.mockResolvedValue({ status: "retired" });
      await show("problem", "old");
      expect(screen.getByRole("status")).toHaveTextContent("retired");
      expect(getCatalogItemMeta).not.toHaveBeenCalled();
   });

   it.each(["transport", "upstream", "malformed"] as const)(
      "says unavailable, not not-found, for an unavailable/%s result, with no detail",
      async (cause) => {
         getCatalogItem.mockResolvedValue({ status: "unavailable", cause });
         await show("lesson", "x");
         expect(screen.getByRole("status")).toHaveTextContent("temporarily unavailable");
         expect(screen.getByRole("status")).not.toHaveTextContent(cause);
      }
   );
});

describe("catalogItemMetadata", () => {
   it("uses public metadata for the title and description", async () => {
      expect(await catalogItemMetadata("lesson", "dynamic-batching")).toEqual({
         title: "Synthetic Lesson",
         description: "Synthetic summary",
      });
      expect(getCatalogItem).not.toHaveBeenCalled();
   });

   it("falls back to the site default when metadata is unavailable", async () => {
      getCatalogItemMeta.mockResolvedValue({ status: "notFound" });
      expect(await catalogItemMetadata("lesson", "x")).toEqual({});
   });
});
