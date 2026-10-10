/* Katef runs in two modes:

   • Demo mode (default — both values empty): everything is stored in this
     browser only. Good for trying the app, not for real people.

   • Live mode: create a free Supabase project, run supabase/schema.sql in its
     SQL editor, and paste the project URL and the *anon* public key here.
     Requests, organizations and messages are then shared between everyone,
     and row-level security keeps contact details private.
     (The anon key is meant to be public; security comes from the RLS rules.) */
export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "";

/* A request with no update for this many days is flagged "needs attention"
   and its claim can be taken over by another organization. */
export const STALE_CLAIM_DAYS = 7;
/* Open requests older than this ask their owner "is this still relevant?" */
export const EXPIRE_DAYS = 30;
