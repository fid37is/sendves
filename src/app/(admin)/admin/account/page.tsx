import { redirect } from "next/navigation";

/** "My account" now lives inside Settings. This keeps old links and bookmarks working. */
export default function AdminAccountRedirect() {
  redirect("/settings#account");
}
