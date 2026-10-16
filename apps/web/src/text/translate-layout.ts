/**
 * Re-breaks a translated paragraph into the same number of lines the
 * original had, giving each line a share of the words proportional to the
 * original line's length. Breaks only fall between words.
 */
export function distributeIntoLines({
	translated,
	originalLines,
}: {
	translated: string;
	originalLines: string[];
}): string[] {
	if (originalLines.length <= 1) return [translated.trim()];
	const words = translated.trim().split(/\s+/).filter(Boolean);
	const totalLength = originalLines.reduce((sum, line) => sum + line.length, 0);
	if (words.length < originalLines.length || totalLength === 0) {
		return [translated.trim()];
	}

	const lines: string[] = [];
	let used = 0;
	let consumedLength = 0;
	originalLines.forEach((line, index) => {
		consumedLength += line.length;
		const isLast = index === originalLines.length - 1;
		const target = isLast
			? words.length
			: Math.round((consumedLength / totalLength) * words.length);
		// Leave at least one word for each remaining line.
		const remainingLines = originalLines.length - index - 1;
		const end = isLast
			? words.length
			: Math.min(Math.max(target, used + 1), words.length - remainingLines);
		lines.push(words.slice(used, end).join(" "));
		used = end;
	});
	return lines;
}

/** Groups consecutive non-empty lines into paragraphs; empty lines stay as-is. */
export function splitParagraphs({ text }: { text: string }): string[][] {
	const groups: string[][] = [];
	let current: string[] = [];
	for (const line of text.split("\n")) {
		if (line.trim()) {
			current.push(line);
		} else {
			if (current.length) groups.push(current);
			current = [];
			groups.push([line]);
		}
	}
	if (current.length) groups.push(current);
	return groups;
}
