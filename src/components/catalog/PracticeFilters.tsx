import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FiltersPanel } from "@/components/practice/FiltersPanel";
import { ACCESS_VALUES, DIFFICULTIES, LEVELS, activeFilterCount, practiceHref, type PracticeQuery } from "@/lib/catalog/practice";
import { DIFFICULTY_LABEL, LEVEL_LABEL } from "./EntryRow";

const CONTROL =
   "h-11 w-full appearance-none rounded-md border border-input bg-background pr-10 pl-3 text-body text-foreground transition-micro hover:border-foreground disabled:cursor-not-allowed disabled:opacity-50";

interface Option {
   value: string;
   label: string;
}

/** A native select: its value is the filter's own, and the empty value means "no filter". Disabled when there is nothing to choose. */
function FilterSelect({ name, label, anyLabel, options, value }: { name: string; label: string; anyLabel: string; options: Option[]; value: string | null }) {
   const id = `practice-${name}`;
   return (
      <div>
         <label htmlFor={id} className="mb-1.5 block text-supporting font-medium text-muted-foreground">
            {label}
         </label>
         <div className="relative">
            <select id={id} name={name} defaultValue={value ?? ""} disabled={options.length === 0} className={CONTROL}>
               <option value="">{anyLabel}</option>
               {options.map((option) => (
                  <option key={option.value} value={option.value}>
                     {option.label}
                  </option>
               ))}
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
         </div>
      </div>
   );
}

const ACCESS_CHOICES: Option[] = [{ value: "", label: "All" }, ...ACCESS_VALUES.map((value) => ({ value, label: value === "free" ? "Free" : "Premium" }))];

/**
 * The five Problem filters as a native GET form, so the URL is the state and nothing needs script to apply. The
 * options are whatever the page was given (Tracks from the Track list, Topics from Problem metadata). Applying
 * starts again from the first page; "Clear filters" is a plain link back to the bare route.
 */
export function PracticeFilters({ query, topics, tracks }: { query: PracticeQuery; topics: string[]; tracks: { slug: string; title: string }[] }) {
   const active = activeFilterCount(query);
   // The current Topic stays selectable even if the scan did not see it, so applying never silently drops it.
   const topicOptions = (query.tag && !topics.includes(query.tag) ? [...topics, query.tag].sort() : topics).map((tag) => ({ value: tag, label: tag }));
   // Keyed by the URL state: the controls are uncontrolled, so any navigation (Clear filters, paging) must remount them to show it.
   return (
      <form key={practiceHref(query)} method="get" action={practiceHref()} aria-label="Filter Problems">
         <FiltersPanel activeCount={active}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
               <FilterSelect name="tag" label="Topic" anyLabel="All topics" options={topicOptions} value={query.tag} />
               <FilterSelect
                  name="difficulty"
                  label="Difficulty"
                  anyLabel="Any difficulty"
                  options={DIFFICULTIES.map((value) => ({ value, label: DIFFICULTY_LABEL[value] }))}
                  value={query.difficulty}
               />
               <FilterSelect name="level" label="Level" anyLabel="Any level" options={LEVELS.map((value) => ({ value, label: LEVEL_LABEL[value] }))} value={query.level} />
               <FilterSelect
                  name="track"
                  label="Track"
                  anyLabel="All Tracks"
                  options={tracks.map(({ slug, title }) => ({ value: slug, label: title }))}
                  value={query.track}
               />
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-x-10 gap-y-4">
               <fieldset className="m-0 min-w-0 border-0 p-0">
                  <legend className="mb-1.5 p-0 text-supporting font-medium text-muted-foreground">Access</legend>
                  <div className="flex flex-wrap gap-x-5">
                     {ACCESS_CHOICES.map(({ value, label }) => (
                        <label key={label} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-body">
                           <input type="radio" name="access" value={value} defaultChecked={(query.access ?? "") === value} className="size-4 accent-primary" />
                           {label}
                        </label>
                     ))}
                  </div>
               </fieldset>
               <div className="flex items-center gap-5">
                  <Button type="submit" className="h-11 px-6 text-body">
                     Apply
                  </Button>
                  {active > 0 ? (
                     <Link href={practiceHref()} prefetch={false} className="inline-flex min-h-11 items-center text-body text-primary underline underline-offset-4">
                        Clear filters
                     </Link>
                  ) : null}
               </div>
            </div>
         </FiltersPanel>
      </form>
   );
}
