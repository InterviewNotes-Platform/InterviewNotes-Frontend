
import fs from 'fs';
import path from 'path';
import { courses } from './courses-source';

// Helper to sanitize title for filename if needed (though we have slug)
const sanitize = (str: string) => str.replace(/[^a-z0-9-]/gi, '-').toLowerCase();

console.log(`Found ${courses.length} courses.`);

courses.forEach(course => {
    const courseDir = path.join(process.cwd(), 'src/content', course.slug);

    if (!fs.existsSync(courseDir)) {
        console.log(`Creating directory: ${courseDir}`);
        fs.mkdirSync(courseDir, { recursive: true });
    }

    course.chapters.forEach(chapter => {
        const filePath = path.join(courseDir, `${chapter.slug}.md`);

        if (!fs.existsSync(filePath)) {
            // Determine difficulty based on section or random for now, or default "medium"
            let difficulty = "medium";
            if (chapter.section.toLowerCase().includes("easy")) difficulty = "easy";
            if (chapter.section.toLowerCase().includes("hard")) difficulty = "hard";

            const frontmatter = `---
title: "${chapter.title}"
description: "${chapter.title} - Part of ${chapter.section}"
difficulty: "${difficulty}"
tags:
  - label: "${chapter.section.split('. ')[1] || 'General'}"
    icon: "book"
companies: []
author: "InterviewNotes"
publishedDate: "${new Date().toISOString().split('T')[0]}"
---

# ${chapter.title}

:::tip{type="info"}
This content is currently being drafted. Check back soon!
:::

## Introduction

Start writing your content here...

:::solutioncard{type="good" title="Proposed Solution"}
Describe the solution...
:::
`;
            fs.writeFileSync(filePath, frontmatter);
            console.log(`Created: ${filePath}`);
        } else {
            console.log(`Skipped (exists): ${filePath}`);
        }
    });
});

console.log("Scaffolding complete.");
