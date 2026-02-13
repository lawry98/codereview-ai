'use client';

import { useState, useCallback } from 'react';
import { Highlight, themes } from 'prism-react-renderer';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: string;
  placeholder?: string;
  maxLength?: number;
}

const MAX_CHARACTERS = 10000;

// Map our language values to Prism language identifiers
const LANGUAGE_MAP: Record<string, any> = {
  javascript: 'javascript',
  typescript: 'typescript',
  python: 'python',
  java: 'java',
  cpp: 'cpp',
  go: 'go',
  rust: 'rust',
  csharp: 'csharp',
  php: 'php',
  ruby: 'ruby',
  swift: 'swift',
  kotlin: 'kotlin',
};

export default function CodeEditor({
  value,
  onChange,
  language,
  placeholder = '// Paste your code here...',
  maxLength = MAX_CHARACTERS,
}: CodeEditorProps) {
  const [lineCount, setLineCount] = useState(1);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      // Enforce max length
      if (newValue.length <= maxLength) {
        onChange(newValue);
        setLineCount(newValue.split('\n').length);
      }
    },
    [onChange, maxLength]
  );

  const characterCount = value.length;
  const isNearLimit = characterCount > maxLength * 0.9;
  const isAtLimit = characterCount >= maxLength;
  const prismLang = LANGUAGE_MAP[language] || 'javascript';

  return (
    <div className="space-y-2">
      <div className="relative border border-border rounded-lg bg-[#1e1e1e] overflow-hidden">
        <div className="min-h-[300px] max-h-[600px] overflow-auto custom-scrollbar">
          <Highlight theme={themes.vsDark} code={value || ''} language={prismLang}>
            {({ style, tokens, getLineProps, getTokenProps }) => (
              <div className="relative">
                {/* Rendered code with syntax highlighting */}
                <pre
                  style={style}
                  className="font-mono text-sm p-4 pointer-events-none absolute inset-0 overflow-hidden"
                >
                  {tokens.map((line, i) => (
                    <div key={i} {...getLineProps({ line })}>
                      {line.map((token, key) => (
                        <span key={key} {...getTokenProps({ token })} />
                      ))}
                    </div>
                  ))}
                </pre>

                {/* Textarea for input */}
                <textarea
                  value={value}
                  onChange={handleChange}
                  placeholder={placeholder}
                  className="font-mono text-sm p-4 w-full min-h-[300px] bg-transparent text-transparent caret-white relative z-10 resize-none focus:outline-none"
                  style={{
                    fontFamily: '"Fira Code", "Consolas", "Monaco", monospace',
                    caretColor: 'white',
                  }}
                  spellCheck={false}
                />
              </div>
            )}
          </Highlight>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <div className="flex items-center gap-4">
          <span>{lineCount} lines</span>
          <span
            className={`${
              isAtLimit
                ? 'text-red-500 font-medium'
                : isNearLimit
                ? 'text-amber-500'
                : ''
            }`}
          >
            {characterCount.toLocaleString()} / {maxLength.toLocaleString()} characters
          </span>
        </div>
        {isAtLimit && (
          <span className="text-red-500 font-medium">Character limit reached</span>
        )}
      </div>
    </div>
  );
}
