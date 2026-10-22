import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LessonLoading from "../lessons/[slug]/loading";
import KnowledgeLoading from "../knowledge/[slug]/loading";
import ProblemLoading from "../problems/[slug]/loading";
import TrackLoading from "../tracks/[slug]/loading";
import LessonError from "../lessons/[slug]/error";
import KnowledgeError from "../knowledge/[slug]/error";
import ProblemError from "../problems/[slug]/error";
import TrackError from "../tracks/[slug]/error";

describe("loading boundaries", () => {
   it.each([
      ["Track", TrackLoading],
      ["Lesson", LessonLoading],
      ["Problem", ProblemLoading],
      ["Knowledge entry", KnowledgeLoading],
   ])("%s renders a busy main landmark announced once, with decorative bars", (name, Loading) => {
      const { container } = render(<Loading />);
      const main = screen.getByRole("main");
      expect(main).toHaveAttribute("aria-busy", "true");
      expect(screen.getByRole("status")).toHaveTextContent(`Loading ${name}`);
      expect(container.querySelector('[aria-hidden="true"]')?.children.length).toBeGreaterThan(0);
      expect(screen.queryByRole("heading")).toBeNull();
      expect(screen.queryByRole("link")).toBeNull();
   });
});

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
