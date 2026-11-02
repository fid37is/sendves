import { redirect } from "next/navigation";

/** Admins now live inside Settings. This keeps old links and bookmarks working. */
export default function AdminAdminsRedirect() {
  redirect("/settings#admins");
}
