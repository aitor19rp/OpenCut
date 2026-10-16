import { describe, expect, test } from "bun:test";
import { distributeIntoLines, splitParagraphs } from "../translate-layout";

describe("splitParagraphs", () => {
	test("groups consecutive lines and keeps blank lines", () => {
		expect(splitParagraphs({ text: "a\nb\n\nc" })).toEqual([
			["a", "b"],
			[""],
			["c"],
		]);
	});
});

describe("distributeIntoLines", () => {
	test("single line stays as one line", () => {
		expect(
			distributeIntoLines({ translated: "Hello world", originalLines: ["Hola mundo"] }),
		).toEqual(["Hello world"]);
	});

	test("keeps the same number of lines, breaking between words", () => {
		const lines = distributeIntoLines({
			translated: 'Comment "Fortnie" if you want it ⛏️',
			originalLines: ['Comenta "Fortnie" si', "lo quieres ⛏️"],
		});
		expect(lines).toHaveLength(2);
		expect(lines.join(" ")).toBe('Comment "Fortnie" if you want it ⛏️');
		expect(lines.every((line) => line.length > 0)).toBe(true);
	});

	test("falls back to one line when there are fewer words than lines", () => {
		expect(
			distributeIntoLines({ translated: "Yes", originalLines: ["a", "b", "c"] }),
		).toEqual(["Yes"]);
	});
});
