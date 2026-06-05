import * as fs from "node:fs";
import * as path from "node:path";

export interface TodoItem {
	file: string;
	line: number;
	text: string;
	priority?: "high" | "medium" | "low";
}

/**
 * Find all TODO comments in the codebase.
 * Searches for TODO, FIXME, and XXX patterns.
 */
export async function findAllTodos(cwd: string): Promise<TodoItem[]> {
	const todos: TodoItem[] = [];

	// List of patterns to search for
	const patterns = [/\bTODO\b/i, /\bFIXME\b/i, /\bXXX\b/i];

	// Directories to skip
	const skipDirs = new Set([
		"node_modules",
		".git",
		".next",
		"dist",
		"build",
		"coverage",
		".pi",
		".vscode",
		".idea",
		"target",
		"out",
	]);

	// File extensions to search (common code files)
	const codeExtensions = new Set([
		".ts",
		".tsx",
		".js",
		".jsx",
		".py",
		".java",
		".go",
		".rs",
		".rb",
		".php",
		".cs",
		".cpp",
		".c",
		".h",
		".sh",
		".bash",
		".json",
		".yaml",
		".yml",
		".md",
		".txt",
		".sql",
		".html",
		".css",
		".scss",
		".vue",
	]);

	async function walkDir(dir: string): Promise<void> {
		try {
			const entries = await fs.promises.readdir(dir, { withFileTypes: true });

			for (const entry of entries) {
				if (entry.isDirectory()) {
					if (!skipDirs.has(entry.name)) {
						await walkDir(path.join(dir, entry.name));
					}
				} else if (entry.isFile()) {
					const ext = path.extname(entry.name).toLowerCase();
					if (codeExtensions.has(ext)) {
						const filePath = path.join(dir, entry.name);
						const relPath = path.relative(cwd, filePath);

						try {
							const content = await fs.promises.readFile(filePath, "utf-8");
							const lines = content.split("\n");

							lines.forEach((line, index) => {
								for (const pattern of patterns) {
									if (pattern.test(line)) {
										// Extract the TODO text
										const match = line.match(/(?:TODO|FIXME|XXX)[\s:]*(.*)$/i);
										const text = match ? match[1].trim() : line.trim();

										// Determine priority based on markers
										let priority: "high" | "medium" | "low" | undefined;
										if (line.includes("!") || line.includes("URGENT") || line.includes("CRITICAL")) {
											priority = "high";
										} else if (line.includes("?")) {
											priority = "low";
										}

										todos.push({
											file: relPath,
											line: index + 1,
											text,
											...(priority && { priority }),
										});
										break; // Only match once per line
									}
								}
							});
						} catch {
							// Skip files that can't be read
						}
					}
				}
			}
		} catch {
			// Skip directories that can't be read
		}
	}

	await walkDir(cwd);

	// Sort by priority (high first), then by file, then by line number
	todos.sort((a, b) => {
		const priorityOrder = { high: 0, medium: 1, low: 2, undefined: 1 };
		const priorityDiff =
			(priorityOrder[a.priority as keyof typeof priorityOrder] ?? 1) -
			(priorityOrder[b.priority as keyof typeof priorityOrder] ?? 1);
		if (priorityDiff !== 0) return priorityDiff;

		const fileDiff = a.file.localeCompare(b.file);
		if (fileDiff !== 0) return fileDiff;

		return a.line - b.line;
	});

	return todos;
}

/**
 * Format TODO items as markdown for display.
 */
export function formatTodosAsMarkdown(todos: TodoItem[]): string {
	if (todos.length === 0) {
		return "No TODOs found in the codebase!";
	}

	const lines: string[] = [];
	lines.push(`Found **${todos.length}** TODO${todos.length === 1 ? "" : "s"}:\n`);

	// Group by priority
	const byPriority = { high: [] as TodoItem[], medium: [] as TodoItem[], low: [] as TodoItem[] };
	const noPriority: TodoItem[] = [];

	for (const todo of todos) {
		if (todo.priority === "high") {
			byPriority.high.push(todo);
		} else if (todo.priority === "low") {
			byPriority.low.push(todo);
		} else if (todo.priority === "medium") {
			byPriority.medium.push(todo);
		} else {
			noPriority.push(todo);
		}
	}

	// Format high priority
	if (byPriority.high.length > 0) {
		lines.push("### High Priority");
		for (const todo of byPriority.high) {
			lines.push(`- **${todo.file}:${todo.line}** - ${todo.text}`);
		}
		lines.push("");
	}

	// Format medium priority
	if (byPriority.medium.length > 0) {
		lines.push("### Medium Priority");
		for (const todo of byPriority.medium) {
			lines.push(`- **${todo.file}:${todo.line}** - ${todo.text}`);
		}
		lines.push("");
	}

	// Format low priority
	if (byPriority.low.length > 0) {
		lines.push("### Low Priority");
		for (const todo of byPriority.low) {
			lines.push(`- **${todo.file}:${todo.line}** - ${todo.text}`);
		}
		lines.push("");
	}

	// Format no priority
	if (noPriority.length > 0) {
		if (byPriority.high.length > 0 || byPriority.medium.length > 0 || byPriority.low.length > 0) {
			lines.push("### Other");
		}
		for (const todo of noPriority) {
			lines.push(`- **${todo.file}:${todo.line}** - ${todo.text}`);
		}
	}

	return lines.join("\n");
}
