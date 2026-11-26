import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPracticeClient } from "@/lib/practice-workspace/client";
import { createFakePracticeApi } from "@/lib/practice-workspace/fakeApi";
import { installFakeAttempts } from "@/lib/practice-workspace/fakeAttempts";
import { createDiagramEngine, type DiagramEngine } from "@/lib/practice-graph/diagramSave";
import { installFakeDiagram } from "@/lib/practice-graph/fakeDiagram";
import { NODE_TYPE, NODE_TYPE_ORDER } from "@/lib/practice-graph/vocabulary";

// The React Flow canvas needs a real layout engine; it is exercised in the browser smoke. Here the canvas is a plain focusable stand-in.
vi.mock("./CanvasView", async () => {
   const { createElement } = await import("react");
   return { CanvasView: () => createElement("div", { "data-canvas-stub": "" }) };
});
vi.mock("@xyflow/react", async () => {
   const { Fragment, createElement } = await import("react");
   return {
      ReactFlowProvider: ({ children }: { children: import("react").ReactNode }) => createElement(Fragment, null, children),
      useReactFlow: () => ({ screenToFlowPosition: (p: { x: number; y: number }) => p }),
      Handle: () => null,
      Position: { Top: "top", Right: "right", Bottom: "bottom", Left: "left" },
   };
});

import DiagramEditor from "./DiagramEditor";
import { Silhouette } from "./shapes";

const API = "https://api.example.test";

async function setup(readOnly = false) {
   const api = createFakePracticeApi();
   const token = api.signIn("ada");
   const attempts = installFakeAttempts(api, { consent: { requiredVersion: "v1", accepted: true } });
   const diagrams = installFakeDiagram(api, attempts);
   const client = createPracticeClient({ baseUrl: API, getAccessToken: async () => token, fetch: api.fetch });
   const created = await client.createAttempt({ content_id: "problem.llm-attribute-extraction-pipeline", mode: "self", target_seniority: "senior" }, "key-aaaaaaaaaaaaaaaa");
   if (created.status !== "ok") throw new Error("setup");
   const read = await client.getDiagram(created.data.id);
   if (read.status !== "ok") throw new Error("setup");
   const engine: DiagramEngine = createDiagramEngine(client, created.data.id, read.data, () => undefined);
   const view = render(<DiagramEditor engine={engine} readOnly={readOnly} refusal={null} variant="design" />);
   return { api, diagrams, engine, view, id: created.data.id };
}

const canvas = () => screen.getByRole("region", { name: "Design canvas" });
const graph = (engine: DiagramEngine) => engine.getSnapshot().draft.graph;
const outline = () => screen.getByRole("region", { name: "Outline" });
const form = (heading: string) => within(outline()).getByRole("heading", { name: heading }).closest("form") as HTMLFormElement;

beforeEach(() => {
   vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
   vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
   vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
});
afterEach(() => vi.unstubAllGlobals());

describe("palette and shape vocabulary", () => {
   it("offers every contract type once, with its own single key, and no decorative or free-form tool", async () => {
      await setup();
      const palette = screen.getByRole("group", { name: "Add a component" });
      const names = within(palette).getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent);
      expect(names).toEqual([...NODE_TYPE_ORDER.map((t) => `Add a ${NODE_TYPE[t].label.toLowerCase()}`), "Connect"]);
      expect(new Set(NODE_TYPE_ORDER.map((t) => NODE_TYPE[t].key)).size).toBe(10);
   });

   it("draws a different silhouette for each type, so types differ without colour", () => {
      const drawings = NODE_TYPE_ORDER.map((type) => renderToStaticMarkup(<svg>{Silhouette({ type, w: 140, h: 60 })}</svg>).replace(/var\(--[a-z-]+\)/g, ""));
      expect(new Set(drawings).size).toBe(NODE_TYPE_ORDER.length);
   });
});

describe("keyboard shortcut scope (AC-13.4)", () => {
   it("adds by type key only while the canvas has focus, never while typing, and not when switched off", async () => {
      const { engine } = await setup();
      fireEvent.keyDown(canvas(), { key: "2" });
      expect(graph(engine).nodes.map((n) => n.type)).toEqual(["service"]);
      const name = await screen.findByRole("textbox", { name: "Name" });
      fireEvent.keyDown(name, { key: "2" });
      fireEvent.keyDown(name, { key: "c" });
      fireEvent.keyDown(name, { key: "/" });
      fireEvent.keyDown(name, { key: "Delete" });
      expect(graph(engine).nodes).toHaveLength(1);
      fireEvent.click(screen.getByText("View settings"));
      fireEvent.click(screen.getByLabelText("Single-key shortcuts on the canvas"));
      fireEvent.keyDown(canvas(), { key: "4" });
      expect(graph(engine).nodes).toHaveLength(1);
   });

   it("undo, redo, duplicate and delete use a modifier or Delete; Escape clears the selection", async () => {
      const { engine } = await setup();
      fireEvent.keyDown(canvas(), { key: "1" });
      fireEvent.keyDown(canvas(), { key: "d", ctrlKey: true });
      expect(graph(engine).nodes).toHaveLength(2);
      fireEvent.keyDown(canvas(), { key: "z", metaKey: true });
      expect(graph(engine).nodes).toHaveLength(1);
      fireEvent.keyDown(canvas(), { key: "z", metaKey: true, shiftKey: true });
      expect(graph(engine).nodes).toHaveLength(2);
      fireEvent.keyDown(canvas(), { key: "Delete" });
      expect(graph(engine).nodes).toHaveLength(1);
      fireEvent.keyDown(canvas(), { key: "Escape" });
      expect(screen.getByRole("heading", { level: 2, name: "Your design" })).toBeInTheDocument();
   });

   it("C opens a target picker for the selected component; / opens the Outline search", async () => {
      const { engine } = await setup();
      fireEvent.keyDown(canvas(), { key: "1" });
      fireEvent.keyDown(canvas(), { key: "2" });
      fireEvent.keyDown(canvas(), { key: "c" });
      const picker = screen.getByRole("combobox", { name: "Target component" });
      fireEvent.keyDown(picker, { key: "Enter" });
      expect(graph(engine).edges).toHaveLength(1);
      fireEvent.keyDown(canvas(), { key: "/" });
      expect(screen.getByRole("region", { name: "Outline" })).toBeInTheDocument();
   });
});

