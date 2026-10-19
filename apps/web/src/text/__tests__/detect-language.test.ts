import { describe, expect, test } from "bun:test";
import { detectLanguage } from "../detect-language";

describe("detectLanguage", () => {
	test("Spanish caption", () => {
		expect(detectLanguage({ text: 'Comenta "Fortnite" si lo quieres' })).toBe("es");
		expect(detectLanguage({ text: "¿Qué hacer cuando no tienes tiempo?" })).toBe("es");
	});
	test("German caption", () => {
		expect(detectLanguage({ text: "Kommentiere Fortnite wenn du es willst" })).toBe("de");
		expect(detectLanguage({ text: "Das ist nicht gut für mich" })).toBe("de");
	});
	test("English caption", () => {
		expect(detectLanguage({ text: "Comment Fortnite if you want it" })).toBe("en");
		expect(detectLanguage({ text: "This is the best day of my life" })).toBe("en");
	});
	test("unknown", () => {
		expect(detectLanguage({ text: "🔥🔥" })).toBeNull();
		expect(detectLanguage({ text: "" })).toBeNull();
	});
});
