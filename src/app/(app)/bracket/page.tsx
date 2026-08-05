import { redirect } from "next/navigation";

// The bracket now lives inside the combined prediction flow on /picks. Keep this
// route as a redirect so old links / bookmarks still land in the right place.
export default function Page() {
  redirect("/picks");
}