describe("Outline parity (AC-13.5): every semantic action without the canvas", () => {
   it("adds, renames, retypes, sets subtype and boundary, explains, connects, sets kind and tag, swaps, deletes, undoes, redoes and restores", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { engine, diagrams, id } = await setup();
      fireEvent.click(screen.getByRole("button", { name: "Outline", exact: true } as never));
      const add = (type: string, name: string) => {
         fireEvent.change(within(form("Add a component")).getByLabelText("Type"), { target: { value: type } });
         fireEvent.change(within(form("Add a component")).getByLabelText("Name"), { target: { value: name } });
         fireEvent.submit(form("Add a component"));
      };
      add("client", "Web");
      add("service", "API");
      expect(graph(engine).nodes.map((n) => n.label)).toEqual(["Web", "API"]);
      const open = () => outline().querySelector("li.is-open") as HTMLElement;
      // The just-added component is open inline: rename, retype, subtype, explanation.
      fireEvent.change(within(open()).getByRole("textbox", { name: "Name" }), { target: { value: "API service" } });
      fireEvent.change(within(open()).getByLabelText("Type"), { target: { value: "gateway" } });
      fireEvent.change(within(open()).getByLabelText("Subtype"), { target: { value: "api_gateway" } });
      fireEvent.change(within(open()).getByRole("textbox", { name: "Explanation" }), { target: { value: "Checks every request." } });
      const api = graph(engine).nodes[1];
      expect(api).toMatchObject({ label: "API service", type: "gateway", subtype: "api_gateway", explanation: "Checks every request." });
      // Boundary and membership.
      fireEvent.change(within(outline()).getByLabelText("Boundary name"), { target: { value: "Edge" } });
      fireEvent.submit(within(outline()).getByLabelText("Boundary name").closest("form")!);
      fireEvent.click(within(open()).getByRole("checkbox", { name: "API service" }));
      expect(graph(engine).nodes[1].boundary).toBe(graph(engine).boundaries[0].id);
      // Connect with From, To and Kind; then tag, explanation and swap.
      fireEvent.change(within(form("Connect two components")).getByLabelText("From"), { target: { value: graph(engine).nodes[0].id } });
      fireEvent.change(within(form("Connect two components")).getByLabelText("To"), { target: { value: api.id } });
      fireEvent.change(within(form("Connect two components")).getByLabelText("Kind"), { target: { value: "stream" } });
      fireEvent.submit(form("Connect two components"));
      fireEvent.change(within(open()).getByRole("textbox", { name: "Tag (optional)" }), { target: { value: "events" } });
      fireEvent.change(within(open()).getByRole("textbox", { name: "Explanation" }), { target: { value: "Pushes events." } });
      fireEvent.click(within(open()).getByRole("button", { name: "Swap direction" }));
      expect(graph(engine).edges[0]).toMatchObject({ from: api.id, to: graph(engine).nodes[0].id, kind: "stream", tag: "events", explanation: "Pushes events." });
      await act(async () => {
         await vi.advanceTimersByTimeAsync(1600);
      });
      // Delete, undo, redo.
      fireEvent.click(within(open()).getByRole("button", { name: "Delete connection" }));
      expect(graph(engine).edges).toHaveLength(0);
      fireEvent.click(within(outline()).getByRole("button", { name: "Undo" }));
      expect(graph(engine).edges).toHaveLength(1);
      fireEvent.click(within(outline()).getByRole("button", { name: "Redo" }));
      expect(graph(engine).edges).toHaveLength(0);
      // Restore from Recently deleted once the deletion is saved.
      await act(async () => {
         await vi.advanceTimersByTimeAsync(1600);
      });
      const restore = within(outline()).getByText("Restore", { exact: false, selector: "[data-recently-deleted] button" });
      expect(restore).toHaveTextContent("Restore A stream connection tagged events");
      fireEvent.click(restore);
      expect(graph(engine).edges[0].explanation).toBe("Pushes events.");
      await act(async () => {
         await vi.advanceTimersByTimeAsync(1600);
      });
      expect(diagrams.diagram(id).tombstones).toEqual([]);
      vi.useRealTimers();
   });

   it("renders hostile learner text as text, never as markup", async () => {
      const { engine } = await setup();
      fireEvent.click(screen.getByRole("button", { name: "Outline", exact: true } as never));
      fireEvent.change(within(form("Add a component")).getByLabelText("Name"), { target: { value: `<img src=x onerror="alert(1)">` } });
      fireEvent.submit(form("Add a component"));
      expect(graph(engine).nodes[0].label).toBe(`<img src=x onerror="alert(1)">`);
      expect(document.querySelector("img")).toBeNull();
      expect(within(outline()).getAllByText(`<img src=x onerror="alert(1)">`).length).toBeGreaterThan(0);
   });

   it("a read-only attempt shows the graph but offers no change", async () => {
      await setup(true);
      expect(screen.queryByRole("group", { name: "Add a component" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Outline", exact: true } as never));
      expect(within(form("Add a component")).getByRole("button", { name: "Add component" })).toBeDisabled();
   });
});
