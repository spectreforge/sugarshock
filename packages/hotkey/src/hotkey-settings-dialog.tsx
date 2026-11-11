// Hotkey settings dialog and its menu item in the left column

import {
	type Action,
	type HotkeySettings,
	MAX_HINT_LENGTH,
} from "./hotkey-settings";
import {
	deriveShortcut,
	formatShortcut,
	PROTECTED_SHORTCUTS,
	MODIFIER_KEYS,
} from "./hotkey-shortcut";
import type { IntrinsicProps, JSX } from "@spectreforge/tiny-jsx2dom";
import type { StringLocalizer, NodeLocalizer, L10nKeys } from "./hotkey-i18n";
import { ACTIVATION_KEY } from "./hotkey-passthrough";

const DIALOG_CLASS = "hotkey-settings-dialog";
const MENU_ITEM_ID = "menu-item-hotkey-settings";

/**
 * `data-control` values of focusable controls after re-render.
 */
const CONTROL = Object.freeze({ ADD: "add", RESET: "reset" });
type Control = (typeof CONTROL)[keyof typeof CONTROL];

/**
 * Adds or relabels the menu item.
 *
 * @param onActivate Opens the settings dialog
 */
export function syncMenuItem(
	localizer: StringLocalizer,
	onActivate: () => void,
): void {
	const item = document.getElementById(MENU_ITEM_ID);
	const title = localizer.text("hotkeySettingsTitle");
	if (item) {
		item.firstElementChild!.textContent = title;
	} else {
		document.getElementById("menu-core")?.insertBefore(
			<li id={MENU_ITEM_ID}>
				<a ref={(el) => jQuery(el).ariaClick(onActivate)}>{title}</a>
			</li>,
			document.getElementById("menu-item-restart"),
		);
	}
}
export function removeMenuItem(): void {
	document.getElementById(MENU_ITEM_ID)?.remove();
}

interface SettingsDialogHooks {
	/**
	 * Called after the user modified the settings, e.g. to persist them.
	 */
	onChange: () => void;
	/**
	 * Called after the dialog was closed.
	 */
	onClose: () => void;
}

export function openSettingsDialog(
	localizer: NodeLocalizer,
	settings: HotkeySettings,
	{ onChange, onClose }: SettingsDialogHooks,
): void {
	const dialogCloseController = new AbortController();
	Dialog.create(localizer.text("hotkeySettingsTitle"), DIALOG_CLASS)
		.append(
			<HotkeySettingsPanel
				hotkeySettings={settings}
				signal={dialogCloseController.signal}
				onChange={onChange}
				localizer={localizer}
			/>,
		)
		.open(undefined, () => {
			dialogCloseController.abort();
			onClose();
		});
}

export function closeSettingsDialog(): void {
	if (Dialog.isOpen(DIALOG_CLASS)) {
		Dialog.close();
	}
}

export interface LocalizableProps {
	localizer: NodeLocalizer;
}

export interface HotkeySettingsPanelProps extends LocalizableProps {
	hotkeySettings: HotkeySettings;
	/**
	 * Should signal dialog closing. It triggers cleanup of event handlers and such.
	 */
	signal: AbortSignal;
	/**
	 * Called after the user changed a setting.
	 */
	onChange: () => void;
}

/**
 * The settings dialog content.
 */
