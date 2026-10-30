export function Tabs<T extends string>(props: { tabs: ReadonlyArray<{ id: T; label: string }>; active: T; onChange: (id: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {props.tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={tab.id === props.active}
          className={tab.id === props.active ? 'tab is-active' : 'tab'}
          onClick={() => props.onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
