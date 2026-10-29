/** Result of a form action. The message is shown as a toast, never inline. */
export type FormState = { error?: string; success?: string; warning?: string; info?: string };
export const initialFormState: FormState = {};
