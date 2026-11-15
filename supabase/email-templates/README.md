# Sign-in email templates

The app signs people in by email with a link and a 6-digit code (Supabase `signInWithOtp`). It keeps
the interface language as `lang` in the user's metadata (sent on sign-up, updated on every sync), so
one template serves Hebrew and English.

Paste into Supabase → Authentication → Emails → Templates, in **both** "Confirm signup" (a first
sign-in) and "Magic Link" (every sign-in after that):

- Subject: `subject.txt`
- Body (Source): `sign-in.html`

Without a `lang` (not synced since this was added) the email is in Hebrew.
