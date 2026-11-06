# VocApp

Vocabulary trainer in the spirit of Memrise: Hebrew → Spanish (more languages planned).

- Learning sessions that climb from recognition to typed recall
- Spaced-repetition reviews scheduled with FSRS
- Works offline (PWA, IndexedDB); syncs across devices via Supabase

Live: https://ahikam84.github.io/vocapp/

## Development

```bash
npm install
npm run dev     # http://localhost:3000
npm test
```

Cloud sync needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`
and the schema in `supabase/schema.sql`.
