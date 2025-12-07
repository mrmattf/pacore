interface Props {
  value: string;
  onChange: (provider: string) => void;
}

const PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic Claude' },
  { id: 'openai', name: 'OpenAI' },
  { id: 'ollama', name: 'Ollama (Local)' },
];

export function ProviderSelector({ value, onChange }: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-1.5 border rounded text-sm"
    >
      {PROVIDERS.map((provider) => (
        <option key={provider.id} value={provider.id}>
          {provider.name}
        </option>
      ))}
    </select>
  );
}
