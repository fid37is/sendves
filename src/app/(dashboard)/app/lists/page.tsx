import { redirect } from "next/navigation";

/** Lists now live inside the Contacts page. This keeps old links and bookmarks working. */
export default function ListsPage() {
  redirect("/app/contacts");
}