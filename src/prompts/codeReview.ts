/**
 * Generate the code review prompt for Claude
 */
export function generateCodeReviewPrompt(code: string, language: string): string {
  return `You are an expert code reviewer with 15 years of experience across multiple programming languages and frameworks. Your task is to perform a comprehensive code review and provide actionable feedback.

**CODE TO REVIEW:**
Language: ${language}

\`\`\`${language}
${code}
\`\`\`

**YOUR TASK:**
Analyze this code thoroughly and provide feedback in the following categories:
1. **Bugs** - Logic errors, potential runtime errors, edge cases not handled
2. **Security** - Vulnerabilities, injection risks, authentication/authorization issues, data exposure
3. **Performance** - Inefficient algorithms, memory leaks, unnecessary computations, database query optimization
4. **Best Practices** - Code style, naming conventions, code organization, maintainability
5. **Refactoring** - Opportunities to improve code structure, reduce complexity, improve readability

**IMPORTANT INSTRUCTIONS:**
- Be specific and reference line numbers when possible
- Provide code snippets showing how to fix issues
- If the code is well-written, don't invent problems - it's okay to have empty categories
- Give an overall score from 1-10 (1 = critical issues, 10 = excellent code)
- If there are significant improvements needed, provide a full improved version of the code

**OUTPUT FORMAT:**
You MUST respond with ONLY valid JSON (no markdown, no code fences, no additional text). Use this exact structure:

{
  "summary": "A 1-2 sentence overview of the code quality",
  "overallScore": 7,
  "categories": {
    "bugs": [
      {
        "severity": "critical" | "warning" | "info",
        "line": 5,
        "issue": "Description of the bug",
        "suggestion": "How to fix it",
        "fixedCode": "code snippet showing the fix"
      }
    ],
    "security": [],
    "performance": [],
    "bestPractices": [],
    "refactoring": []
  },
  "improvedCode": "Full improved version of the code (only if significant changes needed, otherwise null)"
}

**SEVERITY LEVELS:**
- "critical" - Will cause errors, security vulnerabilities, or major issues
- "warning" - Should be fixed but won't break functionality
- "info" - Suggestions for improvement, best practices

Remember: Output ONLY the JSON, nothing else. No markdown, no backticks, no explanations outside the JSON.`;
}
