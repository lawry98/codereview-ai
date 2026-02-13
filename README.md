# CodeReview AI

An AI-powered code review tool that provides instant, intelligent feedback on your code. Identify bugs, security vulnerabilities, performance issues, and get actionable refactoring suggestions.

## Features

- 🤖 **AI-Powered Analysis** - Uses Claude Sonnet 4 for intelligent code review
- 🐛 **Bug Detection** - Identifies potential bugs and logic errors
- 🔒 **Security Scanning** - Detects security vulnerabilities and risks
- ⚡ **Performance Optimization** - Suggests performance improvements
- 📝 **Best Practices** - Ensures code follows industry standards
- ♻️ **Refactoring Suggestions** - Provides recommendations for cleaner code
- 💾 **Save & Share Reviews** - Save your reviews and share them with others
- 🎨 **Syntax Highlighting** - Beautiful code display with multi-language support
- 🔐 **Authentication** - Google OAuth and Magic Link sign-in
- 📊 **Review History** - Track all your past code reviews

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS + ShadCN UI
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth (Google OAuth + Magic Link)
- **AI**: Anthropic Claude API (claude-sonnet-4-20250514)
- **Code Editor**: react-simple-code-editor + prism-react-renderer
- **Deployment**: Vercel

## Supported Languages

JavaScript, TypeScript, Python, Java, C++, Go, Rust, C#, PHP, Ruby, Swift, Kotlin

## Getting Started

### Prerequisites

- Node.js 18+ installed
- An Anthropic API key ([Get one here](https://console.anthropic.com/))
- A Supabase account ([Sign up here](https://supabase.com/))

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd codereview-ai
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**

   Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

   Fill in your environment variables:
   ```env
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

4. **Set up Supabase**

   See [SETUP.md](./SETUP.md) for detailed Supabase configuration instructions.

5. **Run the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**

   Navigate to [http://localhost:3000](http://localhost:3000)

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Homepage with code editor
│   ├── layout.tsx         # Root layout
│   ├── review/[id]/       # Individual review pages
│   ├── history/           # Review history (protected)
│   ├── auth/              # Authentication pages
│   └── api/               # API routes
├── components/            # React components
│   ├── ui/               # ShadCN UI components
│   └── ...               # Custom components
├── lib/                  # Utility libraries
│   ├── anthropic.ts      # Claude API client
│   ├── supabase/         # Supabase clients
│   └── utils.ts          # Helper functions
├── types/                # TypeScript type definitions
└── prompts/              # AI prompt templates
```

## Usage

1. **Paste Your Code** - Copy and paste your code into the editor
2. **Select Language** - Choose your programming language from the dropdown
3. **Analyze** - Click the "Analyze Code" button
4. **Review Results** - Get categorized feedback on bugs, security, performance, and more
5. **Save & Share** - Sign in to save reviews and generate shareable links

## Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Import your repository on [Vercel](https://vercel.com)
3. Add your environment variables in the Vercel dashboard
4. Deploy!

Make sure to update `NEXT_PUBLIC_APP_URL` to your production URL.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anonymous key | Yes |
| `NEXT_PUBLIC_APP_URL` | Your app URL (for share links) | Yes |

## Rate Limits

- **Unauthenticated users**: 3 analyses per day
- **Authenticated users**: 20 analyses per day

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please open an issue on GitHub.

---

Built with ❤️ using Claude AI
