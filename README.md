# E-Learning Ville OPCR

Web app for the Office Performance Commitment and Review process of E-Learning Ville, LGU Mauban.

- **My Tally:** each staff member enters January–June and July–December counts against their personal targets (the Excel “tally per person” sheet).
- **Tally board:** heads/admins set those targets and watch office totals.
- **My OPCR:** year-end narrative, remarks, and CSC ratings.

## Setup

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run in order:
   - `supabase/schema.sql`
   - `supabase/seed.sql`
   - `supabase/seed_tally.sql`
   - `supabase/roster.sql`
   - `supabase/admin_users.sql` (needed so admins can add/delete logins on the Users page)
3. If you already ran the first schema before tally support existed, also run `supabase/tally.sql`, then `supabase/roster.sql`.
4. Copy `.env.example` to `.env` and add the project URL and anon key from **Project Settings → API**.
5. Create the first admin account, then use **Users** in the app to add staff logins and roster names.
6. Promote the first admin (replace the email):

```sql
update public.profiles
set role = 'admin',
    full_name = 'Your Name',
    short_name = 'HEAD',
    position = 'Center Manager'
where id = (select id from auth.users where email = 'you@example.com');
```

7. Install and start the app:

```bash
npm install
npm run dev
```

After the first admin can sign in, open **Users** to review the office roster (Manel, Irma, Joy, JM, Rio, JC, Erika, Jayvee, Annaliza, Conchita). Link each login to a roster name so their My Tally counts appear in that column. Use **Show on tally board** if the head/admin should also have a column. Then open **Tally board** and enter each person’s semester targets.

## Roles

- **Staff:** My Tally (numeric accomplishments) and My OPCR (narrative).
- **Admin / Head / Manager:** tally board, ratings overview, user roles, plus their own tally and OPCR.

Ratings use the CSC 1–5 scale. **A** is the average of Quality, Efficiency, and Timeliness.
