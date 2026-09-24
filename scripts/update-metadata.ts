
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { courses } from './courses-source';

// Helper to determine difficulty
const getDifficulty = (section: string, title: string): "easy" | "medium" | "hard" => {
    const s = section.toLowerCase();
    const t = title.toLowerCase();

    if (s.includes("easy") || t.includes("intro") || t.includes("basics")) return "easy";
    if (s.includes("hard") || s.includes("advanced") || t.includes("scale") || t.includes("distributed")) return "hard";
    return "medium";
};

// Helper to generate tags based on title/section
const getTags = (title: string, section: string) => {
    const tags = new Map<string, string>(); // Label -> Icon
    const t = title.toLowerCase();
    const s = section.toLowerCase();

    // Generic Section Tag
    if (s.includes("patterns")) tags.set("Design Patterns", "sparkles");
    else if (s.includes("principles")) tags.set("Design Principles", "shield");
    else if (s.includes("uml")) tags.set("UML Diagrams", "layout");
    else if (s.includes("oop")) tags.set("OOP Foundations", "box");
    else if (s.includes("interview")) tags.set("Interview Framework", "target");

    // Specific Keywords
    if (t.includes("factory") || t.includes("builder") || t.includes("singleton")) tags.set("Creational Pattern", "box");
    if (t.includes("adapter") || t.includes("decorator") || t.includes("proxy")) tags.set("Structural Pattern", "layout");
    if (t.includes("strategy") || t.includes("observer") || t.includes("command")) tags.set("Behavioral Pattern", "brain");

    if (t.includes("solid") || t.includes("dry") || t.includes("kiss")) tags.set("Best Practices", "shield");

    if (t.includes("system") || t.includes("design")) tags.set("System Design", "server");
    if (t.includes("cache") || t.includes("lru")) tags.set("Caching", "zap");
    if (t.includes("database") || t.includes("sql")) tags.set("Database", "server");
    if (t.includes("api") || t.includes("rest")) tags.set("API Design", "code");

    // Convert to array
    return Array.from(tags.entries()).map(([label, icon]) => ({ label, icon }));
};

console.log(`Processing ${courses.length} courses...`);

courses.forEach(course => {
    const courseDir = path.join(process.cwd(), 'src/content', course.slug);

    if (!fs.existsSync(courseDir)) {
        console.log(`Skipping missing directory: ${courseDir}`);
        return;
    }

    course.chapters.forEach(chapter => {
        const filePath = path.join(courseDir, `${chapter.slug}.md`);

        if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const { content, data } = matter(fileContent);

            // Update Metadata
            const newDifficulty = getDifficulty(chapter.section, chapter.title);
            const newTags = getTags(chapter.title, chapter.section);

            // Update data object
            data.difficulty = newDifficulty;
            data.tags = newTags;

            // Reconstruct file
            const newFileContent = matter.stringify(content, data);
            fs.writeFileSync(filePath, newFileContent);
            console.log(`Updated: ${chapter.slug} -> Diff: ${newDifficulty}, Tags: ${newTags.length}`);
        }
    });
});

console.log("Metadata update complete.");
