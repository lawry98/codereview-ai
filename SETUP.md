# Supabase Setup Guide

This guide will walk you through setting up Supabase for CodeReview AI, including database tables, authentication, and security policies.

## 1. Create a Supabase Project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Click "New Project"
3. Fill in your project details:
   - **Name**: codereview-ai (or your preferred name)
   - **Database Password**: Choose a strong password (save this!)
   - **Region**: Select the closest region to your users
4. Click "Create new project"
5. Wait for your project to be provisioned (takes ~2 minutes)

## 2. Get Your API Keys

1. In your Supabase project dashboard, go to **Settings** → **API**
2. Copy the following values to your `.env.local` file:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon/public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 3. Set Up the Database

### Create the Reviews Table

1. In your Supabase dashboard, go to **SQL Editor**
2. Click **New Query**
3. Paste the following SQL and click **Run**:

```sql
-- Reviews table
CREATE TABLE reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  language VARCHAR(50) NOT NULL,
  analysis JSONB NOT NULL,
  overall_score INTEGER CHECK (overall_score >= 1 AND overall_score <= 10),
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX idx_reviews_user_id ON reviews(user_id);
CREATE INDEX idx_reviews_created_at ON reviews(created_at DESC);
CREATE INDEX idx_reviews_public ON reviews(id) WHERE is_public = TRUE;

-- Row Level Security (RLS)
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Users can read their own reviews
CREATE POLICY "Users can view own reviews"
  ON reviews FOR SELECT
  USING (auth.uid() = user_id);

-- Anyone can view public reviews (for share links)
CREATE POLICY "Anyone can view public reviews"
  ON reviews FOR SELECT
  USING (is_public = TRUE);

-- Users can insert their own reviews
CREATE POLICY "Users can insert own reviews"
  ON reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own reviews (toggle public)
CREATE POLICY "Users can update own reviews"
  ON reviews FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own reviews
CREATE POLICY "Users can delete own reviews"
  ON reviews FOR DELETE
  USING (auth.uid() = user_id);
```

You should see a success message: "Success. No rows returned"

## 4. Configure Authentication

### Enable Google OAuth

1. Go to **Authentication** → **Providers** in your Supabase dashboard
2. Find **Google** in the list and click to expand
3. Toggle **Enable Sign in with Google** to ON

#### Get Google OAuth Credentials

4. Go to [Google Cloud Console](https://console.cloud.google.com/)
5. Create a new project or select an existing one
6. Go to **APIs & Services** → **Credentials**
7. Click **Create Credentials** → **OAuth 2.0 Client ID**
8. Configure the OAuth consent screen if prompted:
   - User Type: External
   - App name: CodeReview AI
   - User support email: your email
   - Developer contact: your email
9. For Application type, select **Web application**
10. Add Authorized redirect URIs:
    - `https://<your-project-ref>.supabase.co/auth/v1/callback`
    - Replace `<your-project-ref>` with your actual Supabase project reference
11. Click **Create**
12. Copy the **Client ID** and **Client Secret**

#### Add to Supabase

13. Back in Supabase, paste the **Client ID** and **Client Secret** into the Google provider settings
14. Click **Save**

### Enable Email Auth (Magic Link)

1. In **Authentication** → **Providers**, find **Email**
2. Make sure **Enable Email provider** is toggled ON
3. Toggle **Confirm email** to OFF (for easier testing, enable in production)
4. Click **Save**

### Configure Redirect URLs

1. Go to **Authentication** → **URL Configuration**
2. Add the following to **Redirect URLs**:
   - `http://localhost:3000/auth/callback` (for development)
   - `https://your-production-domain.com/auth/callback` (for production)
3. Click **Save**

## 5. Test Your Setup

### Test Database Connection

1. In Supabase SQL Editor, run:
```sql
SELECT * FROM reviews;
```
You should see an empty table with no errors.

### Test Authentication

Once you've deployed your app:

1. Go to your app's login page
2. Try signing in with Google
3. Check **Authentication** → **Users** in Supabase to see your user

## 6. Production Checklist

Before deploying to production:

- [ ] Enable email confirmation (Authentication → Email provider)
- [ ] Set up custom SMTP (Authentication → Email → SMTP Settings)
- [ ] Add your production URL to redirect URLs
- [ ] Update Google OAuth redirect URIs with production URL
- [ ] Review and test all RLS policies
- [ ] Set up database backups (Database → Backups)
- [ ] Monitor usage (Settings → Usage)

## 7. Optional: Set Up Database Backups

1. Go to **Database** → **Backups**
2. Backups are automatic on paid plans
3. On free tier, you can use `pg_dump` to create manual backups

## Troubleshooting

### "Auth session missing" error
- Make sure you've set up the auth callback route correctly
- Check that redirect URLs are configured in Supabase
- Verify environment variables are set correctly

### "Row Level Security" blocking queries
- Make sure RLS policies are created correctly
- Test queries in SQL Editor with different user contexts
- Check that `auth.uid()` matches the `user_id` in your table

### Google OAuth not working
- Verify redirect URI exactly matches (including https://)
- Make sure OAuth consent screen is configured
- Check that Google OAuth is enabled in Supabase

## Need Help?

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Discord](https://discord.supabase.com/)
- [Next.js + Supabase Guide](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)

---

Once you've completed this setup, you're ready to run the app! 🚀
