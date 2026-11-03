const NATIVE_FOCUSABLE = new Set(["a", "button", "input", "select", "textarea"]);
const FOCUSABLE_ROLES = new Set(["button", "checkbox", "link", "radio", "textbox", "switch"]);

type Props = Record<string, unknown>;

/** La regola di Tamagui 1 sul tabIndex (usata da focusableRoles.ts), separata per poterla provare. */
export function focusTabIndex(elementType: unknown, props: Props): string | undefined {
  if (props.tabIndex != null) return undefined;
  const isFocusable = (props.focusable ?? props.accessible) as boolean | undefined;
  if (typeof elementType === "string" && NATIVE_FOCUSABLE.has(elementType)) {
    return isFocusable === false || props.accessibilityDisabled === true ? "-1" : undefined;
  }
  if (isFocusable === false) return "-1";
  if (isFocusable) return "0";
  return typeof props.role === "string" && FOCUSABLE_ROLES.has(props.role) ? "0" : undefined;
}
