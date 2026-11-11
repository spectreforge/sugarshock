/// <reference types="@spectreforge/sugarcube-hotkey" />
try {
	Hotkey.initialize();
} catch (e) {
	console.error("Failed to initialize hotkey module:", e);
}
