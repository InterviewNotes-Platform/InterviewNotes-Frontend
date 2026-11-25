"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { NODE_TYPE } from "@/lib/practice-graph/vocabulary";
import type { GraphEditor } from "./useGraphEditor";

interface Props {
   editor: GraphEditor;
   source: string;
   onPick: (target: string) => void;
   onClose: () => void;
}

/** `C` on the canvas: choose the target by typing its name (contract §5.2). The connection is made only once both ends are chosen. */
export function ConnectPicker({ editor, source, onPick, onClose }: Props) {
   const ids = useId();
   const [query, setQuery] = useState("");
   const [active, setActive] = useState(0);
   const input = useRef<HTMLInputElement>(null);
   const q = query.trim().toLowerCase();
   const options = editor.draft.graph.nodes.filter((n) => n.id !== source && editor.describe("node", n.id).toLowerCase().includes(q));
   const current = options[Math.min(active, options.length - 1)];
   useEffect(() => input.current?.focus(), []);
   const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
         event.preventDefault();
         setActive((a) => Math.min(a + 1, options.length - 1));
      } else if (event.key === "ArrowUp") {
         event.preventDefault();
         setActive((a) => Math.max(a - 1, 0));
      } else if (event.key === "Enter") {
         event.preventDefault();
         if (current) onPick(current.id);
      } else if (event.key === "Escape") {
         event.preventDefault();
         onClose();
      }
   };
   return (
      <div className="pg-picker" role="dialog" aria-labelledby={`${ids}-t`}>
         <p id={`${ids}-t`} className="m-0 mb-2 font-semibold">
            Connect {editor.describe("node", source)} to…
         </p>
         <input
            ref={input}
            className="pg-picker-input"
            role="combobox"
            aria-label="Target component"
            aria-expanded="true"
            aria-controls={`${ids}-l`}
            aria-autocomplete="list"
            aria-activedescendant={current ? `${ids}-${current.id}` : undefined}
            value={query}
            onChange={(e) => {
               setQuery(e.target.value);
               setActive(0);
            }}
            onKeyDown={onKeyDown}
            onBlur={(e) => {
               if (!e.currentTarget.parentElement?.contains(e.relatedTarget)) onClose();
            }}
         />
         <ul id={`${ids}-l`} role="listbox" aria-label="Components">
            {options.map((n) => (
               <li
                  key={n.id}
                  id={`${ids}-${n.id}`}
                  role="option"
                  aria-selected={current?.id === n.id}
                  className={current?.id === n.id ? "is-active" : undefined}
                  onMouseDown={(e) => {
                     e.preventDefault();
                     onPick(n.id);
                  }}
               >
                  {editor.describe("node", n.id)} <span className="text-muted-foreground">{NODE_TYPE[n.type].label}</span>
               </li>
            ))}
            {options.length === 0 ? <li className="text-muted-foreground">No match</li> : null}
         </ul>
         <p className="m-0 text-sm text-muted-foreground">Enter connects · Escape cancels</p>
      </div>
   );
}
