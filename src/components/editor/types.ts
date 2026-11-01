import type { Design, Logo } from "@/lib/email/campaign";

/** What Undo goes back through: the email's design and the shared logo. */
export type Doc = { design: Design; logo: Logo };

export type PickedContact = { id: string; email: string; name: string };
export type AudienceState = { mode: "all" | "custom"; listIds: string[]; contacts: PickedContact[] };

/** A person in the Preview step's contact list. `id` is NONE for "No contact data (fallbacks)". */
export const NO_CONTACT = "__none";

/**
 * Where a picked picture goes. `image` without a block adds a new Image block; with a block it replaces that
 * block's picture. `grid` is one cell of an Image grid.
 */
export type UploadTarget =
  | { kind: "logo" }
  | { kind: "banner" }
  | { kind: "image"; blockId?: string }
  | { kind: "grid"; blockId: string; index: number };