export function HotkeySettingsPanel({
	hotkeySettings,
	signal: closeSignal,
	onChange,
	localizer,
}: HotkeySettingsPanelProps): JSX.Element {
	//////////////////////////////////////////////////////////////////////
	// lifetime management

	/**
	 * Cancels the currently active key capture.
	 */
	let activeCapture: AbortController | undefined;
	/**
	 * Timer of a delayed status message (see {@link announce})
	 */
	let pendingStatus: number | undefined = undefined;
	closeSignal.addEventListener(
		"abort",
		() => {
			activeCapture?.abort();
			pendingStatus && cancelAnimationFrame(pendingStatus);
		},
		{ once: true },
	);

	//////////////////////////////////////////////////////////////////////
	// static shell & dynamic rendering injection points

	// assigned via `ref`
	let tbody!: HTMLTableSectionElement;
	let status!: HTMLParagraphElement;

	const root = (
		<div className="hotkey-settings">
			<table className="hotkey-settings__table">
				<thead>
					<tr>
						<th scope="col">{localizer.text("hotkeySettingsHeaderAction")}</th>
						<th scope="col">
							{localizer.text("hotkeySettingsHeaderShortcut")}
						</th>
						<th scope="col">{localizer.text("hotkeySettingsHeaderHint")}</th>
						{/* the reset buttons speak for themselves when seen */}
						<th scope="col">
							<span className="hotkey-visually-hidden">
								{localizer.text("hotkeySettingsHeaderReset")}
							</span>
						</th>
					</tr>
				</thead>
				<tbody ref={(el) => (tbody = el)} />
			</table>
			<KeyNameHelp localizer={localizer} />
			<div className="hotkey-settings__footer">
				<p
					className="hotkey-settings__status"
					role="status"
					ref={(el) => (status = el)}
				/>
				<button
					type="button"
					onclick={() => {
						hotkeySettings.resetToDefaults();
						onDestructiveChange(localizer.text("hotkeySettingsStatusResetAll"));
					}}
				>
					{localizer.text("hotkeySettingsButtonResetAll")}
				</button>
			</div>
		</div>
	);

	renderRows();
	return root;

	//////////////////////////////////////////////////////////////////////

	interface FocusTarget {
		actionId: string;
		control: Control;
	}

	interface ActionProps {
		actionId: string;
		action: Readonly<Action>;
	}

	/**
	 * Common ceremony after changing a non-local setting.
	 *
	 * Needs to notify the caller, re-render the parts reflecting the new settings
	 * and update the status line for screen readers.
	 *
	 * @param focus which element had (and should keep) the focus
	 */
	function onDestructiveChange(message: string, focus?: FocusTarget) {
		onChange();
		// we re-render everything as changes can be non-local, e.g. when binding
		// a shortcut steals said shortcut from another action.
		renderRows(focus);
		announce(message);
	}

	/**
	 * Rebuilds all action table rows.
	 *
	 * @param focus which element had (and should keep) the focus
	 */
	function renderRows(focus?: FocusTarget) {
		activeCapture?.abort();
		tbody.replaceChildren(
			...Object.entries(hotkeySettings.actions).map(([actionId, action]) => (
				<ActionRow actionId={actionId} action={action} />
			)),
		);
		if (focus != null) {
			const target = tbody.querySelector<HTMLElement>(
				`tr[data-action-id="${CSS.escape(focus.actionId)}"] [data-control="${focus.control}"]`,
			);
			target?.focus();
		}
	}

	/**
	 * Sets a status message to inform the user about the outcome of their action,
	 * e.g. that capture failed due to pressing a protected key.
	 */
	function announce(message: string) {
		pendingStatus && cancelAnimationFrame(pendingStatus);
		// Live regions only announce changes
		// => we need to un-set and set the message if we get the same announcement
		//    twice in a row.
		if (message === "" || status.textContent !== message) {
			status.textContent = message;
			return;
		}
		status.textContent = "";
		pendingStatus = requestAnimationFrame(() => (status.textContent = message));
	}

	function ActionRow({ actionId, action }: ActionProps): JSX.Element {
		const shortcuts = hotkeySettings.shortcutsForActionId(actionId);
		const l10nVars = { action: action.name };
		return (
			<tr dataset={{ actionId }}>
				<th scope="row">{action.name}</th>
				<td className="hotkey-settings__shortcuts">
					<div className="hotkey-chip-list">
						<AddChip actionId={actionId} action={action} />
						{shortcuts.map((shortcut) => (
							<BindingChip
								actionId={actionId}
								action={action}
								shortcut={shortcut}
							/>
						))}
					</div>
				</td>
				<td>
					{action.type === "link-click" && (
						<HintInput actionId={actionId} action={action} />
					)}
				</td>
				<td>
					<Button
						title={localizer.text("hotkeySettingsLabelReset", l10nVars)}
						className="hotkey-icon-button hotkey-icon-button--danger hotkey-settings__reset"
						dataset={{ control: CONTROL.RESET }}
						onclick={() => {
							hotkeySettings.resetBindings(actionId);
							hotkeySettings.resetHint(actionId);
							onDestructiveChange(
								localizer.text("hotkeySettingsStatusReset", l10nVars),
								{
									actionId,
									control: CONTROL.RESET,
								},
							);
						}}
					/>
				</td>
			</tr>
		);
	}

	function HintInput({ actionId, action }: ActionProps): JSX.Element {
		return (
			<input
				type="text"
				className="hotkey-settings__hint"
				maxLength={MAX_HINT_LENGTH}
				value={hotkeySettings.userHintForActionId(actionId) ?? ""}
				placeholder={
					hotkeySettings.defaultHintForActionId(actionId) ?? "\u2013"
				}
				ariaLabel={localizer.text("hotkeySettingsLabelHint", {
					action: action.name,
				})}
				onchange={(ev) => {
					const input = ev.currentTarget as HTMLInputElement;
					let userHint: string | null;
					try {
						userHint = hotkeySettings.setHint(actionId, input.value);
					} catch (error) {
						console.error(error);
						input.value = hotkeySettings.userHintForActionId(actionId) ?? "";
						announce(
							localizer.text("hotkeySettingsStatusHintInvalid", {
								action: action.name,
							}),
						);
						return;
					}
					input.value = userHint ?? "";
					// changing the hint is completely localized => no need to re-render
					onChange();
					const defaultHint = hotkeySettings.defaultHintForActionId(actionId);
					announce(
						localizer.text(
							userHint != null
								? "hotkeySettingsStatusHintSet"
								: defaultHint
									? "hotkeySettingsStatusHintDefault"
									: "hotkeySettingsStatusHintNone",
							{ action: action.name, hint: userHint ?? defaultHint ?? "" },
						),
					);
				}}
			/>
		);
	}

	/**
	 * The "add" chip which starts shortcut capture.
	 */
	function AddChip({ actionId, action }: ActionProps): JSX.Element {
		return (
			<Button
				title={localizer.text("hotkeySettingsLabelAdd", {
					action: action.name,
				})}
				className="hotkey-chip hotkey-chip--add"
				ariaPressed="false"
				ariaDescription={localizer.text("hotkeySettingsDescriptionAdd")}
				dataset={{ control: CONTROL.ADD }}
				onclick={(ev) =>
					captureShortcut(
						actionId,
						action,
						ev.currentTarget as HTMLButtonElement,
					)
				}
			>
				{/* visible while capturing, otherwise it's just a "+" icon button (see CSS) */}
				<span className="hotkey-chip__prompt" ariaHidden="true">
					{localizer.text("hotkeySettingsButtonCapture")}
				</span>
			</Button>
		);
	}

	/**
	 * A chip for a single binding.
	 */
	function BindingChip({
		actionId,
		action,
		shortcut,
	}: ActionProps & { shortcut: string }): JSX.Element {
		const label = formatShortcut(shortcut);
		const l10nVars = { shortcut: label, action: action.name };
		return (
			<span className="hotkey-chip">
				<kbd>{label}</kbd>
				<Button
					title={localizer.text("hotkeySettingsLabelRemove", l10nVars)}
					className="hotkey-icon-button hotkey-icon-button--danger hotkey-chip__remove"
					onclick={() => {
						hotkeySettings.setBinding(shortcut, null);
						onDestructiveChange(
							localizer.text("hotkeySettingsStatusRemoved", l10nVars),
							{
								actionId,
								control: CONTROL.ADD,
							},
						);
					}}
				/>
			</span>
		);
	}

	/**
	 * Captures the next key press and binds it to the given action.
	 * Clicking the button again or pressing Escape cancels.
	 */
	function captureShortcut(
		actionId: string,
		action: Readonly<Action>,
		btn: HTMLButtonElement,
	) {
		const cancelMessage = localizer.text("hotkeySettingsStatusCaptureCancel", {
			action: action.name,
		});
		if (btn.ariaPressed === "true") {
			activeCapture?.abort(cancelMessage); // same button
			return;
		}
		activeCapture?.abort(); // steal capture from other button

		const captureController = (activeCapture = new AbortController());
		const captureAbortSignal = captureController.signal;
		btn.ariaPressed = "true";
		announce(
			localizer.text("hotkeySettingsStatusCaptureStart", {
				action: action.name,
			}),
		);
		captureAbortSignal.addEventListener("abort", () => {
			btn.ariaPressed = "false";
			if (typeof captureAbortSignal.reason === "string" && root.isConnected) {
				announce(captureAbortSignal.reason);
			}
		});

		btn.addEventListener(
			"blur",
			() => {
				// switching to another window keeps capturing
				if (document.hasFocus()) {
					captureController.abort();
					if (root.isConnected) {
						announce("");
					}
				}
			},
			{ signal: captureAbortSignal },
		);

		window.addEventListener(
			"keydown",
			(e) => {
				if (!root.isConnected) {
					// someone called `Dialog.open()` without closing this dialog first
					captureController.abort();
					return;
				}
				if (e.isComposing || e.repeat || MODIFIER_KEYS.includes(e.key)) {
					return;
				}
				// virtual keyboards (e.g. on-screen Android keyboards) usually don't
				// report physical keys but "" or "Unidentified"
				// => nothing we can do.
				if (e.code === "" || e.code === "Unidentified") {
					captureController.abort(
						localizer.text("hotkeySettingsStatusCaptureUnidentified"),
					);
					return;
				}
				const shortcut = deriveShortcut(e);
				if (PROTECTED_SHORTCUTS.includes(shortcut)) {
					// only prevent passthrough, if we would activate the button again
					if (e.target === btn && ACTIVATION_KEY.test(shortcut)) {
						e.preventDefault();
					}
					captureController.abort(
						localizer.text("hotkeySettingsStatusCaptureProtected", {
							shortcut: formatShortcut(shortcut),
						}),
					);
					return;
				}
				// Also keeps the global handler from closing the dialog on Escape
				e.preventDefault();
				e.stopPropagation();
				// Swallow the matching keyup; e.g. Space activates buttons on keyup
				const swallow = new AbortController();
				window.addEventListener(
					"blur",
					() => {
						swallow.abort();
					},
					{ signal: swallow.signal },
				);
				window.addEventListener(
					"keyup",
					(ev) => {
						if (ev.code === e.code) {
							ev.preventDefault();
							ev.stopPropagation();
							swallow.abort();
						}
					},
					{ capture: true, signal: swallow.signal },
				);

				const isCancelKey = e.key === "Escape";
				captureController.abort(isCancelKey ? cancelMessage : undefined);
				if (isCancelKey) {
					return;
				}

				const previousActionId = hotkeySettings.setBinding(shortcut, actionId);
				const previousAction =
					previousActionId === null
						? undefined
						: hotkeySettings.actions[previousActionId];
				const message = localizer.text(
					previousActionId === actionId
						? "hotkeySettingsStatusUnchanged"
						: previousAction
							? "hotkeySettingsStatusMoved"
							: "hotkeySettingsStatusAdded",
					{
						shortcut: formatShortcut(shortcut),
						action: action.name,
						previousAction: previousAction?.name ?? "",
					},
				);
				onDestructiveChange(message, { actionId, control: CONTROL.ADD });
			},
			{ capture: true, signal: captureAbortSignal },
		);
	}
}

function Button(props: IntrinsicProps<"button">): JSX.Element {
	return <button {...props} type="button" />;
}

/**
 * Explains how to read the shortcut chips, and their technical oddities to the
 * user.
 */
function KeyNameHelp({ localizer }: LocalizableProps): JSX.Element {
	// mimics the binding chips
	const key = (label: string) => (
		<span className="hotkey-chip">
			<kbd>{label}</kbd>
		</span>
	);
	const item = (stringKey: L10nKeys, keys: Record<string, Node> = {}) => (
		<li>{localizer.nodes(stringKey, keys)}</li>
	);

	return (
		<details className="hotkey-settings__help">
			<summary>{localizer.text("hotkeyHelpTitle")}</summary>
			<ul>
				{item("hotkeyHelpTextCapture")}
				{item("hotkeyHelpTextLayout", { keyQ: key("Q"), keyA: key("A") })}
				{item("hotkeyHelpTextHints")}
				{item("hotkeyHelpTextNumpad", { keyNumpad1: key("Numpad1") })}
				{item("hotkeyHelpTextModifiers", {
					keyMeta: key("Meta"),
					keyAlt: key("Alt"),
				})}
			</ul>
		</details>
	);
}
