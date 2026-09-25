"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Campo email/password dei moduli di accesso e registrazione, con un
 * `<input>` HTML nativo invece di `Field` (Tamagui/react-native-web) —
 * docs/CHANGELOG.md §151, bug reale segnalato dall'utente: su iPhone,
 * scrivendo la password in registrazione, Safari chiedeva "Salvare la
 * password?" a ogni carattere. Causa verificata nel DOM: a ogni tasto
 * react-native-web riscrive gli attributi `type`, `name` e `value` di tutti
 * i campi del modulo; per Safari un campo password che "cambia" a ogni tasto
 * è una password nuova da salvare. Non basta un `<input>` nativo gestito da
 * React: la build di React inclusa in Next, dopo OGNI evento di scrittura
 * su un campo che gestisce ("restore controlled state" → `updateInput`),
 * svuota `name` e riscrive `type`, anche se il campo non è controllato e la
 * pagina non si ridisegna. Per questo l'`<input>` qui è creato a mano
 * (`document.createElement`) dentro un contenitore: React non lo conosce e
 * non lo tocca mai; gli attributi cambiano solo quando cambia davvero
 * qualcosa (es. mostra/nascondi password), il testo arriva al modulo con un
 * listener nativo e, se il modulo cambia il valore da sé, si riallinea la
 * sola proprietà `value`.
 *
 * Stesse props di `Field` usate da questi moduli (label, hint, errore,
 * elemento a destra, `onChangeText`, `secureTextEntry`, `onSubmitEditing`)
 * così la sostituzione non cambia il codice dei moduli. Stesso aspetto di
 * `Field` (classi `.auth-field*` in globals.css).
 */
export function AuthField({
  label,
  hint,
  error,
  rightElement,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  autoComplete,
  nativeID,
  accessibilityLabel,
  onSubmitEditing,
}: {
  label: string;
  hint?: string;
  error?: string;
  rightElement?: ReactNode;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: "email-address" | "default";
  autoCapitalize?: "none" | "sentences";
  autoComplete?: string;
  nativeID?: string;
  accessibilityLabel?: string;
  onSubmitEditing?: () => void;
}) {
  const isEmail = keyboardType === "email-address";
  const containerRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onChangeRef = useRef(onChangeText);
  const onSubmitRef = useRef(onSubmitEditing);
  onChangeRef.current = onChangeText;
  onSubmitRef.current = onSubmitEditing;

  // Creazione una sola volta, fuori da React.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const input = document.createElement("input");
    input.value = value;
    input.addEventListener("input", () => onChangeRef.current(input.value));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && onSubmitRef.current) {
        e.preventDefault();
        onSubmitRef.current();
      }
    });
    container.appendChild(input);
    inputRef.current = input;
    return () => {
      input.remove();
      inputRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Attributi: scritti solo quando cambiano davvero.
  const type = secureTextEntry ? "password" : isEmail ? "email" : "text";
  const noCorrect = autoCapitalize === "none" || !!secureTextEntry || isEmail;
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const attrs: Record<string, string | null> = {
      id: nativeID ?? null,
      // `name` stabile: aiuta i gestori di password ad abbinare email e password.
      name: nativeID ?? null,
      type,
      inputmode: isEmail ? "email" : null,
      placeholder: placeholder ?? null,
      autocomplete: autoComplete ?? null,
      autocapitalize: autoCapitalize === "none" ? "none" : null,
      autocorrect: noCorrect ? "off" : null,
      spellcheck: noCorrect ? "false" : null,
      "aria-label": accessibilityLabel ?? null,
      "aria-invalid": error ? "true" : null,
    };
    for (const [name, attrValue] of Object.entries(attrs)) {
      if (attrValue === null) {
        if (input.hasAttribute(name)) input.removeAttribute(name);
      } else if (input.getAttribute(name) !== attrValue) {
        input.setAttribute(name, attrValue);
      }
    }
  }, [nativeID, type, isEmail, placeholder, autoComplete, autoCapitalize, noCorrect, accessibilityLabel, error]);

  // Valore cambiato dal modulo (es. svuotato): solo la proprietà, niente attributi.
  useEffect(() => {
    const input = inputRef.current;
    if (input && input.value !== value) input.value = value;
  }, [value]);

  return (
    <div className="auth-field">
      <label className="auth-field-label" htmlFor={nativeID}>
        {label}
      </label>
      <div className={`auth-field-box${error ? " has-error" : ""}`}>
        <span ref={containerRef} className="auth-field-slot" />
        {rightElement}
      </div>
      {error ? <span className="auth-field-error">{error}</span> : hint ? <span className="auth-field-hint">{hint}</span> : null}
    </div>
  );
}
