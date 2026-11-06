import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrivacyPage from "./page";

// P7-T48: what Lesson and Problem progress (M2) stores, from decisions.md §2.2.3 "Disclosure (P7-T48)" and I-1 … I-9.
function section() {
   const { container } = render(<PrivacyPage />);
   const heading = screen.getByRole("heading", { level: 3, name: "Your Lesson and Problem progress" });
   return { container, part: heading.parentElement as HTMLElement };
}

describe("Privacy page: Lesson and Problem progress", () => {
   it("lists exactly what is stored: completion, bookmark, last opened and a personal note", () => {
      const { part } = section();
      const items = within(part).getAllByRole("listitem").map((item) => item.textContent);
      expect(items).toEqual(["when you marked it complete;", "when you bookmarked it;", "when you last opened it; and", "a personal note, if you write one."]);
   });

   it("says it is being rolled out and may not be on, so it does not promise the feature", () => {
      const { part } = section();
      expect(part).toHaveTextContent("being rolled out and may not be on yet");
   });

   it("says the item's ID is stored and not its text, and that Knowledge entries are not included", () => {
      const { part } = section();
      expect(part).toHaveTextContent("We store the item's ID with these, not its text.");
      expect(part).toHaveTextContent("Knowledge entries are not included.");
   });

   it("ties it to the account and says other learners cannot see it, without claiming no other access path exists", () => {
      const { container, part } = section();
      expect(part).toHaveTextContent("Your progress is associated with your account and is not visible to other learners.");
      expect(part).toHaveTextContent("we don't put your notes in our logs and we don't send a note to an AI feature");
      expect(part).toHaveTextContent("We don't sell or share it");
      expect(container).not.toHaveTextContent(/only you can reach|private to your account|never send|unable to access|no one else/i);
   });

   it("says unmarking or clearing empties the field but leaves the record until Delete all", () => {
      const { part } = section();
      expect(part).toHaveTextContent("Unmarking an item or clearing a note empties that field");
      expect(part).toHaveTextContent("stays until you use Delete all");
   });

   it("says in the controls that the export includes it and Delete all removes it", () => {
      const { container } = section();
      const controls = screen.getByRole("heading", { level: 2, name: "Your controls" }).parentElement as HTMLElement;
      expect(controls).toHaveTextContent(/Delete all: removes all your stories, answers, links and your target level, and your Lesson and Problem progress: completion, bookmarks, notes and last-opened times/);
      expect(controls).toHaveTextContent(/Export: a JSON file with everything you saved, including your Lesson and Problem progress/);
      expect(container).toHaveTextContent(/Once Lesson and Problem progress is on, the workspace also keeps/);
   });

   it("keeps the TL;DR first and claims no backups for the new data either", () => {
      const { container } = section();
      expect(screen.getAllByRole("heading", { level: 2 })[0]).toHaveTextContent("TL;DR");
      expect(container).toHaveTextContent("We don't currently keep backups, so we can't restore lost data.");
   });
});
