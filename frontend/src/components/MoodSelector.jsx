/**
 * MoodSelector — paper-toned filter chips (mood + "all").
 */
const MOODS = [
  { label: 'Hepsi',      value: null,          color: '#1F1B16' },
  { label: 'Eğlenceli',  value: 'Eğlenceli',   color: '#7A8A5C' },
  { label: 'Melankolik', value: 'Melankolik',  color: '#3B5475' },
  { label: 'Gergin',     value: 'Gergin',      color: '#A23E2C' },
  { label: 'Çerezlik',   value: 'Çerezlik',    color: '#C76E2A' },
  { label: 'Ağır Dram',  value: 'Ağır Dram',   color: '#2E2820' },
  { label: 'Heyecanlı',  value: 'Heyecanlı',   color: '#E8B84A' },
];

export default function MoodSelector({ activeMood, onSelect }) {
  return (
    <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1">
      <span className="mr-1 whitespace-nowrap font-mono text-[10px] tracking-[1.5px] text-ink-mute">MOD ·</span>
      {MOODS.map((mood) => {
        const active = activeMood === mood.value;
        return (
          <button
            key={mood.label}
            onClick={() => onSelect(mood.value)}
            className={`flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 font-mono text-[11px] tracking-[0.3px] transition-colors ${
              active
                ? 'border-ink bg-ink text-paper-warm'
                : 'border-line bg-white/40 text-ink-soft hover:border-ink hover:text-ink'
            }`}
            style={active ? { boxShadow: `2px 2px 0 ${mood.color}` } : {}}
          >
            {mood.value && <span className="h-1.5 w-1.5 rounded-full" style={{ background: mood.color }} />}
            {mood.label}
          </button>
        );
      })}
    </div>
  );
}
