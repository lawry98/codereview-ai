'use client';

import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Code2 } from 'lucide-react';

interface LanguageSelectorProps {
  value: SupportedLanguage;
  onChange: (value: SupportedLanguage) => void;
}

export default function LanguageSelector({ value, onChange }: LanguageSelectorProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[200px] bg-card border-border">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-muted-foreground" />
          <SelectValue placeholder="Select language" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <SelectItem key={lang.value} value={lang.value}>
            {lang.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
