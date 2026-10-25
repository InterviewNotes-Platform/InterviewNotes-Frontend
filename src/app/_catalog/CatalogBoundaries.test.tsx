import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LessonError from "../lessons/[slug]/error";
import KnowledgeError from "../knowledge/[slug]/error";
import ProblemError from "../problems/[slug]/error";
import TrackError from "../tracks/[slug]/error";

describe("error boundaries", () => {
   it.each([
      ["Track", TrackError],
      ["Lesson", LessonError],
      ["Problem", ProblemError],
      ["Knowledge", KnowledgeError],
   ])("%s explains the failure, retries through the framework and links to the Tracks", (_name, Error) => {
      const retry = vi.fn();
      render(<Error retry={retry} />);

      expect(screen.getByRole("alert")).toHaveTextContent("This page could not be displayed");
      expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Browse Tracks" })).toHaveAttribute("href", "/#tracks");

      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(retry).toHaveBeenCalledTimes(1);
   });
});
