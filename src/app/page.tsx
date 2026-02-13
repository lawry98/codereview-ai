export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
            CodeReview AI
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Get instant AI-powered feedback on your code
          </p>
        </div>

        {/* Main Content Area */}
        <div className="max-w-5xl mx-auto">
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <p className="text-muted-foreground">
              Phase 1 Complete: Project Setup & Foundation ✓
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Code editor and analysis components will be added in Phase 2
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
